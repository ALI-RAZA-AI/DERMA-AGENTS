"""Mesa agent-based model of a dermatology clinic.

One step = one simulated minute. The clinic operates `operating_minutes` per day
for `days` days. All patients/diseases are synthetic.

Workflows:
  traditional          Patient -> Dermatologist -> Treatment
  ai_assisted          Patient -> AI -> Dermatologist -> Treatment
  knowledge_augmented  Patient -> AI -> Dermatologist (+ knowledge-graph check) -> Treatment

The AI accuracy is an *experiment parameter* (independent of the real image
classifier); AI confidence values are sampled from the real classifier's
test-set confidence distributions for correct / incorrect predictions when
available (artifacts/reports/model/confidence_profile.json).
"""
from __future__ import annotations

import json
import math
from collections import deque
from dataclasses import dataclass, field, asdict

import mesa
import numpy as np

from ..config import MODEL_REPORTS_DIR, REPORTS_DIR
from ..knowledge.facts import DISEASES, PATHWAYS
from ..knowledge.graph import get_kg

SIM_DISEASES = ["Acne", "Eczema", "Psoriasis", "Melanoma", "Basal Cell Carcinoma", "Seborrheic Keratosis"]
# synthetic case-mix (simulation parameter, not epidemiological data)
DEFAULT_CASE_MIX = {"Acne": 0.30, "Eczema": 0.25, "Psoriasis": 0.15, "Melanoma": 0.06,
                    "Basal Cell Carcinoma": 0.09, "Seborrheic Keratosis": 0.15}
MALIGNANT = {"Melanoma", "Basal Cell Carcinoma"}


@dataclass
class SimParams:
    n_patients: int | None = None        # cap on arrivals (None = arrivals limited by time only)
    arrival_rate_per_hour: float = 10.0
    n_dermatologists: int = 3
    ai_accuracy: float = 0.85
    diagnostic_capacity: int = 2         # parallel AI diagnostic stations
    treatment_capacity: int = 2          # parallel treatment-planning desks
    operating_minutes: int = 480
    days: int = 5
    workflow: str = "ai_assisted"        # traditional | ai_assisted | knowledge_augmented
    doctor_accuracy: float = 0.80        # unaided dermatologist accuracy (synthetic)
    confidence_threshold: float = 0.70   # dermatologist trusts AI above this confidence
    waiting_tolerance_mean: float = 150.0
    seed: int = 42
    case_mix: dict = field(default_factory=lambda: dict(DEFAULT_CASE_MIX))

    def validate(self):
        assert self.workflow in ("traditional", "ai_assisted", "knowledge_augmented"), self.workflow
        assert 0 <= self.ai_accuracy <= 1 and self.n_dermatologists >= 1 and self.arrival_rate_per_hour > 0
        assert self.diagnostic_capacity >= 1 and self.treatment_capacity >= 1 and self.operating_minutes > 0
        return self


def _confidence_profile():
    p = MODEL_REPORTS_DIR / "confidence_profile.json"
    if p.exists():
        d = json.loads(p.read_text())
        return np.array(d["correct"]), np.array(d["incorrect"]), "real classifier test-set distribution"
    rng = np.random.default_rng(0)
    return rng.beta(8, 2, 500), rng.beta(3, 3, 500), "fallback beta distributions"


# ======================================================================= agents
class LoggingMixin:
    def log(self, event: str, **data):
        self.model.record_event(self, event, data)


class PatientAgent(LoggingMixin, mesa.Agent):
    def __init__(self, model, follow_up_of=None):
        super().__init__(model)
        rng = model.rng_patients  # separate stream -> common random numbers across workflows
        names, probs = zip(*model.p.case_mix.items())
        self.true_disease = str(rng.choice(names, p=np.array(probs) / sum(probs)))
        self.age = int(np.clip(rng.normal(58 if self.true_disease in MALIGNANT | {"Seborrheic Keratosis"} else 28, 14), 2, 95))
        self.gender = str(rng.choice(["female", "male"]))
        self.severity = str(rng.choice(["mild", "moderate", "severe"], p=[0.5, 0.35, 0.15]))
        prof = model.kg.symptoms_of(self.true_disease)
        self.symptoms = [s for s, w in prof.items() if rng.random() < 0.15 + 0.75 * w]
        if rng.random() < 0.15:  # noisy / atypical presentation
            other = rng.choice([d for d in SIM_DISEASES if d != self.true_disease])
            self.symptoms.append(str(rng.choice(list(model.kg.symptoms_of(other)))))
        self.waiting_tolerance = float(rng.exponential(model.p.waiting_tolerance_mean) + 30)
        self.previous_treatment = bool(rng.random() < 0.3)
        self.arrival = model.minute
        self.status = "waiting_ai" if model.p.workflow != "traditional" else "waiting_derm"
        self.ai_result = None
        self.final_diagnosis = None
        self.decision = None
        self.consult_start = None
        self.diagnosed_at = None
        self.reassessed = False
        self.outcome = None
        self.follow_up_of = follow_up_of
        self.log("arrived", disease_hidden=self.true_disease, severity=self.severity, symptoms=len(self.symptoms))

    @property
    def priority(self):
        sus = self.ai_result and self.ai_result["prediction"] in MALIGNANT
        return 0 if sus or self.severity == "severe" else 1

    def step(self):
        if self.status in ("waiting_ai", "waiting_derm") and self.model.minute - self.arrival > self.waiting_tolerance:
            self.status = "left"
            self.model.left_without_seen += 1
            self.model.env.remove_from_queues(self)
            self.log("left_without_being_seen", waited=self.model.minute - self.arrival)


class AIDiagnosticAgent(LoggingMixin, mesa.Agent):
    """Simulated diagnostic station (accuracy = experiment parameter)."""

    def __init__(self, model):
        super().__init__(model)
        self.busy_until = -1
        self.current = None
        self.processed = 0
        self.uncertain = 0
        self.busy_minutes = 0

    def diagnose(self, patient: PatientAgent) -> dict:
        rng, p = self.model.rng, self.model.p
        correct = rng.random() < p.ai_accuracy
        if correct:
            pred = patient.true_disease
            conf = float(rng.choice(self.model.conf_correct))
        else:
            diffs = [d for d in DISEASES[patient.true_disease]["differentials"] if d in SIM_DISEASES]
            pool = diffs if diffs and rng.random() < 0.7 else [d for d in SIM_DISEASES if d != patient.true_disease]
            pred = str(rng.choice(pool))
            conf = float(rng.choice(self.model.conf_incorrect))
        uncertain = conf < p.confidence_threshold
        self.uncertain += uncertain
        return {"prediction": pred, "confidence": round(conf, 3), "correct": correct, "uncertain": uncertain}

    def step(self):
        m = self.model
        if self.current is not None and m.minute >= self.busy_until:
            pt = self.current
            pt.ai_result = self.diagnose(pt)
            pt.status = "waiting_derm"
            m.env.derm_queue.append(pt)
            self.processed += 1
            self.log("ai_result", patient=pt.unique_id, **{k: v for k, v in pt.ai_result.items() if k != "correct"})
            self.current = None
        if self.current is None and m.env.ai_queue:
            pt = m.env.ai_queue.popleft()
            if pt.status != "waiting_ai":
                return
            self.current = pt
            pt.status = "in_ai"
            dur = max(1, int(round(m.rng.normal(3, 0.7))))
            self.busy_until = m.minute + dur
        if self.current is not None:
            self.busy_minutes += 1


class DermatologistAgent(LoggingMixin, mesa.Agent):
    def __init__(self, model):
        super().__init__(model)
        self.busy_until = -1
        self.current = None
        self.consults = 0
        self.busy_minutes = 0
        self.accepted = 0
        self.rejected = 0

    # ---- decision rules -------------------------------------------------
    def review(self, pt: PatientAgent) -> tuple[str, str, float, dict]:
        """Returns (final_diagnosis, decision, consult_minutes, details)."""
        m, rng, p = self.model, self.model.rng, self.model.p
        own_correct = rng.random() < p.doctor_accuracy
        own = pt.true_disease if own_correct else str(rng.choice(
            [d for d in DISEASES[pt.true_disease]["differentials"] if d in SIM_DISEASES] or
            [d for d in SIM_DISEASES if d != pt.true_disease]))
        details = {}
        if p.workflow == "traditional" or pt.ai_result is None:
            return own, "unaided", max(6.0, rng.normal(14, 3)), details
        ai = pt.ai_result
        minutes = max(4.0, rng.normal(9, 2))
        kg_conflict = False
        if p.workflow == "knowledge_augmented":
            v = m.kg.verify(ai["prediction"], pt.symptoms)
            kg_conflict = v["conflict"]
            details["kg_status"] = v["status"]
            m.kg_checks += 1
            m.kg_agreements += int(v["status"] == "supported")
            minutes += max(0.5, rng.normal(1.5, 0.4))
        if kg_conflict:
            # KG flags contradictory evidence -> reject AI, further review / reassessment
            final = own if own != ai["prediction"] else str(m.kg.verify(None, pt.symptoms)["kg_best"])
            return final, "rejected_kg_conflict", minutes + max(2.0, rng.normal(6, 1.5)), details
        if not ai["uncertain"]:
            # automation bias: a confident AI is usually accepted, even if the doctor's own view differs
            if own == ai["prediction"] or rng.random() < 0.75:
                return ai["prediction"], "accepted", minutes, details
            return own, "rejected", minutes + max(2.0, rng.normal(6, 1.5)), details
        # uncertain AI -> further assessment by the dermatologist (own judgement, longer consult)
        return own, "further_assessment", minutes + max(3.0, rng.normal(7, 2)), details

    def step(self):
        m = self.model
        if self.current is not None and m.minute >= self.busy_until:
            pt, (final, decision, _, details) = self.current
            pt.final_diagnosis, pt.decision = final, decision
            pt.diagnosed_at = m.minute
            self.consults += 1
            if pt.ai_result is not None:
                agree = final == pt.ai_result["prediction"]
                m.ai_reviews += 1
                m.disagreements += int(not agree)
                self.accepted += int(agree)
                self.rejected += int(not agree)
            needs_reassess = decision in ("rejected_kg_conflict",) and not pt.reassessed
            self.log("review_complete", patient=pt.unique_id, decision=decision, final=final,
                     ai=pt.ai_result["prediction"] if pt.ai_result else None, **details)
            if needs_reassess:
                pt.reassessed = True
                pt.status = "waiting_derm"
                m.reassessments += 1
                m.env.derm_queue.append(pt)  # short reassessment consult
            else:
                pt.status = "waiting_treatment"
                m.env.treatment_queue.append(pt)
            self.current = None
        if self.current is None:
            pt = m.env.next_for_derm()
            if pt is not None:
                if pt.consult_start is None:
                    pt.consult_start = m.minute
                    m.wait_times.append(m.minute - pt.arrival)
                pt.status = "in_consult"
                rev = self.review(pt)
                minutes = rev[2] if not (pt.reassessed and pt.final_diagnosis) else max(4.0, m.rng.normal(8, 2))
                self.current = (pt, rev)
                self.busy_until = m.minute + int(math.ceil(minutes))
        if self.current is not None:
            self.busy_minutes += 1


class TreatmentAgent(LoggingMixin, mesa.Agent):
    def __init__(self, model):
        super().__init__(model)
        self.busy_until = -1
        self.current = None
        self.planned = 0
        self.busy_minutes = 0

    def simulate_pathway(self, pt: PatientAgent) -> dict:
        rng = self.model.rng
        stages = self.model.kg.pathway(pt.final_diagnosis) or [dict(label="Specialist review", p_response=0.5, weeks=8)]
        match = pt.final_diagnosis == pt.true_disease or \
            DISEASES.get(pt.final_diagnosis, {}).get("parent") == pt.true_disease
        sev_mult = {"mild": 1.1, "moderate": 1.0, "severe": 0.85}[pt.severity]
        weeks, trace = 0, []
        for st in stages:
            pr = st["p_response"] * sev_mult * (1.0 if match else 0.35)
            weeks += st["weeks"]
            ok = rng.random() < min(pr, 0.98)
            trace.append({"stage": st["label"], "weeks": st["weeks"], "responded": bool(ok)})
            if ok:
                return {"improved": True, "weeks": weeks, "trace": trace, "matched": match}
        return {"improved": False, "weeks": weeks, "trace": trace, "matched": match}

    def step(self):
        m = self.model
        if self.current is not None and m.minute >= self.busy_until:
            pt = self.current
            pt.outcome = self.simulate_pathway(pt)
            pt.status = "treated"
            m.served.append(pt)
            m.diag_times.append(pt.diagnosed_at - pt.arrival)
            if not pt.outcome["improved"]:
                m.followup_reassessments += 1
            self.planned += 1
            self.log("pathway_assigned", patient=pt.unique_id, diagnosis=pt.final_diagnosis,
                     improved=pt.outcome["improved"], weeks=pt.outcome["weeks"])
            self.current = None
        if self.current is None and m.env.treatment_queue:
            self.current = m.env.treatment_queue.popleft()
            self.current.status = "in_treatment_planning"
            self.busy_until = m.minute + max(1, int(round(m.rng.normal(4, 1))))
        if self.current is not None:
            self.busy_minutes += 1


class ClinicEnvironmentAgent(LoggingMixin, mesa.Agent):
    def __init__(self, model):
        super().__init__(model)
        self.ai_queue: deque = deque()
        self.derm_queue: list = []
        self.treatment_queue: deque = deque()
        self.arrivals = 0

    def remove_from_queues(self, pt):
        if pt in self.ai_queue:
            self.ai_queue.remove(pt)
        if pt in self.derm_queue:
            self.derm_queue.remove(pt)

    def next_for_derm(self):
        q = [p for p in self.derm_queue if p.status == "waiting_derm"]
        self.derm_queue = q
        if not q:
            return None
        q.sort(key=lambda p: (p.priority, p.arrival))
        pt = q.pop(0)
        return pt

    def step(self):
        m = self.model
        if not m.is_open():
            return
        lam = m.p.arrival_rate_per_hour / 60.0
        k = m.rng_arrivals.poisson(lam)
        for _ in range(k):
            if m.p.n_patients is not None and self.arrivals >= m.p.n_patients:
                break
            pt = PatientAgent(m)
            self.arrivals += 1
            (self.ai_queue if m.p.workflow != "traditional" else self.derm_queue).append(pt)

    @property
    def congestion(self):
        return len(self.derm_queue) / max(1, self.model.p.n_dermatologists)


# ======================================================================= model
class ClinicModel(mesa.Model):
    def __init__(self, params: SimParams | None = None, **kw):
        self.p = (params or SimParams(**kw)).validate()
        super().__init__(rng=self.p.seed)
        self.rng_arrivals = np.random.default_rng([self.p.seed, 1])
        self.rng_patients = np.random.default_rng([self.p.seed, 2])
        self.minute = 0
        self.kg = get_kg()
        self.conf_correct, self.conf_incorrect, self.conf_source = _confidence_profile()
        self.env = ClinicEnvironmentAgent(self)
        self.ai_agents = [AIDiagnosticAgent(self) for _ in range(self.p.diagnostic_capacity)] \
            if self.p.workflow != "traditional" else []
        self.derms = [DermatologistAgent(self) for _ in range(self.p.n_dermatologists)]
        self.treatment_agents = [TreatmentAgent(self) for _ in range(self.p.treatment_capacity)]
        self.served, self.wait_times, self.diag_times = [], [], []
        self.left_without_seen = self.reassessments = self.followup_reassessments = 0
        self.ai_reviews = self.disagreements = self.kg_checks = self.kg_agreements = 0
        self.events: deque = deque(maxlen=4000)
        self.total_minutes = self.p.operating_minutes * self.p.days
        self.datacollector = mesa.DataCollector(model_reporters={
            "minute": lambda m: m.minute,
            "queue_ai": lambda m: len(m.env.ai_queue),
            "queue_derm": lambda m: len([p for p in m.env.derm_queue if p.status == "waiting_derm"]),
            "queue_treatment": lambda m: len(m.env.treatment_queue),
            "busy_derms": lambda m: sum(d.current is not None for d in m.derms),
            "served": lambda m: len(m.served),
            "arrived": lambda m: m.env.arrivals,
            "left": lambda m: m.left_without_seen,
            "avg_wait": lambda m: float(np.mean(m.wait_times)) if m.wait_times else 0.0,
        })

    def is_open(self):
        return self.minute < self.total_minutes

    def record_event(self, agent, event, data):
        self.events.append({"t": self.minute, "day": self.minute // self.p.operating_minutes + 1,
                            "agent": type(agent).__name__, "agent_id": agent.unique_id, "event": event, **data})

    def step(self):
        # deterministic stage order (environment -> patients -> AI -> derms -> treatment)
        self.env.step()
        for pt in list(self.agents_by_type.get(PatientAgent, [])):
            pt.step()
        for a in self.ai_agents:
            a.step()
        for d in self.derms:
            d.step()
        for t in self.treatment_agents:
            t.step()
        if self.minute % 5 == 0:
            self.datacollector.collect(self)
        self.minute += 1

    def done(self):
        pending = (self.env.ai_queue or any(p.status == "waiting_derm" for p in self.env.derm_queue)
                   or self.env.treatment_queue or any(d.current for d in self.derms)
                   or any(a.current for a in self.ai_agents) or any(t.current for t in self.treatment_agents))
        # after closing, finish patients already inside (overtime capped at 3h)
        return self.minute >= self.total_minutes and (not pending or self.minute >= self.total_minutes + 180)

    def run(self, max_steps: int | None = None):
        n = 0
        while not self.done():
            self.step()
            n += 1
            if max_steps and n >= max_steps:
                break
        return self

    # ------------------------------------------------------------ metrics
    def metrics(self) -> dict:
        p = self.p
        served = self.served
        open_minutes = max(1, min(self.minute, self.total_minutes + 180))
        derm_util = float(np.mean([d.busy_minutes for d in self.derms]) / open_minutes)
        correct = [pt.final_diagnosis == pt.true_disease or
                   DISEASES.get(pt.final_diagnosis, {}).get("parent") == pt.true_disease for pt in served]
        improved = [pt.outcome["improved"] for pt in served if pt.outcome]
        df = self.datacollector.get_model_vars_dataframe()
        arrived = self.env.arrivals
        return {
            "workflow": p.workflow,
            "params": asdict(p),
            "arrived": arrived,
            "patients_served": len(served),
            "left_without_being_seen": self.left_without_seen,
            "avg_waiting_time_min": float(np.mean(self.wait_times)) if self.wait_times else 0.0,
            "p90_waiting_time_min": float(np.percentile(self.wait_times, 90)) if self.wait_times else 0.0,
            "avg_diagnosis_time_min": float(np.mean(self.diag_times)) if self.diag_times else 0.0,
            "doctor_workload_consults_per_doctor": float(np.mean([d.consults for d in self.derms])),
            "doctor_workload_consults_per_doctor_day": float(np.mean([d.consults for d in self.derms]) / p.days),
            "dermatologist_utilization": derm_util,
            "ai_station_utilization": float(np.mean([a.busy_minutes for a in self.ai_agents]) / open_minutes) if self.ai_agents else None,
            "avg_queue_length_derm": float(df.queue_derm.mean()) if len(df) else 0.0,
            "max_queue_length_derm": int(df.queue_derm.max()) if len(df) else 0,
            "ai_human_disagreement_rate": (self.disagreements / self.ai_reviews) if self.ai_reviews else None,
            "diagnostic_accuracy_final": float(np.mean(correct)) if correct else None,
            "simulated_treatment_success_rate": float(np.mean(improved)) if improved else None,
            "system_efficiency_served_ratio": len(served) / arrived if arrived else 0.0,
            "throughput_per_doctor_hour": len(served) / (p.n_dermatologists * p.days * p.operating_minutes / 60),
            "kg_agreement_rate": (self.kg_agreements / self.kg_checks) if self.kg_checks else None,
            "reassessment_rate": (self.reassessments + self.followup_reassessments) / len(served) if served else 0.0,
            "in_clinic_reassessment_rate": self.reassessments / len(served) if served else 0.0,
            "follow_up_reassessment_rate": self.followup_reassessments / len(served) if served else 0.0,
            "confidence_source": self.conf_source,
            "simulated_minutes": self.minute,
        }

    def timeseries(self) -> list[dict]:
        df = self.datacollector.get_model_vars_dataframe()
        return df.to_dict(orient="records")

    def agent_summary(self) -> list[dict]:
        rows = []
        for d in self.derms:
            rows.append({"agent": "DermatologistAgent", "id": d.unique_id, "consults": d.consults,
                         "busy_minutes": d.busy_minutes, "accepted_ai": d.accepted, "rejected_ai": d.rejected})
        for a in self.ai_agents:
            rows.append({"agent": "AIDiagnosticAgent", "id": a.unique_id, "processed": a.processed,
                         "uncertain": a.uncertain, "busy_minutes": a.busy_minutes})
        for t in self.treatment_agents:
            rows.append({"agent": "TreatmentAgent", "id": t.unique_id, "planned": t.planned, "busy_minutes": t.busy_minutes})
        rows.append({"agent": "ClinicEnvironmentAgent", "id": self.env.unique_id, "arrivals": self.env.arrivals,
                     "congestion_now": self.env.congestion})
        rows.append({"agent": "PatientAgent", "count": len(self.agents_by_type.get(PatientAgent, []))})
        return rows
