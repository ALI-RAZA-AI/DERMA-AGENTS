"""Agent unit tests and LangGraph workflow routing tests."""
import json

import pytest

from conftest import ARTIFACTS
from dermaagents.agents.live import DermatologistAgent, PatientAgent, TreatmentAgent
from dermaagents.ml.inference import model_available
from dermaagents.workflow.graph import graph_structure, run_case


def test_patient_agent_filters_unknown_symptoms():
    tr = []
    p = PatientAgent().intake({"age": 30, "symptoms": ["itch", "made_up"]}, tr)
    assert p["symptoms"] == ["itch"] and tr[0]["ignored_unknown_symptoms"] == ["made_up"]


def test_dermatologist_accepts_confident_supported_prediction():
    tr = []
    ai = {"status": "confident", "predicted_class": "Acne", "confidence": 0.93, "prediction_set": ["Acne"]}
    d = DermatologistAgent().review({"symptoms": ["comedones", "oily_skin"]}, ai, {"sufficient": True, "reason": "ok"},
                                    None, None, 0, tr)
    assert d["decision"] == "accept" and d["final_diagnosis"] == "Acne" and d["evidence"]["references"]


def test_dermatologist_rejects_on_kg_conflict():
    ai = {"status": "confident", "predicted_class": "Acne", "confidence": 0.9, "prediction_set": ["Acne"]}
    d = DermatologistAgent().review({"symptoms": ["silvery_scales", "plaques_extensor"]}, ai,
                                    {"sufficient": True, "reason": "ok"}, None, None, 0, [])
    assert d["decision"] == "reject" and d["final_diagnosis"] == "Psoriasis"


def test_human_override_wins():
    d = DermatologistAgent().review({"symptoms": []}, {"predicted_class": "Acne"}, {"sufficient": True, "reason": ""},
                                    None, {"decision": "reject", "final_diagnosis": "Eczema"}, 0, [])
    assert d["decision"] == "human_override" and d["final_diagnosis"] == "Eczema"


def test_treatment_agent_is_deterministic_per_case_and_has_no_prescriptions():
    t = TreatmentAgent()
    a = t.simulate("case1", {"severity": "mild"}, "Eczema", 0, [])
    b = t.simulate("case1", {"severity": "mild"}, "Eczema", 0, [])
    assert a == b
    text = json.dumps(a).lower()
    assert " mg" not in text and "dose" not in text


def test_graph_has_all_nodes_and_conditional_edges():
    g = graph_structure()
    for n in ["patient_intake", "ai_diagnosis", "confidence_evaluation", "dermatologist_review", "kg_verification",
              "treatment_simulation", "follow_up", "reassessment"]:
        assert n in g["nodes"]
    assert any(e["conditional"] for e in g["edges"])


def test_route_without_image_goes_to_further_assessment():
    r = run_case({"age": 20, "symptoms": ["comedones", "oily_skin", "face_chest_back"]})
    assert "further_assessment" in r["route_log"] and r["final_diagnosis"] == "Acne"


def test_reassessment_loop_is_bounded():
    r = run_case({"age": 50, "symptoms": ["silvery_scales"]}, case_id="loopcheck")
    assert r["reassessment_count"] <= 2 and r["status"] in ("completed", "follow_up_unresolved")


@pytest.mark.skipif(not model_available(), reason="model not trained")
def test_full_workflow_with_real_image():
    idx = json.loads((ARTIFACTS / "demo_images" / "index.json").read_text())
    img = next(d for d in idx if d["label"] == "Acne")
    r = run_case({"age": 19, "symptoms": ["comedones", "oily_skin", "inflamed_spots"]},
                 str(ARTIFACTS / "demo_images" / img["file"]))
    assert r["ai"]["status"] in {"confident", "uncertain", "outside_scope", "rejected_ood"}
    assert r["route_log"][:3] == ["patient_intake", "ai_diagnosis", "confidence_evaluation"]
    assert r["route_log"][-1] == "follow_up"
    agents = {t["agent"] for t in r["trace"] if "agent" in t}
    assert {"PatientAgent", "ClinicEnvironmentAgent", "AIDiagnosticAgent", "DermatologistAgent", "TreatmentAgent"} <= agents
