"""Mesa simulation tests: agents, metrics, parameter sensitivity and all six scenarios."""
from dataclasses import replace

import pytest

from dermaagents.simulation.model import ClinicModel, PatientAgent, SimParams
from dermaagents.simulation.scenarios import BASE, SCENARIOS, run_all, run_once, summarise

SHORT = replace(BASE, days=2)


def test_model_runs_and_conserves_patients():
    m = ClinicModel(SHORT).run()
    x = m.metrics()
    assert x["arrived"] > 0
    assert x["patients_served"] + x["left_without_being_seen"] <= x["arrived"]
    assert 0 <= x["dermatologist_utilization"] <= 1
    assert len(m.agents_by_type[PatientAgent]) == x["arrived"]


def test_five_agent_types_present():
    m = ClinicModel(SHORT)
    names = {type(a).__name__ for a in m.agents}
    assert {"ClinicEnvironmentAgent", "AIDiagnosticAgent", "DermatologistAgent", "TreatmentAgent"} <= names
    m.run(max_steps=200)
    assert "PatientAgent" in {type(a).__name__ for a in m.agents}


def test_traditional_has_no_ai_metrics():
    x = run_once(replace(SHORT, workflow="traditional"))
    assert x["ai_human_disagreement_rate"] is None and x["ai_station_utilization"] is None


def test_more_load_increases_waiting():
    lo = run_once(replace(SHORT, arrival_rate_per_hour=6))
    hi = run_once(replace(SHORT, arrival_rate_per_hour=18))
    assert hi["avg_waiting_time_min"] > lo["avg_waiting_time_min"]
    assert hi["dermatologist_utilization"] > lo["dermatologist_utilization"]


def test_fewer_doctors_increase_utilization():
    a = run_once(replace(SHORT, n_dermatologists=4))
    b = run_once(replace(SHORT, n_dermatologists=2))
    assert b["dermatologist_utilization"] > a["dermatologist_utilization"]


def test_ai_accuracy_changes_disagreement():
    lo = run_once(replace(SHORT, ai_accuracy=0.5))
    hi = run_once(replace(SHORT, ai_accuracy=0.97))
    assert lo["ai_human_disagreement_rate"] > hi["ai_human_disagreement_rate"]


def test_knowledge_augmented_uses_kg():
    x = run_once(replace(SHORT, workflow="knowledge_augmented"))
    assert x["kg_agreement_rate"] is not None


def test_invalid_params_rejected():
    with pytest.raises(AssertionError):
        SimParams(workflow="magic").validate()


def test_all_six_scenarios_run():
    df = run_all(replications=1, base=SHORT)
    assert set(df.scenario) == set(SCENARIOS)
    s = summarise(df)
    assert len(s) >= 6 and s["patients_served_mean"].gt(0).all()
