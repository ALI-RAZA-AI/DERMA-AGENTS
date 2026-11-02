# DermaAgents — deployment guide

DermaAgents ships as **one container**: FastAPI serves the API under `/api/*` and the
prebuilt React frontend (`frontend/dist`) at `/`. This is the simplest way to deploy,
because the Mesa simulation, LangGraph workflow and the ONNX models must run in the
same Python process as the API.

## Two model variants

| Variant | Checkpoint | Test accuracy | Macro-F1 | Peak RAM (measured) | Use |
|---|---|---|---|---|---|
| Full ensemble | `artifacts/models` | 61.5% | 0.409 | ~670 MB | local runs, hosts with >= 1 GB |
| **Lite (MobileNetV2)** | `artifacts/models_lite` | 57.7% | 0.386 | **~395 MB** | **Render free (512 MB)** |

Peak RAM for the lite variant was measured with the full Playwright e2e run, all six scenarios
(3 replications) and a PDF export. Select a variant with environment variables:
`DERMA_MODELS_DIR=artifacts/models_lite DERMA_MODEL_REPORTS_DIR=artifacts/reports/model_lite`.

## Option A — Render free web service (recommended, no payment)

Render's free web service: 512 MB RAM, 0.1 CPU, sleeps after 15 minutes without traffic
(the first request after that takes about a minute), disk is wiped on restart (cases stored
in SQLite reset). Verify current limits on render.com before relying on them.

1. Create a GitHub repository and push this project (the 102 MB ResNet50 file is git-ignored;
   the lite image does not need it):
   ```bash
   cd dermaagents
   git init
   git add . && git commit -m "DermaAgents"
   git branch -M main
   git remote add origin https://github.com/<you>/dermaagents.git
   git push -u origin main
   ```
2. Sign in at https://render.com with GitHub → **New → Blueprint** → choose the repository.
   Render reads `render.yaml` and builds `Dockerfile.render` (first build ≈ 5–10 min).
3. Your public URL appears as `https://dermaagents-xxxx.onrender.com`. Open `/api/health` to check.

Note: Hugging Face now requires a paid plan for Docker Spaces on new accounts, so Spaces is
no longer a free option for this project.

## Option A2 — Your own computer + a free tunnel

Run `start_windows.bat` (or `./start_mac_linux.sh`), then in a second terminal:
`cloudflared tunnel --url http://localhost:8000` → prints a temporary public
`https://....trycloudflare.com` link that works while your computer and the app are running.

## Option B — Vercel (frontend) + Render (backend)

```bash
cd frontend
VITE_API_URL=https://<your-backend-host> node build.mjs     # bakes the API base URL into the bundle
npx vercel deploy --prod dist                                # static SPA (hash routing, no rewrites needed)
```
Then set `DERMA_CORS_ORIGINS=https://<your-vercel-app>.vercel.app` on the backend.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 7860 (Docker) | HTTP port |
| `DERMA_DB_URL` | `sqlite:///backend/artifacts/dermaagents.db` | SQLite or `postgresql://…` (install `psycopg[binary]`) |
| `DERMA_ARTIFACTS_DIR` | `backend/artifacts` | models, reports, demo images |
| `DERMA_MODELS_DIR` | `$ARTIFACTS/models` | ONNX backbones + head checkpoint |
| `DERMA_UPLOAD_DIR` | `$ARTIFACTS/uploads` | uploaded images (random file names) |
| `DERMA_MAX_UPLOAD_MB` | 8 | upload size limit |
| `DERMA_CORS_ORIGINS` | `*` | allowed origins (set explicitly in production) |
| `DERMA_FRONTEND_DIST` | `frontend/dist` | static frontend location |
| `ANTHROPIC_API_KEY` | – | optional; enables LLM-generated grounded answers |
| `DERMA_LLM_MODEL` | `claude-haiku-5-5` | model used when the key is set |

## Production checklist

- Set `DERMA_CORS_ORIGINS` to your real frontend origin(s).
- Use a persistent volume or PostgreSQL for the database; uploads are written to `DERMA_UPLOAD_DIR`.
- Keep the medical disclaimer visible (it is on every page footer and diagnosis view).
- Run `pytest` and `python frontend/tests/e2e.py <url>` against the deployed URL.
- Neo4j (optional upgrade): export nodes/edges from `GET /api/knowledge-graph` and load with
  `UNWIND $nodes AS n MERGE (x:Node {id:n.id}) SET x += n` / `UNWIND $edges AS e MATCH (a {id:e.source}),(b {id:e.target}) MERGE (a)-[:REL {type:e.relation}]->(b)`.
- ChromaDB (optional upgrade): replace `InMemoryVectorStore` in `knowledge/rag.py` with
  `langchain_chroma.Chroma(persist_directory=...)`; the `Embeddings` interface is unchanged.
