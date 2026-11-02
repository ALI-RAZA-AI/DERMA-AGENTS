#!/usr/bin/env bash
# DermaAgents - one-command local start for macOS / Linux. Requires Python 3.11 or 3.12.
set -e
cd "$(dirname "$0")/backend"
PY=$(command -v python3 || command -v python)
[ -d .venv ] || "$PY" -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt
echo
echo "DermaAgents is starting at  http://127.0.0.1:8000   (Ctrl+C to stop)"
( sleep 4; (command -v open >/dev/null && open http://127.0.0.1:8000) || (command -v xdg-open >/dev/null && xdg-open http://127.0.0.1:8000) ) >/dev/null 2>&1 &
exec python -m uvicorn dermaagents.api.main:app --host 127.0.0.1 --port 8000
