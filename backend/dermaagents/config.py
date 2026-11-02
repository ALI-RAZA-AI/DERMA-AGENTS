"""Central configuration (environment-variable driven)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get("DERMA_ARTIFACTS_DIR", BACKEND_DIR / "artifacts"))
REPORTS_DIR = ARTIFACTS / "reports"
# Active model checkpoint: the full ensemble by default; falls back to the lite MobileNetV2
# checkpoint automatically when the large ResNet50 file is absent (e.g. a clone without Git LFS).
_FULL_OK = (ARTIFACTS / "models" / "resnet50v2_imagenet.onnx").exists() and \
    (ARTIFACTS / "models" / "resnet50v2_imagenet.onnx").stat().st_size > 1_000_000
MODELS_DIR = Path(os.environ.get("DERMA_MODELS_DIR", ARTIFACTS / ("models" if _FULL_OK else "models_lite")))
MODEL_REPORTS_DIR = Path(os.environ.get("DERMA_MODEL_REPORTS_DIR",
                                        REPORTS_DIR / ("model" if MODELS_DIR.name == "models" else "model_lite")))
DB_URL = os.environ.get("DERMA_DB_URL", f"sqlite:///{ARTIFACTS / 'dermaagents.db'}")
UPLOAD_DIR = Path(os.environ.get("DERMA_UPLOAD_DIR", ARTIFACTS / "uploads"))
MAX_UPLOAD_MB = float(os.environ.get("DERMA_MAX_UPLOAD_MB", "8"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("DERMA_CORS_ORIGINS", "*").split(",") if o.strip()]
FRONTEND_DIST = Path(os.environ.get("DERMA_FRONTEND_DIST", BACKEND_DIR.parent / "frontend" / "dist"))
DEMO_IMAGES_DIR = Path(os.environ.get("DERMA_DEMO_IMAGES", ARTIFACTS / "demo_images"))


def ensure_vendor_path() -> None:
    """Append the vendored pure-Python libs (offline sandbox fallback) *after*
    site-packages, so real pip-installed packages always take precedence."""
    vendor = BACKEND_DIR.parent / "vendor"
    if vendor.exists():
        for p in (vendor, vendor / "_shims"):
            if str(p) not in sys.path:
                sys.path.append(str(p))


ensure_vendor_path()
