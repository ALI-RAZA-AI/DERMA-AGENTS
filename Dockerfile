# Single-container deployment (FastAPI backend + prebuilt React frontend).
# Works on Hugging Face Spaces (Docker SDK, port 7860), Render, Railway, Fly.io.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7860 \
    DERMA_ARTIFACTS_DIR=/app/backend/artifacts DERMA_FRONTEND_DIST=/app/frontend/dist \
    DERMA_DB_URL=sqlite:////data/dermaagents.db DERMA_UPLOAD_DIR=/data/uploads
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 app && mkdir -p /data && chown app /data
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --chown=app backend backend
COPY --chown=app frontend/dist frontend/dist
USER app
WORKDIR /app/backend
EXPOSE 7860
HEALTHCHECK CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"7860\")}/api/health')"
CMD ["sh", "-c", "uvicorn dermaagents.api.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
