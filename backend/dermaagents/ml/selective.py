"""Risk-controlled selective prediction threshold (post-training step).

The 90% conformal sets of a 14-class model trained on ~2.4k images are usually
larger than one class, so "single-class set" alone would mark almost every
image uncertain. We therefore also calibrate a *selective-classification*
threshold tau on the validation split: the smallest calibrated-confidence
threshold whose accepted predictions have a one-sided 90% Clopper-Pearson lower
bound on accuracy >= TARGET_ACC. tau is then checked on the untouched test split.

Usage: python -m dermaagents.ml.selective <data_dir> <model_dir> <report_dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.special import softmax
from scipy.stats import beta

from .train import load_features

TARGET_ACC = 0.85
CONF_LEVEL = 0.90


def cp_lower(k: int, n: int, conf: float = CONF_LEVEL) -> float:
    return 0.0 if k == 0 else float(beta.ppf(1 - conf, k, n - k + 1))


def main():
    data_dir, model_dir, report_dir = map(Path, sys.argv[1:4])
    meta = json.loads((model_dir / "model_metadata.json").read_text())
    head = joblib.load(model_dir / "head.joblib")
    man = pd.read_csv(data_dir / "manifest.csv")
    classes = meta["classes"]
    y = man.label.map({c: i for i, c in enumerate(classes)}).values
    clean, _, _ = load_features(data_dir, meta["backbone"])

    def probs(idx):
        return softmax(head["clf"].decision_function(head["pca"].transform(clean[idx])) / meta["temperature"], axis=1)

    va, te = np.nonzero(man.split.values == "val")[0], np.nonzero(man.split.values == "test")[0]
    pv, pt = probs(va), probs(te)
    cv, okv = pv.max(1), pv.argmax(1) == y[va]
    tau, curve = 1.0, []
    for t in np.unique(cv):
        m = cv >= t
        k, n = int(okv[m].sum()), int(m.sum())
        lb = cp_lower(k, n)
        curve.append({"tau": float(t), "accepted": n, "accuracy": k / n, "cp_lower": lb})
        if lb >= TARGET_ACC and t < tau:
            tau = float(t)
    ct, okt = pt.max(1), pt.argmax(1) == y[te]
    acc_t = ct >= tau
    enabled_idx = [classes.index(c) for c in meta["enabled_classes"]]
    en_t = np.isin(pt.argmax(1), enabled_idx) & acc_t
    sel = {"target_accuracy": TARGET_ACC, "confidence_level": CONF_LEVEL, "tau": tau,
           "val_accept_rate": float((cv >= tau).mean()), "val_accuracy_accepted": float(okv[cv >= tau].mean()) if (cv >= tau).any() else None,
           "test_accept_rate": float(acc_t.mean()), "test_accuracy_accepted": float(okt[acc_t].mean()) if acc_t.any() else None,
           "test_accept_rate_enabled_classes": float(en_t.mean()),
           "test_accuracy_accepted_enabled_classes": float(okt[en_t].mean()) if en_t.any() else None,
           "method": "smallest calibrated-confidence threshold whose validation accepted-set accuracy has a "
                     "one-sided 90% Clopper-Pearson lower bound >= target"}
    meta["selective_tau"] = tau
    meta["selective"] = {k: v for k, v in sel.items() if k != "method"}
    (model_dir / "model_metadata.json").write_text(json.dumps(meta, indent=2))
    ev_p = report_dir / "evaluation_results.json"
    ev = json.loads(ev_p.read_text())
    ev["selective"] = sel
    ev_p.write_text(json.dumps(ev, indent=2))
    (report_dir / "selective_curve.json").write_text(json.dumps(curve))
    print(json.dumps(sel, indent=1))


if __name__ == "__main__":
    main()
