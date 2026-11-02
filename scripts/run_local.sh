#!/usr/bin/env bash
# Run DermaAgents locally: builds the frontend (if node is available) and starts the API on :8000.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if command -v node >/dev/null 2>&1 && [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  (cd "$ROOT/frontend" && node build.mjs)
fi
cd "$ROOT/backend"
exec python -m uvicorn dermaagents.api.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
