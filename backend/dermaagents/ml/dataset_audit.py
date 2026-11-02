"""Phase 1 - dataset extraction audit for the uploaded SKIN_DATASET_FOR_DERMAAGENTS.zip.

Reads the extracted dataset read-only and writes:
  dataset_report.csv, image_dimensions_report.csv, corrupted_images.csv,
  duplicates_report.csv, class_distribution.png, dataset_summary.json, class_mapping.json

Usage: python -m dermaagents.ml.dataset_audit <dataset_root> <out_dir>
  <dataset_root> is the folder containing train/ and test/.
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

# Folder name in the dataset -> canonical dataset label. `None` = no reliable label.
FOLDER_LABELS = {
    "Acne": "Acne",
    "Actinic_Keratosis": "Actinic Keratosis",
    "Benign_tumors": "Benign Tumors",
    "Bullous": "Bullous",
    "Candidiasis": "Candidiasis",
    "DrugEruption": "Drug Eruption",
    "Eczema": "Eczema",
    "Infestations_Bites": "Infestations/Bites",
    "Lichen": "Lichen",
    "Lupus": "Lupus",
    "Moles": "Moles",
    "Psoriasis": "Psoriasis",
    "Rosacea": "Rosacea",
    "Seborrh_Keratoses": "Seborrheic Keratoses",
    "SkinCancer": "Skin Cancer",
    "Sun_Sunlight_Damage": "Sun/Sunlight Damage",
    "Tinea": "Tinea",
    "Unknown_Normal": "Unknown/Normal",
    "Vascular_Tumors": "Vascular Tumors",
    "Vasculitis": "Vasculitis",
    "Vitiligo": "Vitiligo",
    "Warts": "Warts",
    # HAM10000 images are only labelled through HAM10000_metadata.csv (dx column),
    # which is NOT in the upload -> unlabelled.
    "HAM10000_images_part_1": None,
}
README_22_CLASSES = [v for k, v in FOLDER_LABELS.items() if v]

# The six proposal diseases -> how the uploaded dataset supports them.
PROPOSAL_MAPPING = {
    "Acne": {"dataset_labels": ["Acne"], "status": "supported",
             "note": "Direct folder label."},
    "Eczema": {"dataset_labels": ["Eczema"], "status": "supported",
               "note": "Present only in the original test/ folder; train+test pooled and re-split."},
    "Seborrheic Keratosis": {"dataset_labels": ["Seborrheic Keratoses"], "status": "supported_low_sample",
                             "note": "Present only in test/ (small sample); pooled and re-split."},
    "Melanoma": {"dataset_labels": [], "status": "unsupported",
                 "note": "Folded into the generic 'Skin Cancer' folder with no sub-type annotation; "
                         "HAM10000 images that could provide melanoma labels lack their metadata CSV."},
    "Basal Cell Carcinoma": {"dataset_labels": [], "status": "unsupported",
                             "note": "Same as Melanoma - only an unspecified 'Skin Cancer' label exists."},
    "Psoriasis": {"dataset_labels": [], "status": "unsupported",
                  "note": "No Psoriasis folder in the upload (listed in the dataset README but missing)."},
}
# Extra, honestly-labelled class exposed instead of Melanoma/BCC.
PROPOSAL_PROXY = {"Skin Cancer (unspecified)": {"dataset_labels": ["Skin Cancer"],
                                               "status": "supported_proxy",
                                               "note": "Malignant lesions without sub-type; cannot be "
                                                       "reported as melanoma or BCC."}}


def phash64(img_bgr: np.ndarray) -> int:
    h = cv2.img_hash.pHash(img_bgr)  # 8 bytes
    return int.from_bytes(h.tobytes(), "big")


def audit(root: Path, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    rows, corrupted = [], []
    all_files = sorted(p for p in root.rglob("*") if p.is_file())
    for p in all_files:
        rel = p.relative_to(root)
        parts = rel.parts
        split = parts[0] if len(parts) > 1 else "(root)"
        folder = parts[1] if len(parts) > 2 else "(none)"
        ext = p.suffix.lower()
        rec = dict(path=str(rel), split=split, folder=folder, extension=ext,
                   size_bytes=p.stat().st_size, label=FOLDER_LABELS.get(folder),
                   label_status="ok" if FOLDER_LABELS.get(folder) else "missing_label")
        if folder not in FOLDER_LABELS:
            rec["label_status"] = "unknown_folder"
        if ext not in IMG_EXT:
            rec.update(readable=False, error="non-image file")
            corrupted.append({"path": str(rel), "reason": "non-image file"})
            rows.append(rec)
            continue
        data = p.read_bytes()
        rec["md5"] = hashlib.md5(data).hexdigest()
        try:
            with Image.open(p) as im:
                im.verify()
            with Image.open(p) as im:
                rec["pil_format"], rec["mode"] = im.format, im.mode
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("OpenCV could not decode")
            h, w = img.shape[:2]
            rec.update(readable=True, width=w, height=h, channels=img.shape[2] if img.ndim == 3 else 1,
                       aspect_ratio=round(w / h, 3), phash=f"{phash64(img):016x}",
                       mean_intensity=round(float(img.mean()), 2),
                       blur_laplacian_var=round(float(cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
                                                                     cv2.CV_64F).var()), 1))
            if min(h, w) < 64:
                rec["quality_flag"] = "too_small"
        except Exception as e:  # corrupted / truncated
            rec.update(readable=False, error=str(e)[:200])
            corrupted.append({"path": str(rel), "reason": str(e)[:200]})
        rows.append(rec)

    df = pd.DataFrame(rows)
    img_df = df[df.readable == True].copy()  # noqa: E712

    # ---------------- duplicates: exact (md5) and near (pHash Hamming <= 4)
    dup_rows = []
    for md5, g in img_df.groupby("md5"):
        if len(g) > 1:
            for p in g.path:
                dup_rows.append(dict(kind="exact", group=md5[:12], path=p,
                                     labels="|".join(sorted(set(map(str, g.label)))),
                                     splits="|".join(sorted(set(g.split)))))
    hashes = np.array([int(h, 16) for h in img_df.phash], dtype=np.uint64)
    idx = img_df.index.to_numpy()
    parent = list(range(len(hashes)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(hashes)):
        x = np.bitwise_xor(hashes[i + 1:], hashes[i])
        # popcount of uint64
        dist = np.unpackbits(x.view(np.uint8).reshape(-1, 8), axis=1).sum(1) if len(x) else np.array([])
        for j in np.nonzero(dist <= 4)[0]:
            a, b = find(i), find(i + 1 + int(j))
            if a != b:
                parent[b] = a
    roots = [find(i) for i in range(len(hashes))]
    img_df["near_dup_group"] = [f"g{r}" for r in roots]
    df.loc[img_df.index, "near_dup_group"] = img_df["near_dup_group"]
    grp_sizes = img_df.groupby("near_dup_group").size()
    for gname, g in img_df.groupby("near_dup_group"):
        if len(g) > 1 and g.md5.nunique() > 1:
            for p in g.path:
                dup_rows.append(dict(kind="near", group=gname, path=p,
                                     labels="|".join(sorted(set(map(str, g.label)))),
                                     splits="|".join(sorted(set(g.split)))))
    dups = pd.DataFrame(dup_rows, columns=["kind", "group", "path", "labels", "splits"])
    dups.to_csv(out / "duplicates_report.csv", index=False)

    multi = img_df[img_df.near_dup_group.map(grp_sizes) > 1]
    conflicting = multi.groupby("near_dup_group").label.apply(lambda s: s.dropna().nunique() > 1)
    cross_split = multi.groupby("near_dup_group").split.nunique() > 1

    # ---------------- reports
    df.to_csv(out / "dataset_report.csv", index=False)
    img_df[["path", "split", "label", "width", "height", "channels", "aspect_ratio",
            "size_bytes", "pil_format", "mode"]].to_csv(out / "image_dimensions_report.csv", index=False)
    pd.DataFrame(corrupted, columns=["path", "reason"]).to_csv(out / "corrupted_images.csv", index=False)

    labelled = img_df[img_df.label.notna()]
    per_split = labelled.groupby(["label", "split"]).size().unstack(fill_value=0)
    totals = labelled.groupby("label").size().sort_values(ascending=False)
    present = set(totals.index)

    # ---------------- chart (single series -> one hue; direct labels)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(10, 6), dpi=150)
    order = totals.sort_values()
    target = {"Acne", "Eczema", "Seborrheic Keratoses", "Skin Cancer"}
    colors = ["#2a78d6" if l in target else "#a9b4c2" for l in order.index]
    bars = ax.barh(order.index, order.values, color=colors, height=0.7)
    for b, v in zip(bars, order.values):
        ax.text(v + 8, b.get_y() + b.get_height() / 2, str(v), va="center", fontsize=8, color="#52514e")
    ax.set_xlabel("Images (train + test pooled)", color="#52514e")
    ax.set_title("Labelled images per class in the uploaded dataset\n"
                 "blue = mapped to a DermaAgents proposal disease; grey = other dataset class",
                 fontsize=11, loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.grid(axis="x", color="#e6e6e3", linewidth=0.6)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(out / "class_distribution.png")
    plt.close(fig)

    mapping = {"proposal_classes": PROPOSAL_MAPPING, "proxy_classes": PROPOSAL_PROXY,
               "dataset_classes_present": sorted(present),
               "dataset_classes_missing_from_upload": sorted(set(README_22_CLASSES) - present)}
    (out / "class_mapping.json").write_text(json.dumps(mapping, indent=2))

    imb = (totals.max() / totals.min()) if len(totals) else None
    summary = {
        "dataset_root": str(root),
        "total_files": int(len(df)),
        "total_images_readable": int(len(img_df)),
        "corrupted_or_non_image": int(len(corrupted)),
        "file_formats": {k: int(v) for k, v in Counter(df.extension).items()},
        "splits_found": {s: sorted(df[df.split == s].folder.unique().tolist()) for s in sorted(df.split.unique())},
        "labelled_images": int(len(labelled)),
        "unlabelled_images": {"count": int(img_df.label.isna().sum()),
                              "folders": sorted(img_df[img_df.label.isna()].folder.unique().tolist()),
                              "reason": "HAM10000 images are labelled only via HAM10000_metadata.csv, "
                                        "which is not included in the upload."},
        "class_counts_total": {k: int(v) for k, v in totals.items()},
        "class_counts_by_split": {lbl: {k: int(v) for k, v in r.items()} for lbl, r in per_split.iterrows()},
        "classes_only_in_test": sorted(per_split.index[per_split.get("train", 0) == 0].tolist()),
        "readme_classes_missing_from_upload": mapping["dataset_classes_missing_from_upload"],
        "imbalance_ratio_max_over_min": round(float(imb), 2) if imb else None,
        "dimensions": {
            "width": img_df.width.describe().round(1).to_dict(),
            "height": img_df.height.describe().round(1).to_dict(),
            "distinct_sizes": int(img_df.groupby(["width", "height"]).ngroups),
            "most_common_sizes": {f"{w}x{h}": int(c) for (w, h), c in
                                  img_df.groupby(["width", "height"]).size().nlargest(5).items()},
            "smaller_than_64px": int((img_df[["width", "height"]].min(axis=1) < 64).sum()),
        },
        "duplicates": {
            "exact_duplicate_groups": int((img_df.groupby("md5").size() > 1).sum()),
            "exact_duplicate_images": int(img_df.md5.duplicated(keep=False).sum()),
            "near_duplicate_groups_phash_le4": int((grp_sizes > 1).sum()),
            "images_in_near_duplicate_groups": int((img_df.near_dup_group.map(grp_sizes) > 1).sum()),
            "groups_with_conflicting_labels": int(conflicting.sum()),
            "groups_spanning_train_and_test": int(cross_split.sum()),
        },
        "metadata": {"readme_present": (root.parent.parent / "Readme.md").exists() or (root.parent / "Readme.md").exists(),
                     "patient_or_lesion_ids": "none available (no metadata CSV); near-duplicate pHash "
                                              "clusters are used as grouping keys for leakage-free splits"},
        "proposal_mapping": {k: v["status"] for k, v in {**PROPOSAL_MAPPING, **PROPOSAL_PROXY}.items()},
        "external_data_needed_for": ["Psoriasis", "Melanoma", "Basal Cell Carcinoma",
                                     "(and more Seborrheic Keratosis / Eczema samples)"],
    }
    (out / "dataset_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    return summary


if __name__ == "__main__":
    s = audit(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps({k: s[k] for k in ["total_images_readable", "corrupted_or_non_image", "class_counts_total",
                                        "duplicates", "classes_only_in_test"]}, indent=1))
