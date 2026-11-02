"""Phase 2a - build the cleaned manifest, leakage-free grouped split, and cached
backbone features (with augmented training views).

Usage: python -m dermaagents.ml.prepare <dataset_root> <audit_dir> <out_dir> [--views 4]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold

from .augment import augment
from .backbones import SPECS, Backbone, center_crop

SEED = 42


def build_manifest(audit_dir: Path) -> tuple[pd.DataFrame, dict]:
    rep = pd.read_csv(audit_dir / "dataset_report.csv")
    log = {"start_images": int(len(rep))}
    rep = rep[rep.readable == True]  # noqa: E712
    rep = rep[rep.label.notna()]
    log["after_drop_unlabelled"] = int(len(rep))
    # groups whose (near-)duplicates carry different labels -> unreliable annotation
    conflict = rep.groupby("near_dup_group").label.transform("nunique") > 1
    log["dropped_conflicting_label_images"] = int(conflict.sum())
    rep = rep[~conflict]
    # exact duplicates: keep one copy
    before = len(rep)
    rep = rep.drop_duplicates("md5")
    log["dropped_exact_duplicate_copies"] = int(before - len(rep))
    log["final_images"] = int(len(rep))
    return rep.reset_index(drop=True), log


def grouped_split(df: pd.DataFrame) -> pd.Series:
    """70/15/15 stratified split where every near-duplicate cluster stays in one split."""
    y, g = df.label.values, df.near_dup_group.values
    split = np.array(["train"] * len(df), dtype=object)
    outer = StratifiedGroupKFold(n_splits=7, shuffle=True, random_state=SEED)  # ~14% held out
    rest_idx, test_idx = next(outer.split(df, y, g))
    split[test_idx] = "test"
    inner = StratifiedGroupKFold(n_splits=6, shuffle=True, random_state=SEED)
    tr, va = next(inner.split(df.iloc[rest_idx], y[rest_idx], g[rest_idx]))
    split[rest_idx[va]] = "val"
    return pd.Series(split, index=df.index)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset_root")
    ap.add_argument("audit_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--views", type=int, default=4)
    ap.add_argument("--backbones", default="mobilenetv2,efficientnet,resnet50")
    a = ap.parse_args()
    root, out = Path(a.dataset_root), Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    df, log = build_manifest(Path(a.audit_dir))
    df["split"] = grouped_split(df)
    df[["path", "label", "split", "near_dup_group", "md5", "width", "height"]].to_csv(out / "manifest.csv", index=False)
    counts = df.groupby(["label", "split"]).size().unstack(fill_value=0)
    log["split_counts"] = {k: {s: int(v) for s, v in r.items()} for k, r in counts.iterrows()}
    log["group_leakage_check"] = int(df.groupby("near_dup_group").split.nunique().gt(1).sum())
    (out / "split_log.json").write_text(json.dumps(log, indent=2))
    print(json.dumps(log, indent=1))

    images = [cv2.imread(str(root / p), cv2.IMREAD_COLOR) for p in df.path]
    rng = np.random.default_rng(SEED)
    train_idx = np.nonzero(df.split.values == "train")[0]
    for name in a.backbones.split(","):
        t0 = time.time()
        bb = Backbone(name)
        sp = SPECS[name]
        clean = bb.embed_images(images, tta_flip=True)  # every image, deterministic view (+flip TTA)
        aug_feats, aug_src = [], []
        for v in range(a.views):
            crops = [augment(images[i], sp.size, rng) for i in train_idx]
            aug_feats.append(bb.embed_crops(crops))
            aug_src.append(train_idx)
        np.savez_compressed(out / f"features_{name}.npz", clean=clean,
                            aug=np.concatenate(aug_feats), aug_src=np.concatenate(aug_src))
        print(f"{name}: clean {clean.shape}, aug {sum(len(x) for x in aug_feats)} views, {time.time()-t0:.0f}s",
              flush=True)
        _ = center_crop  # noqa


if __name__ == "__main__":
    main()
