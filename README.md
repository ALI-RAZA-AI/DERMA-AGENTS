# DermaAgents — Agent-Based Dermatology Diagnosis & Care Simulation Platform

**Designed and Developed by ALI RAZA** · University of Central Punjab · Section AG2 · Agent Based Modelling

> Academic simulation only. Not a medical device, not medical advice, no real prescriptions.
> Only synthetic patients are stored. Do not upload real patient photographs.

DermaAgents couples a trained skin-image classifier with five autonomous agents, a Mesa
clinic simulation, LangGraph orchestration, an rdflib ontology, a NetworkX knowledge graph
and a LangChain RAG pipeline. It shows how AI assistance changes waiting time, workload,
congestion and diagnostic agreement across a whole clinic.

## What is in this repository

```
backend/
  dermaagents/
    ml/            dataset_audit · prepare (grouped split, features) · train · selective · inference
      tools/       Caffe->ONNX, TFLite->ONNX and ONNX-editing tools used to obtain the backbones
    agents/        live agents (LangGraph) · LangChain tools · agent specifications
    simulation/    Mesa ClinicModel (5 agent types) · six scenarios · live run manager
    workflow/      LangGraph per-patient state graph (9 nodes, conditional routing, checkpointing)
    knowledge/     sources · facts · rdflib ontology · NetworkX KG · RAG pipeline
    api/           FastAPI app (all endpoints + SPA hosting)
  artifacts/       models, evaluation reports, dataset audit, demo test images, scenario results
  tests/           43 pytest tests (dataset, inference, agents, workflow, Mesa, KG, RAG, API, end-to-end)
frontend/          React 19 + TypeScript + Tailwind v4 SPA (12 pages), esbuild build, Playwright e2e test
                   Clinical-light design: airy blue canvas, white glass cards, Instrument Serif display +
                   Inter UI, dark contour "body-scan" panels (three.js), live data in every widget
vendor/            offline-sandbox copies of pure-Python libs (ignored when real packages are installed)
docs/              DEPLOYMENT.md · MODEL_CARD.md · RESULTS.md
Dockerfile         full single-container image (ensemble model, needs ~1 GB RAM)
Dockerfile.render  lite image for Render's free plan (MobileNetV2, ~395 MB peak RAM) + render.yaml
```

## Run it on your own computer (localhost)

* **Windows:** double-click `start_windows.bat`
* **macOS / Linux:** run `./start_mac_linux.sh`

Both scripts create a virtual environment, install the requirements (first run only) and open
**http://127.0.0.1:8000**. You need Python 3.11 or 3.12 and an internet connection for the first install.
Node.js is not required: the built frontend (`frontend/dist`) is served by the backend.

## Full vs lite model

The GitHub repository does not contain `backend/artifacts/models/resnet50v2_imagenet.onnx` (102 MB,
over GitHub's file limit). Without it the app automatically uses the **lite** MobileNetV2 checkpoint
(57.7% test accuracy). Copy that file from the project ZIP into `backend/artifacts/models/` to
enable the **full ensemble** (61.5%).

## Free public deployment

Push to GitHub, then on render.com choose **New → Blueprint** and select the repo. `render.yaml`
builds `Dockerfile.render` (lite MobileNetV2 model, fits the free 512 MB plan). Full steps: docs/DEPLOYMENT.md.

## Quick start (manual)

```bash
# backend (Python 3.11+)
cd backend && pip install -r requirements.txt
python -m uvicorn dermaagents.api.main:app --port 8000      # serves API + built frontend
# frontend (only if you change it; dist/ is committed)
cd frontend && npm install && npm run build
# tests
cd backend && pytest -q                                      # 43 tests
python ../frontend/tests/e2e.py http://127.0.0.1:8000        # 12 pages + 3 user flows in Chromium
```
Open http://127.0.0.1:8000. API docs: http://127.0.0.1:8000/docs.

Reproduce the ML pipeline from the dataset ZIP: `DATASET_ZIP=... ./scripts/reproduce_pipeline.sh`.

## Pages

Home · Analytics Dashboard · Patient Registration · AI Skin Diagnosis (upload + 5-agent run +
human override) · Multi-Agent Workflow (LangGraph route + agent log) · Clinic Simulation (live
Mesa) · Six-Scenario Comparison · Knowledge Graph Explorer · RAG Knowledge Base · Patient Case
History · Reports & Analytics (PDF/CSV/JSON export) · Project Information.

## API

`POST /api/patients` · `POST /api/diagnosis/predict` · `POST /api/agents/run` ·
`POST /api/simulation/{start,pause,resume,reset}` · `GET /api/simulation/{status,metrics}` ·
`POST /api/scenarios/compare` (+ `GET /api/jobs/{id}`, `GET /api/scenarios/latest`) ·
`GET /api/knowledge-graph` (+ `/node/{id}`) · `POST /api/rag/query` · `GET /api/cases` (+ `/{id}`) ·
`GET /api/analytics` · `POST /api/reports/export` · `GET /api/model/info` · `GET /api/dataset/summary` ·
`GET /api/workflow/graph` · `GET /api/agents/specs` · `GET /api/health`.

## Key results (see docs/RESULTS.md)

* **Dataset**: 3,795 images in the upload, 0 corrupted; 3,550 labelled across 14 classes; 245 HAM10000
  images unlabelled (metadata CSV missing) and excluded. Psoriasis absent; melanoma/BCC only as an
  unspecified "Skin Cancer" folder. After removing 25 conflicting-label duplicates and 50 exact copies:
  3,475 images, grouped 70/15/15 split with zero near-duplicate leakage.
* **Classifier** (14 classes, held-out test n=496): ensemble of ImageNet MobileNetV2 + EfficientNet-EdgeTPU-M +
  ResNet50-v2 features with a logistic-regression head — accuracy **61.5%** (95% CI 57–66%), macro-F1 0.41,
  macro OvR ROC-AUC 0.88. Enabled classes: Acne F1 0.86, Skin Cancer (unspecified) F1 0.70, Eczema 0.36,
  Seborrheic Keratosis 0.30 (n=7). Conformal coverage 91.3% (target 90%); confident predictions
  (validated threshold) are 93% accurate on test but only 12% of images qualify — the rest go to further assessment.
* **Simulation** (5 replications): AI assistance raised final diagnostic accuracy (0.81 → 0.85) and cut waits under
  high load (56 → 48 min) and with two dermatologists (44 → 39 min), but at baseline load it did not shorten waits,
  because the real classifier's confidence is usually below threshold and triggers longer reviews.

## Honest substitutions (sandbox had no PyPI / npm / PyTorch access)

| Planned | Delivered | Why |
|---|---|---|
| PyTorch fine-tuning | Frozen ImageNet backbones in ONNX Runtime + scikit-learn head (real transfer learning, no backbone fine-tuning) | PyTorch could not be installed |
| Next.js | React + TypeScript + Tailwind SPA built with esbuild | npm registry blocked |
| Framer Motion, Lucide React, R3F, Recharts | CSS / Web Animations, Lucide via react-icons, plain three.js, Plotly + D3 | not installable |
| ChromaDB / FAISS + sentence embeddings | LangChain InMemoryVectorStore (persisted) + LSA embeddings (LangChain Embeddings API) | not installable |
| LLM reasoning | Clearly labelled rule-based fallback; set `ANTHROPIC_API_KEY` to enable | no key provided |

Dataset credit: images from the uploaded "Skin Disease Dataset" (largely DermNet-sourced clinical photos) and
HAM10000 (Tschandl et al., *Sci Data* 2018). Check licences before redistribution.
