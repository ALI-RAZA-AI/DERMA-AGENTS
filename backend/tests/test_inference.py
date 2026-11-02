"""Model inference tests: valid predictions, rejection of invalid / OOD / ambiguous inputs."""
import json

import cv2
import numpy as np
import pytest

from conftest import ARTIFACTS
from dermaagents.ml.inference import model_available, predict_skin_disease

pytestmark = pytest.mark.skipif(not model_available(), reason="model not trained")
DEMO = ARTIFACTS / "demo_images"


def test_returns_required_fields_on_test_image():
    idx = json.loads((DEMO / "index.json").read_text())
    r = predict_skin_disease(str(DEMO / idx[0]["file"]))
    for k in ["status", "predicted_class", "class_probabilities", "confidence", "model", "supported_classes",
              "prediction_set", "ood_score"]:
        assert k in r
    assert abs(sum(r["class_probabilities"].values()) - 1) < 1e-2
    assert 0 <= r["confidence"] <= 1
    assert r["status"] in {"confident", "uncertain", "outside_scope", "rejected_ood"}


def test_disabled_classes_never_predicted():
    idx = json.loads((DEMO / "index.json").read_text())
    for d in idx:
        r = predict_skin_disease(str(DEMO / d["file"]))
        assert r["predicted_class"] not in {"Psoriasis", "Melanoma", "Basal Cell Carcinoma"}
        if r["status"] in ("outside_scope", "rejected_ood", "invalid_image"):
            assert r["predicted_class"] is None


def test_invalid_bytes_rejected():
    r = predict_skin_disease(b"not an image at all")
    assert r["status"] == "invalid_image" and r["predicted_class"] is None


def test_tiny_and_uniform_images_rejected():
    assert predict_skin_disease(np.zeros((20, 20, 3), np.uint8))["status"] == "invalid_image"
    assert predict_skin_disease(np.full((300, 300, 3), 127, np.uint8))["status"] == "invalid_image"


def test_non_skin_image_not_forced_into_disease():
    # synthetic geometric pattern: should be OOD or at least not a confident supported disease
    img = np.zeros((300, 300, 3), np.uint8)
    for i in range(0, 300, 20):
        cv2.line(img, (i, 0), (300 - i, 300), (255, 255, 0), 3)
        cv2.circle(img, (150, 150), i, (0, 0, 255), 2)
    r = predict_skin_disease(img)
    assert r["status"] != "confident" or r["predicted_class"] is None or r["confidence"] < 0.99


def test_evaluation_artifacts_saved():
    for f in ["evaluation_results.json", "training_history.json", "confusion_matrix.png", "confusion_matrix.csv",
              "backbone_comparison.csv", "confidence_profile.json"]:
        assert (ARTIFACTS / "reports" / "model" / f).exists(), f
    for f in ["head.joblib", "model_metadata.json", "class_mapping.json", "preprocessing_config.json"]:
        assert (ARTIFACTS / "models" / f).exists(), f
    ev = json.loads((ARTIFACTS / "reports" / "model" / "evaluation_results.json").read_text())
    # conformal coverage should be near the 90% target on held-out data
    assert ev["conformal"]["test_empirical_coverage"] > 0.8
