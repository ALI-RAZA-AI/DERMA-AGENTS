"""The six DermaAgents experiment scenarios, run with replications."""
from __future__ import annotations

from dataclasses import replace

import numpy as np
import pandas as pd

from .model import ClinicModel, SimParams

BASE = SimParams(arrival_rate_per_hour=10.0, n_dermatologists=3, ai_accuracy=0.85, diagnostic_capacity=2,
                 treatment_capacity=2, operating_minutes=480, days=5)

SCENARIOS = {
    "S1_traditional": {"title": "1. Traditional clinic (no AI)", "purpose": "Baseline",
                       "overrides": {"workflow": "traditional"}},
    "S2_ai_assisted": {"title": "2. AI-assisted clinic", "purpose": "Benefit of AI assistance",
                       "overrides": {"workflow": "ai_assisted"}},
    "S3_high_load": {"title": "3. High patient load", "purpose": "Congestion and waiting times",
                     "overrides": {"workflow": "ai_assisted", "arrival_rate_per_hour": 16.0},
                     "compare_traditional": True},
    "S4_limited_derms": {"title": "4. Limited dermatologists", "purpose": "Resource utilization",
                         "overrides": {"workflow": "ai_assisted", "n_dermatologists": 2}, "compare_traditional": True},
    "S5_ai_accuracy": {"title": "5. Different AI accuracy levels", "purpose": "Efficiency and human-AI disagreement",
                       "sweep": {"ai_accuracy": [0.5, 0.65, 0.8, 0.9, 0.97]}, "overrides": {"workflow": "ai_assisted"}},
    "S6_knowledge_augmented": {"title": "6. Knowledge-augmented clinic",
                               "purpose": "Disagreement and reassessment rate",
                               "overrides": {"workflow": "knowledge_augmented"}},
}

KEY_METRICS = ["avg_waiting_time_min", "avg_diagnosis_time_min", "patients_served", "left_without_being_seen",
               "doctor_workload_consults_per_doctor_day", "dermatologist_utilization", "avg_queue_length_derm",
               "ai_human_disagreement_rate", "diagnostic_accuracy_final", "simulated_treatment_success_rate",
               "system_efficiency_served_ratio", "throughput_per_doctor_hour", "kg_agreement_rate", "reassessment_rate"]


def run_once(params: SimParams) -> dict:
    return ClinicModel(params).run().metrics()


def run_scenario(key: str, base: SimParams = BASE, replications: int = 3, seed0: int = 100) -> list[dict]:
    spec = SCENARIOS[key]
    variants = []
    if "sweep" in spec:
        (pname, values), = spec["sweep"].items()
        for v in values:
            variants.append((f"{pname}={v}", {**spec["overrides"], pname: v}))
    else:
        variants.append(("main", spec["overrides"]))
        if spec.get("compare_traditional"):
            variants.append(("traditional_under_same_conditions", {**spec["overrides"], "workflow": "traditional"}))
    rows = []
    for label, ov in variants:
        for r in range(replications):
            m = run_once(replace(base, **ov, seed=seed0 + r))
            rows.append({"scenario": key, "title": spec["title"], "variant": label, "replication": r,
                         **{k: m[k] for k in KEY_METRICS}, "workflow": m["workflow"],
                         "arrival_rate_per_hour": m["params"]["arrival_rate_per_hour"],
                         "n_dermatologists": m["params"]["n_dermatologists"], "ai_accuracy": m["params"]["ai_accuracy"]})
    return rows


def run_all(replications: int = 3, base: SimParams = BASE, keys=None) -> pd.DataFrame:
    rows = []
    for k in (keys or SCENARIOS):
        rows += run_scenario(k, base, replications)
    return pd.DataFrame(rows)


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby(["scenario", "title", "variant", "workflow"], sort=False)
    mean = g[KEY_METRICS].mean().add_suffix("_mean")
    std = g[KEY_METRICS].std().fillna(0).add_suffix("_sd")
    out = pd.concat([mean, std], axis=1).reset_index()
    out["replications"] = g.size().values
    return out


def to_records(df: pd.DataFrame) -> list[dict]:
    return [{k: (None if (isinstance(v, float) and np.isnan(v)) else v) for k, v in r.items()}
            for r in df.to_dict(orient="records")]
