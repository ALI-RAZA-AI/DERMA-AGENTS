"""LangGraph per-patient workflow.

Nodes: patient_intake -> ai_diagnosis -> confidence_evaluation
       -> (sufficient)   dermatologist_review
       -> (insufficient) further_assessment -> dermatologist_review
       dermatologist_review -> kg_verification
       kg_verification -> (conflict & not yet re-reviewed | AI rejected) reassessment -> dermatologist_review
                       -> (ok) treatment_simulation -> follow_up
       follow_up -> (not improved & attempts left) reassessment -> dermatologist_review | END
State is checkpointed per case (thread_id = case_id) with LangGraph's InMemorySaver.
"""
from __future__ import annotations

import operator
import time
import uuid
from typing import Annotated, Any, Optional, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from ..agents.live import AIDiagnosticAgent, ClinicEnvironmentAgent, DermatologistAgent, PatientAgent, TreatmentAgent

MAX_REASSESSMENTS = 2


class CaseState(TypedDict, total=False):
    case_id: str
    patient_input: dict
    image_path: Optional[str]
    override: Optional[dict]
    queue_position: int
    patient: dict
    admission: dict
    ai: dict
    confidence: dict
    further_assessment: bool
    review: dict
    kg: dict
    treatment: dict
    follow_up: dict
    reassessment_count: int
    reassessment_reasons: Annotated[list, operator.add]
    route_log: Annotated[list, operator.add]
    trace: Annotated[list, operator.add]
    final_diagnosis: Optional[str]
    status: str


AGENTS = {"patient": PatientAgent(), "env": ClinicEnvironmentAgent(), "ai": AIDiagnosticAgent(),
          "derm": DermatologistAgent(), "treat": TreatmentAgent()}


def _t(node: str, fn):
    """Wrap a node so every execution is timed and recorded."""
    def run(state: CaseState):
        t0 = time.perf_counter()
        trace: list = []
        out = fn(state, trace)
        trace.append({"node": node, "elapsed_ms": round(1000 * (time.perf_counter() - t0), 1)})
        out["trace"] = trace
        out.setdefault("route_log", [])
        out["route_log"] = out["route_log"] + [node]
        return out
    return run


def patient_intake(s: CaseState, trace):
    p = AGENTS["patient"].intake(s["patient_input"], trace)
    adm = AGENTS["env"].admit(s["case_id"], s.get("queue_position", 1), trace)
    return {"patient": p, "admission": adm, "reassessment_count": 0, "status": "intake_done"}


def ai_diagnosis(s: CaseState, trace):
    return {"ai": AGENTS["ai"].diagnose(s.get("image_path"), trace), "status": "ai_done"}


def confidence_evaluation(s: CaseState, trace):
    c = AGENTS["ai"].evaluate_confidence(s["ai"], trace)
    return {"confidence": c, "further_assessment": not c["sufficient"]}


def further_assessment(s: CaseState, trace):
    trace.append({"agent": "DermatologistAgent", "action": "further_assessment_requested",
                  "reason": s["confidence"]["reason"]})
    return {"status": "further_assessment"}


def dermatologist_review(s: CaseState, trace):
    r = AGENTS["derm"].review(s["patient"], s["ai"], s["confidence"], s.get("kg"), s.get("override"),
                              s.get("reassessment_count", 0), trace)
    return {"review": r, "final_diagnosis": r["final_diagnosis"], "status": "reviewed"}


def kg_verification(s: CaseState, trace):
    return {"kg": AGENTS["derm"].kg_verification(s["patient"], s["review"], trace)}


def treatment_simulation(s: CaseState, trace):
    t = AGENTS["treat"].simulate(s["case_id"], s["patient"], s.get("final_diagnosis"),
                                 s.get("reassessment_count", 0), trace)
    return {"treatment": t, "status": "treated"}


def follow_up(s: CaseState, trace):
    f = AGENTS["treat"].follow_up(s["treatment"], trace)
    done = not f["reassessment_required"] or s.get("reassessment_count", 0) >= MAX_REASSESSMENTS
    return {"follow_up": f, "status": "completed" if done else "follow_up_unresolved"}


def reassessment(s: CaseState, trace):
    if s.get("status") == "follow_up_unresolved":
        reason = "No simulated response at follow-up"
    elif s.get("review", {}).get("decision") == "reject":
        reason = "Dermatologist rejected the AI prediction"
    else:
        reason = "Knowledge graph reported conflicting evidence"
    n = s.get("reassessment_count", 0) + 1
    trace.append({"agent": "ClinicEnvironmentAgent", "action": "reassessment_scheduled", "reason": reason, "n": n})
    # on re-review, the AI's suggestion is no longer trusted blindly
    conf = {"sufficient": False, "reason": f"reassessment: {reason}"}
    return {"reassessment_count": n, "reassessment_reasons": [reason], "confidence": conf, "status": "reassessment"}


# ------------------------------------------------------------- routing
def route_confidence(s: CaseState) -> str:
    return "dermatologist_review" if s["confidence"]["sufficient"] else "further_assessment"


def route_after_kg(s: CaseState) -> str:
    n = s.get("reassessment_count", 0)
    if s.get("review", {}).get("decision") == "human_override":
        return "treatment_simulation"
    if n < MAX_REASSESSMENTS and (s["kg"].get("conflict") or s["review"]["decision"] == "reject"):
        return "reassessment"
    return "treatment_simulation"


def route_after_follow_up(s: CaseState) -> str:
    return END if s["status"] == "completed" else "reassessment"


def build_graph():
    g = StateGraph(CaseState)
    for name, fn in [("patient_intake", patient_intake), ("ai_diagnosis", ai_diagnosis),
                     ("confidence_evaluation", confidence_evaluation), ("further_assessment", further_assessment),
                     ("dermatologist_review", dermatologist_review), ("kg_verification", kg_verification),
                     ("treatment_simulation", treatment_simulation), ("follow_up", follow_up),
                     ("reassessment", reassessment)]:
        g.add_node(name, _t(name, fn))
    g.add_edge(START, "patient_intake")
    g.add_edge("patient_intake", "ai_diagnosis")
    g.add_edge("ai_diagnosis", "confidence_evaluation")
    g.add_conditional_edges("confidence_evaluation", route_confidence,
                            {"dermatologist_review": "dermatologist_review", "further_assessment": "further_assessment"})
    g.add_edge("further_assessment", "dermatologist_review")
    g.add_edge("dermatologist_review", "kg_verification")
    g.add_conditional_edges("kg_verification", route_after_kg,
                            {"reassessment": "reassessment", "treatment_simulation": "treatment_simulation"})
    g.add_edge("reassessment", "dermatologist_review")
    g.add_edge("treatment_simulation", "follow_up")
    g.add_conditional_edges("follow_up", route_after_follow_up, {"reassessment": "reassessment", END: END})
    return g


_CHECKPOINTER = InMemorySaver()
_APP = None


def get_app():
    global _APP
    if _APP is None:
        _APP = build_graph().compile(checkpointer=_CHECKPOINTER)
    return _APP


def graph_structure() -> dict:
    g = get_app().get_graph()
    return {"nodes": [n for n in g.nodes], "edges": [{"source": e.source, "target": e.target,
                                                      "conditional": e.conditional} for e in g.edges],
            "mermaid": g.draw_mermaid()}


def run_case(patient: dict, image_path: str | None = None, override: dict | None = None,
             case_id: str | None = None, queue_position: int = 1) -> dict[str, Any]:
    case_id = case_id or uuid.uuid4().hex
    app = get_app()
    t0 = time.perf_counter()
    final = app.invoke({"case_id": case_id, "patient_input": patient, "image_path": image_path,
                        "override": override, "queue_position": queue_position,
                        "reassessment_reasons": [], "route_log": [], "trace": []},
                       {"configurable": {"thread_id": case_id}, "recursion_limit": 40})
    final["elapsed_ms"] = round(1000 * (time.perf_counter() - t0), 1)
    return dict(final)
