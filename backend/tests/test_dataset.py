"""Dataset integrity tests (run against the audit artifacts; the raw dataset is optional)."""
import json

import pandas as pd
import pytest

from conftest import ARTIFACTS, DATASET_ROOT

REP = ARTIFACTS / "reports" / "dataset"


def test_audit_outputs_exist():
    for f in ["dataset_report.csv", "class_distribution.png", "image_dimensions_report.csv",
              "corrupted_images.csv", "dataset_summary.json", "class_mapping.json"]:
        assert (REP / f).exists(), f


def test_summary_consistency():
    s = json.loads((REP / "dataset_summary.json").read_text())
    assert s["total_images_readable"] == s["labelled_images"] + s["unlabelled_images"]["count"]
    assert sum(s["class_counts_total"].values()) == s["labelled_images"]
    assert s["proposal_mapping"]["Psoriasis"] == "unsupported"
    assert s["proposal_mapping"]["Acne"] == "supported"


def test_no_label_assigned_to_unlabelled_ham():
    rep = pd.read_csv(REP / "dataset_report.csv")
    ham = rep[rep.folder == "HAM10000_images_part_1"]
    assert len(ham) > 0 and ham.label.isna().all()


def test_split_has_no_group_leakage_and_no_conflicts():
    man = pd.read_csv(ARTIFACTS / "data" / "manifest.csv")
    assert man.groupby("near_dup_group").split.nunique().max() == 1
    assert man.groupby("near_dup_group").label.nunique().max() == 1
    assert not man.md5.duplicated().any()
    assert set(man.split) == {"train", "val", "test"}


@pytest.mark.skipif(not DATASET_ROOT.exists(), reason="raw dataset not available")
def test_manifest_files_exist_on_disk():
    man = pd.read_csv(ARTIFACTS / "data" / "manifest.csv").sample(50, random_state=0)
    for p in man.path:
        assert (DATASET_ROOT / p).exists()
