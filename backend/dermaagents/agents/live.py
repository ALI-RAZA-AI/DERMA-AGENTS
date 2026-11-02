"""Live (per-patient) agents used inside the LangGraph workflow.

Each agent: defined responsibilities (see specs.py), explicit inputs/outputs,
internal state, deterministic decision rules and an execution log. They call
real Python functions through LangChain tools (classifier, KG, RAG).
"""
from __future__ import annotations

import hashlib
import time

import numpy as np

from ..knowledge.facts import DISEASES, SYMPTOMS
from ..knowledge.graph import get_kg
from .tools import classify_skin_image, kg_disease_profile, kg_verify_prediction, retrieve_dermatology_knowledge


def _now():
    return time.strftime("%H:%M:%S")


class LiveAgent:
    name = "Agent"

    def __init__(self):
        self.state: dict = {"invocations": 0}

    def log(self, trace: list, action: str, **data):
        self.state["invocations"] += 1
        trace.append({"time": _now(), "agent": self.name, "action": action, **data})


class PatientAgent(LiveAgent):
    name = "PatientAgent"

    def intake(self, patient: dict, trace: list) -> dict:
        syms = [s for s in patient.get("symptoms", []) if s in SYMPTOMS]
        unknown = [s for s in patient.get("symptoms", []) if s not in SYMPTOMS]
        rec = {"name": patient.get("name") or "Synthetic patient", "age": int(patient.get("age", 30)),
               "gender": patient.get("gender", "unspecified"), "severity": patient.get("severity", "moderate"),
               "symptoms": syms, "history": patient.get("history", ""),
               "previous_treatment": bool(patient.get("previous_treatment", False))}
        self.log(trace, "intake", symptoms=len(syms), ignored_unknown_symptoms=unknown, severity=rec["severity"])
        return rec


class ClinicEnvironmentAgent(LiveAgent):
    name = "ClinicEnvironmentAgent"

    def admit(self, case_id: str, queue_position: int, trace: list) -> dict:
        slot = {"queue_position": queue_position, "estimated_wait_min": 5 * max(0, queue_position - 1),
                "appointment": f"Room {1 + queue_position % 3}"}
        self.log(trace, "admitted", **slot)
        return slot


class AIDiagnosticAgent(LiveAgent):
    name = "AIDiagnosticAgent"

    def diagnose(self, image_path: str | None, trace: list) -> dict:
        if not image_path:
            self.log(trace, "no_image", note="No image supplied - AI diagnosis skipped")
            return {"status": "no_image", "predicted_class": None, "confidence": None, "flags": ["no_image"]}
        res = classify_skin_image.invoke({"image_path": image_path})
        self.log(trace, "classified", status=res.get("status"), predicted=res.get("predicted_class"),
                 top_dataset_class=res.get("top_dataset_class"), confidence=res.get("confidence"),
                 prediction_set=res.get("prediction_set"), ood_score=res.get("ood_score"))
        return res

    def evaluate_confidence(self, ai: dict, trace: list) -> dict:
        ok = ai.get("status") == "confident"
        out = {"sufficient": ok, "reason": "single-class conformal set, in-distribution" if ok else
               (ai.get("warning") or ai.get("status"))}
        self.log(trace, "confidence_evaluated", **out)
        return out


class DermatologistAgent(LiveAgent):
    """Rule-based *simulated* reviewer (not a medical professional)."""
    name = "DermatologistAgent"

    def review(self, patient: dict, ai: dict, conf_eval: dict, kg_check: dict | None, override: dict | None,
               reassessment_count: int, trace: list) -> dict:
        syms = patient["symptoms"]
        if override and (override.get("final_diagnosis") or override.get("decision")):
            fd = override.get("final_diagnosis") or ai.get("predicted_class")
            d = {"decision": "human_override", "final_diagnosis": fd,
                 "rationale": f"Human-in-the-loop override by {override.get('reviewer', 'user')}: "
                              f"{override.get('decision', 'set diagnosis')} -> {fd}"}
            self.log(trace, "human_override", **d)
            return d
        pred = ai.get("predicted_class")
        if conf_eval["sufficient"] and pred:
            v = kg_verify_prediction.invoke({"disease": pred, "symptoms": syms})
            if v["status"] in ("supported", "insufficient_symptoms", "weak_evidence") and not (kg_check and kg_check.get("conflict")):
                d = {"decision": "accept", "final_diagnosis": pred,
                     "rationale": f"AI confident ({ai.get('confidence')}); KG status '{v['status']}'."}
            else:
                alt = v["kg_best"]
                d = {"decision": "reject", "final_diagnosis": alt,
                     "rationale": f"Reported symptoms favour {alt} over AI suggestion {pred} (KG conflict)."}
        else:
            # further assessment: combine conformal set (if any) with symptom evidence from the KG
            scores = kg_verify_prediction.invoke({"disease": "", "symptoms": syms})["scores"] if syms else {}
            cand = [c for c in (ai.get("prediction_set") or []) if c]
            enabled = ai.get("supported_classes", {}).get("enabled_map", {})
            cand = [enabled.get(c, c) for c in cand if enabled.get(c, c) in DISEASES]
            pool = cand or [k for k, v in scores.items() if v > 0]
            if pool and scores:
                best = max(pool, key=lambda c: scores.get(c, 0))
                if scores.get(best, 0) >= 0.25:
                    d = {"decision": "further_assessment", "final_diagnosis": best,
                         "rationale": f"AI uncertain ({conf_eval['reason']}); symptom evidence favours {best} "
                                      f"(KG score {scores[best]:.2f})."}
                else:
                    d = {"decision": "further_assessment", "final_diagnosis": None,
                         "rationale": "AI uncertain and symptom evidence weak - refer for in-person specialist assessment."}
            else:
                d = {"decision": "further_assessment", "final_diagnosis": None,
                     "rationale": "AI uncertain and no usable symptoms - refer for in-person specialist assessment."}
        if reassessment_count:
            d["rationale"] += f" (re-review #{reassessment_count})"
        fd = d["final_diagnosis"]
        d["evidence"] = retrieve_dermatology_knowledge.invoke(
            {"question": f"Key features, differentials and when to escalate {fd or 'an uncertain skin lesion'}",
             "disease": fd or ""})
        self.log(trace, "review", decision=d["decision"], final_diagnosis=fd, rationale=d["rationale"],
                 references=len(d["evidence"]["references"]))
        return d

    def kg_verification(self, patient: dict, decision: dict, trace: list) -> dict:
        fd = decision.get("final_diagnosis")
        v = kg_verify_prediction.invoke({"disease": fd or "", "symptoms": patient["symptoms"]})
        out = {k: v[k] for k in ("status", "conflict", "kg_best", "differentials") if k in v}
        out["scores"] = v.get("scores", {})
        out["supporting_symptoms"] = v.get("supporting_symptoms", [])
        if fd:
            out["profile"] = kg_disease_profile.invoke({"disease": fd})
        self.log(trace, "kg_verification", status=out["status"], conflict=out.get("conflict"), kg_best=out.get("kg_best"))
        return out


class TreatmentAgent(LiveAgent):
    name = "TreatmentAgent"

    def simulate(self, case_id: str, patient: dict, final_diagnosis: str | None, attempt: int, trace: list) -> dict:
        seed = int(hashlib.sha256(f"{case_id}:{attempt}".encode()).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)
        if not final_diagnosis:
            out = {"pathway": [{"stage": "Referral for in-person dermatology assessment (simulated)", "weeks": 2,
                                "responded": None}], "improved": None, "weeks": 2,
                   "note": "No diagnosis reached - no care pathway simulated."}
            self.log(trace, "referral_only", **{k: v for k, v in out.items() if k != "pathway"})
            return out
        prof = kg_disease_profile.invoke({"disease": final_diagnosis})
        stages = get_kg().pathway(final_diagnosis)
        sev = {"mild": 1.1, "moderate": 1.0, "severe": 0.85}.get(patient.get("severity"), 1.0)
        trace_st, weeks, improved = [], 0, False
        for st in stages:
            weeks += st["weeks"]
            ok = bool(rng.random() < min(0.98, st["p_response"] * sev))
            trace_st.append({"stage": st["label"], "category": st["category"], "weeks": st["weeks"],
                             "responded": ok, "p_response_param": st["p_response"]})
            if ok:
                improved = True
                break
        out = {"pathway": trace_st, "improved": improved, "weeks": weeks,
               "follow_up_weeks": prof["follow_up_weeks"],
               "note": "Simulated category-level care pathway; response probabilities are synthetic parameters."}
        self.log(trace, "pathway_simulated", diagnosis=final_diagnosis, improved=improved, weeks=weeks,
                 stages=len(trace_st))
        return out

    def follow_up(self, treatment: dict, trace: list) -> dict:
        imp = treatment.get("improved")
        out = {"scheduled_after_weeks": treatment.get("follow_up_weeks"),
               "status": "resolved" if imp else ("referral" if imp is None else "not_improved"),
               "reassessment_required": imp is False}
        self.log(trace, "follow_up", **out)
        return out
