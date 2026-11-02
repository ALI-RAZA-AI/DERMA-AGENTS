"""DermaAgents FastAPI backend."""
from __future__ import annotations

import io
import json
import os
import logging
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

import cv2
import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from ..agents.specs import AGENT_SPECS
from ..config import (MODEL_REPORTS_DIR, ARTIFACTS, CORS_ORIGINS, DEMO_IMAGES_DIR, FRONTEND_DIST, MAX_UPLOAD_MB, REPORTS_DIR,
                      UPLOAD_DIR)
from ..db import get_db
from ..knowledge.facts import DISEASES, SYMPTOMS
from ..knowledge.graph import get_kg
from ..knowledge.rag import get_rag
from ..knowledge.sources import SOURCES
from ..ml.inference import model_available, model_info, predict_skin_disease, supported_classes
from ..reports import build_pdf
from ..simulation.manager import JobManager, SimulationManager, params_from_dict
from ..simulation.scenarios import BASE, SCENARIOS, run_all, summarise, to_records
from ..workflow.graph import graph_structure, run_case

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("dermaagents.api")
logging.getLogger("MESA").setLevel(logging.WARNING)
logging.getLogger("mesa").setLevel(logging.WARNING)

app = FastAPI(title="DermaAgents API", version="1.0.0",
              description="Agent-Based Dermatology Diagnosis & Care Simulation - academic use only. "
                          "Designed and Developed by ALI RAZA.")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["*"])

SIM = SimulationManager()
JOBS = JobManager()
SCENARIO_CACHE = Path(os.environ.get("DERMA_SCENARIO_CACHE", ARTIFACTS / "reports" / "scenarios" / "latest_comparison.json"))
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/bmp"}


def _save_sim_run(run_id, model):
    get_db().add_run(run_id, "interactive", model.metrics()["params"], model.metrics())


SIM.on_finish = _save_sim_run


@app.middleware("http")
async def timing(request: Request, call_next):
    t0 = time.perf_counter()
    resp = await call_next(request)
    if request.url.path.startswith("/api"):
        log.info("%s %s -> %s (%.0f ms)", request.method, request.url.path, resp.status_code,
                 1000 * (time.perf_counter() - t0))
    return resp


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"error": "internal_error", "detail": type(exc).__name__})


# =============================================================== schemas
class PatientIn(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    age: int = Field(..., ge=0, le=120)
    gender: Literal["female", "male", "other", "unspecified"] = "unspecified"
    severity: Literal["mild", "moderate", "severe"] = "moderate"
    symptoms: list[str] = Field(default_factory=list, max_length=30)
    history: str = Field("", max_length=500)
    previous_treatment: bool = False

    @field_validator("symptoms")
    @classmethod
    def known_symptoms(cls, v):
        bad = [s for s in v if s not in SYMPTOMS]
        if bad:
            raise ValueError(f"unknown symptom ids: {bad}")
        return v


class SimParamsIn(BaseModel):
    n_patients: Optional[int] = Field(None, ge=1, le=5000)
    arrival_rate_per_hour: float = Field(10.0, gt=0, le=60)
    n_dermatologists: int = Field(3, ge=1, le=20)
    ai_accuracy: float = Field(0.85, ge=0, le=1)
    diagnostic_capacity: int = Field(2, ge=1, le=10)
    treatment_capacity: int = Field(2, ge=1, le=10)
    operating_minutes: int = Field(480, ge=60, le=1440)
    days: int = Field(5, ge=1, le=30)
    workflow: Literal["traditional", "ai_assisted", "knowledge_augmented"] = "ai_assisted"
    doctor_accuracy: float = Field(0.80, ge=0, le=1)
    confidence_threshold: float = Field(0.70, ge=0, le=1)
    seed: int = 42
    speed: Optional[int] = Field(None, ge=1, le=2000)


class CompareIn(BaseModel):
    replications: int = Field(3, ge=1, le=10)
    scenarios: Optional[list[str]] = None
    base: Optional[SimParamsIn] = None
    wait: bool = False


class RagIn(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    k: int = Field(4, ge=1, le=8)
    disease: Optional[str] = None


class ReportIn(BaseModel):
    format: Literal["pdf", "csv", "json"] = "pdf"
    content: Literal["full", "scenarios", "cases"] = "full"


# =============================================================== helpers
async def _read_upload(image: UploadFile) -> tuple[bytes, str]:
    if image.content_type not in ALLOWED_MIME:
        raise HTTPException(415, f"Unsupported content type {image.content_type}; use JPEG/PNG/WEBP/BMP.")
    data = await image.read(int(MAX_UPLOAD_MB * 1024 * 1024) + 1)
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Image larger than {MAX_UPLOAD_MB} MB.")
    if cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR) is None:
        raise HTTPException(422, "File is not a decodable image.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.img"  # never trust client filenames
    (UPLOAD_DIR / name).write_bytes(data)
    return data, name


def _jsonable(o):
    return json.loads(json.dumps(o, default=lambda x: x.item() if hasattr(x, "item") else str(x)))


def _load_json(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


# =============================================================== endpoints
@app.get("/api/health")
def health():
    return {"status": "ok", "model_loaded": model_available(), "time": time.time(),
            "llm_configured": get_rag().llm_available}


@app.get("/api/meta")
def meta():
    return {"symptoms": [{"id": k, "label": v[0], "description": v[1]} for k, v in SYMPTOMS.items()],
            "diseases": list(DISEASES), "supported_classes": supported_classes() if model_available() else None,
            "scenarios": {k: {kk: vv for kk, vv in v.items() if kk != "overrides"} | {"overrides": v.get("overrides")}
                          for k, v in SCENARIOS.items()},
            "default_params": BASE.__dict__, "agents": AGENT_SPECS,
            "credit": "Designed and Developed by ALI RAZA", "university": "University of Central Punjab", "section": "AG2"}


@app.post("/api/patients", status_code=201)
def create_patient(p: PatientIn):
    pid = uuid.uuid4().hex
    get_db().add_patient(pid, p.model_dump())
    return {"id": pid, **p.model_dump(), "synthetic": True}


@app.get("/api/patients/{pid}")
def get_patient(pid: str):
    r = get_db().get_patient(pid)
    if not r:
        raise HTTPException(404, "patient not found")
    return r


@app.post("/api/diagnosis/predict")
async def diagnosis_predict(image: UploadFile = File(...)):
    data, _ = await _read_upload(image)
    return _jsonable(predict_skin_disease(data))


@app.post("/api/agents/run")
async def agents_run(image: Optional[UploadFile] = File(None), patient_id: Optional[str] = Form(None),
                     patient: Optional[str] = Form(None), override: Optional[str] = Form(None),
                     demo_image: Optional[str] = Form(None)):
    db = get_db()
    if patient_id:
        p = db.get_patient(patient_id)
        if not p:
            raise HTTPException(404, "patient not found")
    elif patient:
        try:
            p = PatientIn(**json.loads(patient)).model_dump()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"invalid patient JSON: {e}") from e
        patient_id = uuid.uuid4().hex
        db.add_patient(patient_id, p)
    else:
        raise HTTPException(422, "provide patient_id or patient")
    img_path, img_name = None, None
    if image is not None and image.filename:
        _, img_name = await _read_upload(image)
        img_path = str(UPLOAD_DIR / img_name)
    elif demo_image:
        cand = (DEMO_IMAGES_DIR / Path(demo_image).name)
        if not cand.exists():
            raise HTTPException(404, "demo image not found")
        img_path, img_name = str(cand), f"demo:{cand.name}"
    ov = None
    if override:
        try:
            ov = json.loads(override)
            if ov.get("final_diagnosis") and ov["final_diagnosis"] not in DISEASES:
                raise ValueError("final_diagnosis must be one of the knowledge-graph diseases")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"invalid override: {e}") from e
    qpos = len(db.list_cases(1000)) % 7 + 1
    case = run_case(p, img_path, ov, queue_position=qpos)
    case["patient_id"] = patient_id
    get_kg().add_case(case["case_id"], case["patient"]["symptoms"], case.get("final_diagnosis"))
    db.add_case(_jsonable(case), img_name)
    return _jsonable(case)


@app.get("/api/agents/specs")
def agent_specs():
    return AGENT_SPECS


@app.get("/api/workflow/graph")
def workflow_graph():
    return graph_structure()


@app.post("/api/simulation/start")
def sim_start(p: Optional[SimParamsIn] = None, fresh: bool = Query(True)):
    params = None
    if p is not None and (fresh or SIM.model is None):
        params = params_from_dict(p.model_dump(exclude={"speed"}))
    return SIM.start(params, speed=p.speed if p else None)


@app.post("/api/simulation/pause")
def sim_pause():
    return SIM.pause()


@app.post("/api/simulation/resume")
def sim_resume():
    return SIM.start(None)


@app.post("/api/simulation/reset")
def sim_reset():
    return SIM.reset()


@app.get("/api/simulation/status")
def sim_status():
    return _jsonable(SIM.status())


@app.get("/api/simulation/metrics")
def sim_metrics():
    return _jsonable(SIM.metrics())


def _compare(replications, keys, base):
    df = run_all(replications, base, keys)
    summ = summarise(df)
    out = {"created": time.time(), "replications": replications, "base_params": base.__dict__,
           "runs": to_records(df), "summary": to_records(summ),
           "scenarios": {k: {"title": v["title"], "purpose": v["purpose"]} for k, v in SCENARIOS.items()}}
    SCENARIO_CACHE.parent.mkdir(parents=True, exist_ok=True)
    SCENARIO_CACHE.write_text(json.dumps(out, default=str))
    df.to_csv(SCENARIO_CACHE.with_suffix(".csv"), index=False)
    get_db().add_run(uuid.uuid4().hex[:12], "scenario_comparison", {"replications": replications}, {"n_runs": len(df)})
    return out


@app.post("/api/scenarios/compare")
def scenarios_compare(req: CompareIn):
    keys = req.scenarios or list(SCENARIOS)
    bad = [k for k in keys if k not in SCENARIOS]
    if bad:
        raise HTTPException(422, f"unknown scenarios {bad}")
    base = params_from_dict(req.base.model_dump(exclude={"speed"})) if req.base else BASE
    if req.wait:
        return _jsonable(_compare(req.replications, keys, base))
    jid = JOBS.submit("scenario_comparison", _compare, req.replications, keys, base)
    return {"job_id": jid, "state": "queued"}


@app.get("/api/scenarios/latest")
def scenarios_latest():
    d = _load_json(SCENARIO_CACHE)
    if not d:
        raise HTTPException(404, "no comparison has been run yet")
    return d


@app.get("/api/jobs/{jid}")
def job(jid: str):
    j = JOBS.get(jid)
    if not j:
        raise HTTPException(404, "job not found")
    return _jsonable(j)


@app.get("/api/knowledge-graph")
def knowledge_graph(include_patients: bool = True):
    return _jsonable(get_kg().to_json(include_patients))


@app.get("/api/knowledge-graph/node/{node_id:path}")
def kg_node(node_id: str):
    kg = get_kg()
    if node_id not in kg.g:
        raise HTTPException(404, "node not found")
    nb = [{"id": v, "relation": d.get("relation"), "direction": "out", "label": kg.g.nodes[v].get("label"),
           "source_url": SOURCES.get(d.get("source"), {}).get("url")} for _, v, d in kg.g.out_edges(node_id, data=True)]
    nb += [{"id": u, "relation": d.get("relation"), "direction": "in", "label": kg.g.nodes[u].get("label"),
            "source_url": SOURCES.get(d.get("source"), {}).get("url")} for u, _, d in kg.g.in_edges(node_id, data=True)]
    return _jsonable({"id": node_id, **kg.g.nodes[node_id], "neighbours": nb})


@app.post("/api/rag/query")
def rag_query(q: RagIn):
    return _jsonable(get_rag().query(q.question, q.k, q.disease))


@app.get("/api/rag/sources")
def rag_sources():
    rag = get_rag()
    return {"sources": SOURCES, "n_chunks": len(rag.docs),
            "chunks": [{"id": d.metadata["id"], "disease": d.metadata["disease"], "section": d.metadata["section"],
                        "text": d.page_content, "source_title": d.metadata["source_title"],
                        "source_url": d.metadata["source_url"]} for d in rag.docs],
            "embedding": "LSA (TF-IDF word+char n-grams -> TruncatedSVD), LangChain Embeddings interface",
            "vector_store": "LangChain InMemoryVectorStore (persisted JSON)", "generator_llm": rag.llm_available}


@app.get("/api/cases")
def cases(limit: int = Query(100, ge=1, le=500)):
    return get_db().list_cases(limit)


@app.get("/api/cases/{cid}")
def case(cid: str):
    c = get_db().get_case(cid)
    if not c:
        raise HTTPException(404, "case not found")
    return c


@app.get("/api/model/info")
def model_info_ep():
    if not model_available():
        raise HTTPException(503, "model not trained")
    return {**model_info(), "supported_classes": supported_classes(),
            "evaluation": _load_json(MODEL_REPORTS_DIR / "evaluation_results.json"),
            "history": _load_json(MODEL_REPORTS_DIR / "training_history.json")}


@app.get("/api/dataset/summary")
def dataset_summary():
    return {"summary": _load_json(REPORTS_DIR / "dataset" / "dataset_summary.json"),
            "mapping": _load_json(REPORTS_DIR / "dataset" / "class_mapping.json"),
            "split": _load_json(ARTIFACTS / "data" / "split_log.json") or _load_json(REPORTS_DIR / "dataset" / "split_log.json")}


@app.get("/api/demo-images")
def demo_images():
    idx = _load_json(DEMO_IMAGES_DIR / "index.json") or []
    return idx


@app.get("/api/demo-images/{name}")
def demo_image(name: str):
    p = DEMO_IMAGES_DIR / Path(name).name
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p)


@app.get("/api/reports/files/{group}/{name}")
def report_file(group: Literal["dataset", "model", "scenarios"], name: str):
    p = (MODEL_REPORTS_DIR if group == "model" else REPORTS_DIR / group) / Path(name).name
    if not p.exists() or p.suffix not in {".png", ".csv", ".json", ".txt", ".ttl"}:
        raise HTTPException(404)
    return FileResponse(p)


def _analytics():
    db = get_db()
    cs = db.list_cases(500)
    dfc = pd.DataFrame(cs)
    case_stats = {}
    if len(dfc):
        case_stats = {"total": len(dfc),
                      "by_ai_status": dfc.ai_status.value_counts().to_dict(),
                      "by_decision": dfc.decision.value_counts().to_dict(),
                      "by_final_diagnosis": dfc.final_diagnosis.fillna("referral (no diagnosis)").value_counts().to_dict(),
                      "kg_status": dfc.kg_status.value_counts().to_dict(),
                      "improved_rate": float(dfc.improved.dropna().mean()) if dfc.improved.notna().any() else None,
                      "reassessment_rate": float((dfc.reassessments > 0).mean()),
                      "mean_ai_confidence": float(dfc.ai_confidence.dropna().mean()) if dfc.ai_confidence.notna().any() else None}
    return {"dataset": _load_json(REPORTS_DIR / "dataset" / "dataset_summary.json"),
            "model": _load_json(MODEL_REPORTS_DIR / "evaluation_results.json"),
            "cases": case_stats, "scenarios": _load_json(SCENARIO_CACHE),
            "simulation_runs": db.list_runs(limit=20), "live_simulation": SIM.status(),
            "kg": get_kg().to_json(False)["counts"], "rag_chunks": len(get_rag().docs)}


@app.get("/api/analytics")
def analytics():
    return _jsonable(_analytics())


@app.post("/api/reports/export")
def reports_export(r: ReportIn):
    a = _analytics()
    sc = a.get("scenarios")
    summ = pd.DataFrame(sc["summary"]) if sc else None
    stamp = time.strftime("%Y%m%d_%H%M")
    if r.format == "pdf":
        pdf = build_pdf(a if r.content == "full" else {k: a[k] for k in ("cases",)} if r.content == "cases" else {}, summ)
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="dermaagents_report_{stamp}.pdf"'})
    if r.format == "csv":
        if r.content == "cases":
            df = pd.DataFrame(get_db().list_cases(500))
        else:
            if not sc:
                raise HTTPException(404, "run a scenario comparison first")
            df = pd.DataFrame(sc["runs"])
        return Response(df.to_csv(index=False), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="dermaagents_{r.content}_{stamp}.csv"'})
    return Response(json.dumps(_jsonable(a), indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="dermaagents_{r.content}_{stamp}.json"'})


# =============================================================== frontend (SPA)
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets", check_dir=False), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        f = FRONTEND_DIST / full_path
        if full_path and f.is_file() and FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
