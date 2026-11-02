"""API tests + end-to-end integration: registration -> image -> agents -> KG -> treatment -> follow-up -> metrics."""
import json
import time

import pytest
from fastapi.testclient import TestClient

from conftest import ARTIFACTS
from dermaagents.api.main import app
from dermaagents.ml.inference import model_available

client = TestClient(app)
DEMO = ARTIFACTS / "demo_images"


def test_health_and_meta():
    assert client.get("/api/health").json()["status"] == "ok"
    m = client.get("/api/meta").json()
    assert len(m["symptoms"]) > 20 and len(m["scenarios"]) == 6 and m["credit"] == "Designed and Developed by ALI RAZA"


def test_patient_validation():
    assert client.post("/api/patients", json={"age": 200}).status_code == 422
    assert client.post("/api/patients", json={"age": 30, "symptoms": ["bogus"]}).status_code == 422
    r = client.post("/api/patients", json={"age": 30, "symptoms": ["itch"]})
    assert r.status_code == 201 and client.get(f"/api/patients/{r.json()['id']}").json()["age"] == 30


def test_upload_rejects_non_images():
    r = client.post("/api/diagnosis/predict", files={"image": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    r = client.post("/api/diagnosis/predict", files={"image": ("x.jpg", b"not really a jpeg", "image/jpeg")})
    assert r.status_code == 422


def test_kg_and_rag_endpoints():
    g = client.get("/api/knowledge-graph").json()
    assert g["n_nodes"] > 50 and g["n_edges"] > 80
    node = client.get("/api/knowledge-graph/node/D:Eczema").json()
    assert node["type"] == "Disease" and node["neighbours"]
    r = client.post("/api/rag/query", json={"question": "How is basal cell carcinoma treated?"}).json()
    assert r["references"] and r["generator"]
    assert client.post("/api/rag/query", json={"question": "x"}).status_code == 422


def test_simulation_lifecycle():
    client.post("/api/simulation/reset")
    s = client.post("/api/simulation/start", json={"days": 1, "arrival_rate_per_hour": 12, "speed": 2000}).json()
    assert s["state"] in ("running", "finished")
    for _ in range(100):
        st = client.get("/api/simulation/status").json()
        if st["state"] == "finished":
            break
        time.sleep(0.1)
    assert st["state"] == "finished"
    m = client.get("/api/simulation/metrics").json()
    assert m["metrics"]["arrived"] > 0 and m["timeseries"] and m["agents"]
    assert client.post("/api/simulation/reset").json()["state"] == "idle"


def test_simulation_pause_resume():
    client.post("/api/simulation/start", json={"days": 3, "speed": 1})
    assert client.post("/api/simulation/pause").json()["state"] == "paused"
    client.post("/api/simulation/reset")


def test_scenario_compare_sync_and_job():
    r = client.post("/api/scenarios/compare", json={"replications": 1, "wait": True, "scenarios": ["S1_traditional", "S2_ai_assisted"]}).json()
    assert {x["scenario"] for x in r["summary"]} == {"S1_traditional", "S2_ai_assisted"}
    j = client.post("/api/scenarios/compare", json={"replications": 1, "scenarios": ["S4_limited_derms"]}).json()
    for _ in range(100):
        st = client.get(f"/api/jobs/{j['job_id']}").json()
        if st["state"] in ("done", "error"):
            break
        time.sleep(0.1)
    assert st["state"] == "done"
    assert client.post("/api/scenarios/compare", json={"scenarios": ["nope"]}).status_code == 422


@pytest.mark.skipif(not model_available(), reason="model not trained")
def test_end_to_end_integration():
    # 1. registration
    pid = client.post("/api/patients", json={"age": 21, "severity": "moderate",
                                              "symptoms": ["comedones", "oily_skin", "inflamed_spots"]}).json()["id"]
    # 2. image upload + classification
    idx = json.loads((DEMO / "index.json").read_text())
    f = next(d for d in idx if d["label"] == "Acne")
    data = (DEMO / f["file"]).read_bytes()
    pred = client.post("/api/diagnosis/predict", files={"image": ("a.jpg", data, "image/jpeg")}).json()
    assert pred["status"] in {"confident", "uncertain", "outside_scope", "rejected_ood"}
    # 3-7. full agent workflow
    case = client.post("/api/agents/run", data={"patient_id": pid}, files={"image": ("a.jpg", data, "image/jpeg")}).json()
    assert case["ai"]["class_probabilities"] and case["review"]["decision"] and case["kg"]["status"]
    assert case["treatment"] and case["follow_up"]
    # human-in-the-loop override
    ov = client.post("/api/agents/run", data={"patient_id": pid, "override": json.dumps({"decision": "reject", "final_diagnosis": "Eczema"})},
                     files={"image": ("a.jpg", data, "image/jpeg")}).json()
    assert ov["review"]["decision"] == "human_override" and ov["final_diagnosis"] == "Eczema"
    # stored + visible in KG and analytics
    ids = [c["id"] for c in client.get("/api/cases").json()]
    assert case["case_id"] in ids
    assert client.get(f"/api/knowledge-graph/node/P:{case['case_id']}").status_code == 200
    an = client.get("/api/analytics").json()
    assert an["cases"]["total"] >= 2 and an["model"]["selected_backbone"]
    # 8. reports
    pdf = client.post("/api/reports/export", json={"format": "pdf", "content": "full"})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    csv = client.post("/api/reports/export", json={"format": "csv", "content": "cases"})
    assert csv.status_code == 200 and b"final_diagnosis" in csv.content
