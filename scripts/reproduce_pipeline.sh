#!/usr/bin/env bash
# Reproduce the full ML pipeline from the uploaded dataset ZIP.
#   DATASET_ZIP=/path/SKIN_DATASET_FOR_DERMAAGENTS.zip ./scripts/reproduce_pipeline.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-$ROOT/.dataset}"
mkdir -p "$WORK"
[ -d "$WORK/SkinDisease" ] || unzip -q "${DATASET_ZIP:?set DATASET_ZIP}" -d "$WORK"
DS="$WORK/SkinDisease/SkinDisease"
cd "$ROOT/backend"
# 0. backbones (only needed if artifacts/models/*.onnx are missing) - see docs/MODEL_CARD.md
# 1. audit
python -m dermaagents.ml.dataset_audit "$DS" artifacts/reports/dataset
# 2. cleaned manifest, grouped split, cached features (+4 augmented views)
python -m dermaagents.ml.prepare "$DS" artifacts/reports/dataset artifacts/data --views 4
# 3. train/compare heads, calibrate, conformal + OOD, evaluate, save checkpoint
python -m dermaagents.ml.train artifacts/data "$DS" artifacts/models artifacts/reports/model
python -m dermaagents.ml.selective artifacts/data artifacts/models artifacts/reports/model
# 4. ontology export
python -m dermaagents.knowledge.ontology artifacts/reports/dermaagents_ontology.ttl
echo "done"
