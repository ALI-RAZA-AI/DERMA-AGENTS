"""Reusable inference: predict_skin_disease(image).

Returns predicted class, calibrated probabilities, confidence, conformal
prediction set, model info and supported-class info. Instead of forcing a
disease label it returns a warning when:
  * the image is invalid (cannot be decoded, too small, nearly uniform),
  * image quality is outside the training distribution (very blurred / dark / bright),
  * the embedding is out-of-distribution (Mahalanobis score > threshold validated
    at the 99th percentile of in-distribution validation images),
  * the calibrated confidence is below the risk-controlled threshold tau AND the
    90% conformal prediction set is not a single class (see ml/selective.py),
  * the top class is a dataset class outside the DermaAgents proposal scope.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

import cv2
import joblib
import numpy as np
from scipy.special import softmax
from sklearn.preprocessing import normalize

from ..config import MODEL_REPORTS_DIR, MODELS_DIR, REPORTS_DIR
from .backbones import make_backbone

_lock = threading.Lock()
_STATE: dict[str, Any] = {}


def _load():
    with _lock:
        if _STATE:
            return _STATE
        meta = json.loads((MODELS_DIR / "model_metadata.json").read_text())
        head = joblib.load(MODELS_DIR / "head.joblib")
        _STATE.update(meta=meta, head=head, backbone=make_backbone(meta["backbone"], threads=int(os.environ.get("DERMA_ORT_THREADS", "2"))))
        ev = MODEL_REPORTS_DIR / "evaluation_results.json"
        _STATE["eval"] = json.loads(ev.read_text()) if ev.exists() else {}
        return _STATE


def model_available() -> bool:
    return (MODELS_DIR / "model_metadata.json").exists() and (MODELS_DIR / "head.joblib").exists()


def decode_image(image) -> np.ndarray | None:
    if isinstance(image, np.ndarray):
        return image
    if isinstance(image, (str, Path)):
        return cv2.imread(str(image), cv2.IMREAD_COLOR)
    if isinstance(image, (bytes, bytearray, memoryview)):
        return cv2.imdecode(np.frombuffer(bytes(image), np.uint8), cv2.IMREAD_COLOR)
    raise TypeError("image must be a path, bytes or a BGR numpy array")


def _quality(img: np.ndarray, ref: dict) -> list[str]:
    warns = []
    h, w = img.shape[:2]
    if min(h, w) < ref.get("min_side_px", 64):
        warns.append(f"Image too small ({w}x{h}); at least 64 px per side is required.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if float(gray.std()) < 4:
        warns.append("Image is nearly uniform - no visible skin lesion content.")
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if ref.get("blur_laplacian_var_p0_5") and blur < ref["blur_laplacian_var_p0_5"]:
        warns.append("Image is more blurred than 99.5% of training images.")
    mi = float(img.mean())
    if ref.get("mean_intensity_p0_5") and not (ref["mean_intensity_p0_5"] <= mi <= ref["mean_intensity_p99_5"]):
        warns.append("Image brightness is outside the range seen in training data.")
    return warns


def model_info() -> dict:
    s = _load()
    m, ev = s["meta"], s.get("eval", {})
    tm = ev.get("test_metrics", {})
    return {"name": m["name"], "version": m["version"], "backbone": m["backbone"],
            "backbone_source": m["backbone_source"], "head": m["head"],
            "test_accuracy": tm.get("accuracy"), "test_macro_f1": tm.get("macro_f1"),
            "conformal_coverage_target": 1 - m["conformal_alpha"],
            "conformal_test_coverage": ev.get("conformal", {}).get("test_empirical_coverage"),
            "ood_threshold": m["ood_threshold"], "temperature": m["temperature"],
            "selective_threshold": m.get("selective_tau"), "selective": m.get("selective"),
            "intended_use": m["intended_use"]}


def supported_classes() -> dict:
    m = _load()["meta"]
    return {"enabled": list(m["enabled_classes"].values()),
            "enabled_map": m["enabled_classes"],
            "disabled_proposal_classes": m["disabled_proposal_classes"],
            "recognised_out_of_scope": [c for c in m["classes"] if c not in m["enabled_classes"]]}


def predict_skin_disease(image) -> dict:
    """Run the trained classifier with validated uncertainty / rejection checks."""
    if not model_available():
        return {"status": "model_unavailable", "warning": "Trained model checkpoint not found.",
                "predicted_class": None}
    s = _load()
    meta, head = s["meta"], s["head"]
    base = {"model": model_info(), "supported_classes": supported_classes()}
    try:
        img = decode_image(image)
    except Exception as e:  # noqa: BLE001
        img, err = None, str(e)
    else:
        err = None
    if img is None:
        return {**base, "status": "invalid_image", "predicted_class": None,
                "warning": f"Could not decode the image{': ' + err if err else ''}. Upload a JPEG or PNG photo."}
    q = _quality(img, meta.get("image_quality", {}))
    hard = [w for w in q if "too small" in w or "uniform" in w]
    if hard:
        return {**base, "status": "invalid_image", "predicted_class": None, "warning": " ".join(hard),
                "quality_warnings": q}

    emb = normalize(s["backbone"].embed_images([img], tta_flip=True))
    z = head["pca"].transform(emb)
    logits = head["clf"].decision_function(z)
    probs = softmax(logits / meta["temperature"], axis=1)[0]
    classes = meta["classes"]
    order = np.argsort(-probs)
    top = classes[int(order[0])]
    conf = float(probs[order[0]])
    pset = [classes[i] for i in order if probs[i] >= 1 - meta["conformal_qhat"]]
    d = z[:, None, :] - head["maha_mu"][None]
    ood_score = float(np.einsum("nkd,de,nke->nk", d, head["maha_prec"], d).min())
    ood = ood_score > meta["ood_threshold"]
    enabled = meta["enabled_classes"]

    flags = []
    if ood:
        flags.append("out_of_distribution")
    tau = meta.get("selective_tau", 1.0)
    confident = len(pset) == 1 or conf >= tau
    if not confident:
        flags.append("below_validated_confidence")
    if q:
        flags.append("image_quality")
    if top not in enabled:
        flags.append("outside_supported_scope")

    if ood:
        status, warning = "rejected_ood", ("The image does not resemble the clinical skin photographs the model was "
                                           "trained on (out-of-distribution). No disease prediction is made.")
    elif top not in enabled:
        status, warning = "outside_scope", (f"Most similar dataset class is '{top}', which is not one of the "
                                            f"DermaAgents supported diseases. No supported-disease prediction is made.")
    elif not confident:
        status, warning = "uncertain", (f"Confidence {conf:.2f} is below the validated threshold {tau:.2f} and the 90% "
                                        f"conformal prediction set contains {len(pset)} classes "
                                        f"({', '.join(pset[:5])}{'...' if len(pset) > 5 else ''}). Further assessment required.")
    else:
        status, warning = "confident", None
    return {
        **base,
        "status": status,
        "predicted_class": enabled.get(top) if status in ("confident", "uncertain") else None,
        "top_dataset_class": top,
        "confidence": round(conf, 4),
        "class_probabilities": {c: round(float(p), 4) for c, p in sorted(zip(classes, probs), key=lambda t: -t[1])},
        "prediction_set": pset,
        "ood_score": round(ood_score, 2),
        "flags": flags,
        "warning": warning,
        "quality_warnings": q,
        "disclaimer": "Academic simulation only - not a medical diagnosis.",
    }
