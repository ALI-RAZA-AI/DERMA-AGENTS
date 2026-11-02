import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
# isolated database for tests
_tmp = tempfile.mkdtemp(prefix="derma_test_")
os.environ.setdefault("DERMA_DB_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("DERMA_UPLOAD_DIR", f"{_tmp}/uploads")
os.environ.setdefault("DERMA_SCENARIO_CACHE", f"{_tmp}/scenarios/latest_comparison.json")

import dermaagents  # noqa: E402,F401  (sets vendored-library path)

ARTIFACTS = BACKEND / "artifacts"
DATASET_ROOT = Path(os.environ.get("DERMA_DATASET_ROOT", "/home/claude/raw/SkinDisease/SkinDisease"))
