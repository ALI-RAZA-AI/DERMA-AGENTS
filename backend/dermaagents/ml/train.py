"""Phase 2b - train & compare classification heads on frozen pretrained backbones,
calibrate, build the rejection strategy, evaluate, and save the checkpoint.

Transfer-learning recipe (CPU-only sandbox, no PyTorch available):
  frozen ImageNet backbone (ONNX) -> L2-normalised embedding -> PCA (whitening off)
  -> multinomial logistic regression with class-balanced weights.
Hyper-parameter C is chosen by grouped 5-fold CV on the *training* split only
(augmented views stay in the same fold as their source image).

Uncertainty / rejection (validated on held-out data, not hand-picked thresholds):
  1. temperature scaling fitted on the validation split (NLL),
  2. split-conformal prediction sets (LAC score, alpha=0.10) calibrated on the
     validation split -> guaranteed ~90% marginal coverage, checked on test,
  3. Mahalanobis out-of-distribution score (class-conditional means, Ledoit-Wolf
     shared covariance in PCA space); threshold = 99th percentile of validation
     in-distribution scores; evaluated on test (FPR) and on real OOD probes
     (unlabelled dermoscopic HAM10000 images and non-skin natural photos).

Usage: python -m dermaagents.ml.train <data_dir> <dataset_root> <out_model_dir> <report_dir> [backbones]
  e.g. lite checkpoint: ... artifacts/models_lite artifacts/reports/model_lite mobilenetv2
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import cv2
import joblib
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from scipy.special import log_softmax, softmax
from sklearn.covariance import LedoitWolf
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, classification_report,
                             confusion_matrix, f1_score, precision_recall_fscore_support, roc_auc_score)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import normalize

from .backbones import MODEL_SOURCES, SPECS, make_backbone

SEED = 42
ALPHA = 0.10
OOD_PCTL = 99.0
PCA_DIM = 256
C_GRID = [0.3, 1.0, 3.0, 10.0, 30.0]

# dataset label -> DermaAgents-facing label (only proposal-mapped classes are "enabled")
ENABLED = {"Acne": "Acne", "Eczema": "Eczema", "Seborrheic Keratoses": "Seborrheic Keratosis",
           "Skin Cancer": "Skin Cancer (unspecified)"}
DISABLED_PROPOSAL = ["Psoriasis", "Melanoma", "Basal Cell Carcinoma"]


def fit_head(X, y, C, class_weight="balanced"):
    pca = PCA(n_components=min(PCA_DIM, X.shape[1]), random_state=SEED).fit(X)
    clf = LogisticRegression(C=C, max_iter=3000, class_weight=class_weight)
    clf.fit(pca.transform(X), y)
    return pca, clf


def head_logits(pca, clf, X):
    return clf.decision_function(pca.transform(X))


def fit_temperature(logits, y):
    def nll(t):
        return -log_softmax(logits / t, axis=1)[np.arange(len(y)), y].mean()
    return float(minimize_scalar(nll, bounds=(0.05, 20), method="bounded").x)


def ece(probs, y, bins=15):
    conf, pred = probs.max(1), probs.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return float(e)


class Mahalanobis:
    def fit(self, Z, y, n_classes):
        self.mu = np.stack([Z[y == k].mean(0) for k in range(n_classes)])
        cov = LedoitWolf().fit(Z - self.mu[y]).covariance_
        self.prec = np.linalg.inv(cov)
        return self

    def score(self, Z):
        d = Z[:, None, :] - self.mu[None]
        m = np.einsum("nkd,de,nke->nk", d, self.prec, d)
        return m.min(1)  # distance to closest class


ENSEMBLE = ["mobilenetv2", "efficientnet", "resnet50"]


def load_features(data_dir: Path, name: str):
    """Per-backbone L2-normalised features; 'ensemble' = concatenation of all three
    (each part normalised, then the whole vector re-normalised)."""
    if name == "ensemble":
        parts = [load_features(data_dir, b) for b in ENSEMBLE]
        return (normalize(np.hstack([p[0] for p in parts])), normalize(np.hstack([p[1] for p in parts])), parts[0][2])
    f = np.load(data_dir / f"features_{name}.npz")
    return normalize(f["clean"]), normalize(f["aug"]), f["aug_src"]


def evaluate_backbone(name, data_dir, man, classes):
    clean, aug, aug_src = load_features(data_dir, name)
    y = man.label.map({c: i for i, c in enumerate(classes)}).values
    groups = man.near_dup_group.values
    tr = np.nonzero(man.split.values == "train")[0]
    va = np.nonzero(man.split.values == "val")[0]
    te = np.nonzero(man.split.values == "test")[0]

    # ---- grouped CV over C on training images (+ their augmented views)
    history = []
    skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    folds = list(skf.split(tr, y[tr], groups[tr]))
    for C in C_GRID:
        scores = []
        for f_tr, f_va in folds:
            src = set(tr[f_tr])
            amask = np.array([s in src for s in aug_src])
            Xf = np.vstack([clean[tr[f_tr]], aug[amask]])
            yf = np.concatenate([y[tr[f_tr]], y[aug_src[amask]]])
            pca, clf = fit_head(Xf, yf, C)
            pred = clf.predict(pca.transform(clean[tr[f_va]]))
            scores.append(f1_score(y[tr[f_va]], pred, average="macro"))
        history.append({"C": C, "cv_macro_f1_mean": float(np.mean(scores)), "cv_macro_f1_std": float(np.std(scores))})
        print(f"  {name} C={C}: cv macro-F1 {np.mean(scores):.3f} +/- {np.std(scores):.3f}", flush=True)
    best_C = max(history, key=lambda h: h["cv_macro_f1_mean"])["C"]

    Xtr = np.vstack([clean[tr], aug])
    ytr = np.concatenate([y[tr], y[aug_src]])
    t0 = time.time()
    pca, clf = fit_head(Xtr, ytr, best_C)
    fit_s = time.time() - t0
    lv, lt = head_logits(pca, clf, clean[va]), head_logits(pca, clf, clean[te])
    return dict(name=name, best_C=best_C, history=history, pca=pca, clf=clf, fit_seconds=fit_s,
                val_logits=lv, test_logits=lt, y_val=y[va], y_test=y[te], clean=clean, tr=tr, va=va, te=te,
                val_macro_f1=float(f1_score(y[va], lv.argmax(1), average="macro")),
                val_acc=float(accuracy_score(y[va], lv.argmax(1))))


def metrics_block(y, probs, classes):
    pred = probs.argmax(1)
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=range(len(classes)), zero_division=0)
    out = {
        "accuracy": float(accuracy_score(y, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y, pred)),
        "macro_precision": float(p.mean()), "macro_recall": float(r.mean()), "macro_f1": float(f.mean()),
        "weighted_f1": float(f1_score(y, pred, average="weighted")),
        "per_class": {c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, c in enumerate(classes)},
    }
    # one-vs-rest ROC-AUC only for classes with >= 5 positives in the evaluation split
    aucs = {}
    for i, c in enumerate(classes):
        pos = (y == i).sum()
        if pos >= 5 and pos < len(y):
            aucs[c] = float(roc_auc_score((y == i).astype(int), probs[:, i]))
    out["roc_auc_ovr"] = aucs
    out["roc_auc_ovr_macro_eligible"] = float(np.mean(list(aucs.values()))) if aucs else None
    out["roc_auc_note"] = "Computed only for classes with >=5 test positives (others statistically unreliable)."
    return out


def bootstrap_ci(y, pred, fn, n=1000, seed=SEED):
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        vals.append(fn(y[idx], pred[idx]))
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def ood_probe_images(dataset_root: Path):
    """Real images the classifier was never meant to see."""
    probes = {}
    ham = sorted((dataset_root / "train" / "HAM10000_images_part_1").glob("*.jpg"))
    probes["dermoscopy_HAM10000_unlabelled"] = [cv2.imread(str(p)) for p in ham]
    try:
        from skimage import data as skd
        names = ["astronaut", "chelsea", "coffee", "rocket", "camera", "coins", "moon", "page", "horse",
                 "clock", "hubble_deep_field", "immunohistochemistry", "retina", "logo", "colorwheel",
                 "motorcycle_left", "cat", "text", "brick", "grass", "gravel"]
        imgs = []
        for n in names:
            try:
                im = getattr(skd, n)()
            except Exception:
                continue
            im = np.asarray(im)
            if im.dtype == bool:
                im = im.astype(np.uint8) * 255
            if im.dtype != np.uint8:
                im = (255 * (im.astype(float) - im.min()) / max(1e-9, float(np.ptp(im.astype(float))))).astype(np.uint8)
            if im.ndim == 2:
                im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR)
            elif im.shape[2] == 4:
                im = cv2.cvtColor(im, cv2.COLOR_RGBA2BGR)
            else:
                im = cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
            imgs.append(im)
        probes["non_skin_natural_images_skimage"] = imgs
    except ImportError:
        pass
    return probes


def main():
    data_dir, dataset_root, model_dir, report_dir = map(Path, sys.argv[1:5])
    model_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    man = pd.read_csv(data_dir / "manifest.csv")
    classes = sorted(man.label.unique())

    results = {}
    only = sys.argv[5].split(",") if len(sys.argv) > 5 else None  # e.g. "mobilenetv2" for the lite checkpoint
    for name in (only or ["mobilenetv2", "efficientnet", "resnet50", "ensemble"]):
        if name != "ensemble" and not (data_dir / f"features_{name}.npz").exists():
            print("skip", name)
            continue
        results[name] = evaluate_backbone(name, data_dir, man, classes)

    comparison = []
    for name, r in results.items():
        T = fit_temperature(r["val_logits"], r["y_val"])
        pt = softmax(r["test_logits"] / T, axis=1)
        m = metrics_block(r["y_test"], pt, classes)
        comparison.append({"backbone": name, "selected_C": r["best_C"], "val_macro_f1": r["val_macro_f1"],
                           "val_accuracy": r["val_acc"], "test_accuracy": m["accuracy"],
                           "test_macro_f1": m["macro_f1"], "test_balanced_accuracy": m["balanced_accuracy"],
                           "test_weighted_f1": m["weighted_f1"], "embedding_dim": int(r["clean"].shape[1]),
                           "head_fit_seconds": round(r["fit_seconds"], 1)})
    comp = pd.DataFrame(comparison).sort_values("val_macro_f1", ascending=False)
    comp.to_csv(report_dir / "backbone_comparison.csv", index=False)
    print(comp.to_string(index=False))
    best = comp.iloc[0].backbone  # selected on VALIDATION macro-F1, never on test
    r = results[best]

    # ---- calibration
    T = fit_temperature(r["val_logits"], r["y_val"])
    pv, pt = softmax(r["val_logits"] / T, axis=1), softmax(r["test_logits"] / T, axis=1)
    pv_raw, pt_raw = softmax(r["val_logits"], axis=1), softmax(r["test_logits"], axis=1)

    # ---- split conformal (LAC)
    n = len(r["y_val"])
    scores = 1 - pv[np.arange(n), r["y_val"]]
    qhat = float(np.quantile(scores, np.ceil((n + 1) * (1 - ALPHA)) / n, method="higher"))
    sets_te = pt >= (1 - qhat)
    cov = float(sets_te[np.arange(len(r["y_test"])), r["y_test"]].mean())
    sizes = sets_te.sum(1)
    singleton = sizes == 1
    sing_acc = float((pt.argmax(1)[singleton] == r["y_test"][singleton]).mean()) if singleton.any() else None

    # ---- Mahalanobis OOD in PCA space of the selected head
    Ztr = r["pca"].transform(r["clean"][r["tr"]])
    ytr = man.label.map({c: i for i, c in enumerate(classes)}).values[r["tr"]]
    maha = Mahalanobis().fit(Ztr, ytr, len(classes))
    s_val = maha.score(r["pca"].transform(r["clean"][r["va"]]))
    ood_thr = float(np.percentile(s_val, OOD_PCTL))
    s_te = maha.score(r["pca"].transform(r["clean"][r["te"]]))
    bb = make_backbone(best)
    probe_report = {}
    for pname, imgs in ood_probe_images(dataset_root).items():
        if not imgs:
            continue
        Zp = r["pca"].transform(normalize(bb.embed_images(imgs)))
        sp = maha.score(Zp)
        probe_report[pname] = {"n": len(imgs), "flagged_ood_rate": float((sp > ood_thr).mean()),
                               "median_score": float(np.median(sp))}
    ood_report = {"threshold": ood_thr, "percentile_of_validation": OOD_PCTL,
                  "test_in_distribution_false_flag_rate": float((s_te > ood_thr).mean()),
                  "probes": probe_report}

    # ---- confidence profile consumed by the Mesa AI agent
    conf_te, ok_te = pt.max(1), pt.argmax(1) == r["y_test"]
    (report_dir / "confidence_profile.json").write_text(json.dumps(
        {"correct": conf_te[ok_te].round(4).tolist(), "incorrect": conf_te[~ok_te].round(4).tolist(),
         "note": "Calibrated top-1 confidence of the selected model on the held-out test split."}))

    # ---- final metrics for selected model
    m = metrics_block(r["y_test"], pt, classes)
    pred = pt.argmax(1)
    m["accuracy_95ci_bootstrap"] = bootstrap_ci(r["y_test"], pred, accuracy_score)
    m["macro_f1_95ci_bootstrap"] = bootstrap_ci(r["y_test"], pred, lambda a, b: f1_score(a, b, average="macro"))
    enabled_idx = [classes.index(c) for c in ENABLED]
    m["enabled_class_metrics"] = {ENABLED[classes[i]]: m["per_class"][classes[i]] for i in enabled_idx}
    cm = confusion_matrix(r["y_test"], pred, labels=range(len(classes)))
    pd.DataFrame(cm, index=classes, columns=classes).to_csv(report_dir / "confusion_matrix.csv")
    (report_dir / "classification_report.txt").write_text(
        classification_report(r["y_test"], pred, labels=range(len(classes)), target_names=classes, zero_division=0))
    plot_confusion(cm, classes, report_dir / "confusion_matrix.png", best)

    evaluation = {
        "selected_backbone": best, "selection_rule": "highest validation macro-F1 (test split untouched)",
        "classes": classes, "test_metrics": m,
        "calibration": {"temperature": T, "val_ece_before": ece(pv_raw, r["y_val"]), "val_ece_after": ece(pv, r["y_val"]),
                        "test_ece_before": ece(pt_raw, r["y_test"]), "test_ece_after": ece(pt, r["y_test"])},
        "conformal": {"alpha": ALPHA, "qhat": qhat, "prob_threshold": 1 - qhat, "target_coverage": 1 - ALPHA,
                      "test_empirical_coverage": cov, "test_mean_set_size": float(sizes.mean()),
                      "test_singleton_rate": float(singleton.mean()), "test_singleton_accuracy": sing_acc},
        "ood": ood_report,
        "backbone_comparison": comparison,
        "split_sizes": {"train": int(len(r["tr"])), "val": int(len(r["va"])), "test": int(len(r["te"]))},
    }
    (report_dir / "evaluation_results.json").write_text(json.dumps(evaluation, indent=2))
    (report_dir / "training_history.json").write_text(json.dumps(
        {k: {"cv_search": v["history"], "selected_C": v["best_C"]} for k, v in results.items()}, indent=2))

    # ---- checkpoint
    comps = ENSEMBLE if best == "ensemble" else [best]
    joblib.dump({"pca": r["pca"], "clf": r["clf"], "maha_mu": maha.mu, "maha_prec": maha.prec}, model_dir / "head.joblib")
    meta = {
        "name": "DermaAgents skin classifier", "version": "1.0.0",
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "backbone": best, "backbone_components": comps,
        "backbone_file": [SPECS[b].file for b in comps],
        "backbone_source": {b: MODEL_SOURCES[b] for b in comps},
        "head": "PCA(256) + multinomial logistic regression (class_weight=balanced)", "C": r["best_C"],
        "preprocessing": {"decode": "OpenCV BGR",
                          "per_backbone": {b: {"resize_shorter_side": SPECS[b].resize, "center_crop": SPECS[b].size,
                                               "channel_order": "RGB" if SPECS[b].rgb else "BGR",
                                               "mean": SPECS[b].mean, "std": SPECS[b].std} for b in comps},
                          "l2_normalize_embedding": True, "tta": "horizontal flip average",
                          "training_augmentation": "random resized crop (0.55-1.0), h/v flip, rotation +/-25deg, "
                                                   "HSV jitter +/-15%, light blur; 4 views per training image"},
        "classes": classes,
        "enabled_classes": ENABLED, "disabled_proposal_classes": DISABLED_PROPOSAL,
        "temperature": T, "conformal_qhat": qhat, "conformal_alpha": ALPHA,
        "ood_threshold": ood_thr, "image_quality": quality_reference(r, man, report_dir),
        "training_data": "SKIN_DATASET_FOR_DERMAAGENTS.zip (user upload); 14 labelled classes, grouped re-split",
        "intended_use": "Academic simulation only - not a medical device and not for clinical diagnosis.",
    }
    (model_dir / "model_metadata.json").write_text(json.dumps(meta, indent=2))
    (model_dir / "class_mapping.json").write_text(json.dumps(
        {"index_to_label": classes, "enabled": ENABLED, "disabled_proposal_classes": DISABLED_PROPOSAL}, indent=2))
    (model_dir / "preprocessing_config.json").write_text(json.dumps(meta["preprocessing"], indent=2))
    print(json.dumps({k: evaluation[k] for k in ["selected_backbone", "calibration", "conformal", "ood"]}, indent=1))
    print("test acc", m["accuracy"], "macro-F1", m["macro_f1"])


def quality_reference(r, man, report_dir: Path):
    """Image-quality reference ranges from the training images (used to flag unusual uploads).
    Uploads outside the 0.5th-99.5th percentile of the training distribution get a quality warning."""
    path = report_dir.parent / "dataset" / "dataset_report.csv"
    if not path.exists():
        return {}
    rep = pd.read_csv(path).set_index("path")
    tr_paths = man.path.values[r["tr"]]
    sub = rep.loc[[p for p in tr_paths if p in rep.index]]
    return {
        "blur_laplacian_var_p0_5": float(np.percentile(sub.blur_laplacian_var, 0.5)),
        "mean_intensity_p0_5": float(np.percentile(sub.mean_intensity, 0.5)),
        "mean_intensity_p99_5": float(np.percentile(sub.mean_intensity, 99.5)),
        "min_side_px": 64,
    }


def plot_confusion(cm, classes, path, name):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    cmn = cm / np.maximum(cm.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(10, 8.5), dpi=150)
    im = ax.imshow(cmn, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(classes)), classes, rotation=55, ha="right", fontsize=8)
    ax.set_yticks(range(len(classes)), classes, fontsize=8)
    for i in range(len(classes)):
        for j in range(len(classes)):
            if cm[i, j]:
                ax.text(j, i, cm[i, j], ha="center", va="center", fontsize=7,
                        color="white" if cmn[i, j] > 0.55 else "#0b0b0b")
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(f"Test-split confusion matrix ({name}); colour = row-normalised recall", loc="left", fontsize=10)
    fig.colorbar(im, ax=ax, fraction=0.04)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


if __name__ == "__main__":
    main()
