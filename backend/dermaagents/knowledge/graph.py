"""NetworkX knowledge graph instantiated from the ontology facts, plus per-patient
case nodes. Used by the Dermatologist agent to verify AI predictions, find
differentials and pick simulated care pathways. (Neo4j is an optional upgrade:
see docs/DEPLOYMENT.md - the same node/edge lists can be loaded with Cypher.)
"""
from __future__ import annotations

import threading

import networkx as nx

from .facts import DISEASES, ESCALATION, FOLLOW_UP_WEEKS, PATHWAYS, SEVERITY, SYMPTOMS
from .sources import SOURCES

# classifier dataset label -> KG disease node
CLASSIFIER_TO_KG = {d["classifier_label"]: name for name, d in DISEASES.items() if d.get("classifier_label")}


class KnowledgeGraph:
    def __init__(self):
        self.g = nx.MultiDiGraph()
        self._lock = threading.Lock()
        self._build()

    # ------------------------------------------------------------ build
    def _build(self):
        g = self.g
        for sid, (label, desc) in SYMPTOMS.items():
            g.add_node(f"S:{sid}", type="Symptom", label=label, description=desc)
        for name, d in DISEASES.items():
            dn = f"D:{name}"
            g.add_node(dn, type="Disease", label=name, summary=d["summary"],
                       classifier_supported=bool(d.get("classifier_label")))
            for sid, w, src in d["symptoms"]:
                g.add_edge(f"S:{sid}", dn, key="indicatesDisease", relation="indicatesDisease",
                           weight=w, source=src)
            for lvl in ("mild", "moderate", "severe"):
                sv = f"SEV:{name}:{lvl}"
                g.add_node(sv, type="Severity", label=f"{lvl}", description=SEVERITY[name][lvl])
                g.add_edge(dn, sv, key="hasSeverity", relation="hasSeverity", source=SEVERITY[name]["source"])
            for i, st in enumerate(PATHWAYS[name]):
                tn = f"T:{name}:{i}"
                g.add_node(tn, type="Treatment", label=st["stage"], category=st["category"], weeks=st["weeks"],
                           p_response=st["p_response"], order=i, simulated=True)
                g.add_edge(dn, tn, key="treatedBy", relation="treatedBy", source=st["source"])
            for i, (text, src) in enumerate(ESCALATION[name]):
                rn = f"R:{name}:{i}"
                g.add_node(rn, type="ReassessmentTrigger", label=text)
                g.add_edge(dn, rn, key="requiresReassessment", relation="requiresReassessment", source=src)
            fu = f"F:{name}"
            g.add_node(fu, type="FollowUp", label=f"Review after {FOLLOW_UP_WEEKS[name]} weeks",
                       weeks=FOLLOW_UP_WEEKS[name])
            g.add_edge(dn, fu, key="hasFollowUp", relation="hasFollowUp")
            if d.get("parent"):
                g.add_edge(dn, f"D:{d['parent']}", key="subtypeOf", relation="subtypeOf")
        for name, d in DISEASES.items():
            for other in d["differentials"]:
                if f"D:{other}" not in g:
                    g.add_node(f"D:{other}", type="Disease", label=other, summary="(outside DermaAgents scope)",
                               classifier_supported=False)
                g.add_edge(f"D:{name}", f"D:{other}", key="differentialOf", relation="differentialOf")

    # ------------------------------------------------------------ queries
    def diseases(self) -> list[str]:
        return [d["label"] for n, d in self.g.nodes(data=True) if d["type"] == "Disease"]

    def symptoms_of(self, disease: str) -> dict[str, float]:
        dn = f"D:{disease}"
        return {u[2:]: data["weight"] for u, _, data in self.g.in_edges(dn, data=True)
                if data.get("relation") == "indicatesDisease"}

    def differentials(self, disease: str) -> list[str]:
        dn = f"D:{disease}"
        return sorted({self.g.nodes[v]["label"] for _, v, k in self.g.out_edges(dn, keys=True) if k == "differentialOf"})

    def pathway(self, disease: str) -> list[dict]:
        dn = f"D:{disease}"
        stages = [dict(self.g.nodes[v], id=v) for _, v, k in self.g.out_edges(dn, keys=True) if k == "treatedBy"]
        return sorted(stages, key=lambda s: s["order"])

    def reassessment_triggers(self, disease: str) -> list[str]:
        return [self.g.nodes[v]["label"] for _, v, k in self.g.out_edges(f"D:{disease}", keys=True)
                if k == "requiresReassessment"]

    def follow_up_weeks(self, disease: str) -> int:
        return FOLLOW_UP_WEEKS.get(disease, 12)

    def score_diseases(self, symptoms: list[str]) -> dict[str, float]:
        """Symptom-evidence score per disease: weighted overlap normalised by the
        disease's total symptom weight (0..1)."""
        out = {}
        s = set(symptoms)
        for name in DISEASES:
            prof = self.symptoms_of(name)
            tot = sum(prof.values()) or 1.0
            out[name] = round(sum(w for k, w in prof.items() if k in s) / tot, 4)
        return out

    def verify(self, predicted_disease: str | None, symptoms: list[str]) -> dict:
        """Knowledge-graph check of an AI prediction against reported symptoms."""
        scores = self.score_diseases(symptoms)
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        best, best_score = ranked[0]
        if predicted_disease is None or predicted_disease not in scores:
            return {"status": "no_prediction", "kg_best": best, "scores": scores, "agreement": None,
                    "conflict": False, "differentials": []}
        pred_score = scores[predicted_disease]
        diffs = self.differentials(predicted_disease)
        related = {predicted_disease, *diffs}
        parent = DISEASES.get(predicted_disease, {}).get("parent")
        children = [n for n, d in DISEASES.items() if d.get("parent") == predicted_disease]
        related |= set(children) | ({parent} if parent else set())
        if not symptoms:
            status, conflict = "insufficient_symptoms", False
        elif pred_score >= 0.25 or (best in related and best_score - pred_score < 0.25):
            status, conflict = "supported", False
        elif best_score >= 0.25 and best not in related:
            status, conflict = "conflict", True
        else:
            status, conflict = "weak_evidence", False
        return {"status": status, "conflict": conflict, "agreement": status == "supported",
                "predicted_score": pred_score, "kg_best": best, "kg_best_score": best_score,
                "differentials": diffs, "scores": scores,
                "supporting_symptoms": [SYMPTOMS[s][0] for s in symptoms if s in self.symptoms_of(predicted_disease)]}

    # ------------------------------------------------------------ patient cases
    def add_case(self, case_id: str, symptoms: list[str], disease: str | None, max_cases: int = 300):
        with self._lock:
            cn = f"P:{case_id}"
            self.g.add_node(cn, type="Patient", label=f"Case {case_id[:8]}")
            for s in symptoms:
                if f"S:{s}" in self.g:
                    self.g.add_edge(cn, f"S:{s}", key="hasSymptom", relation="hasSymptom")
            if disease and f"D:{disease}" in self.g:
                self.g.add_edge(cn, f"D:{disease}", key="diagnosedWith", relation="diagnosedWith")
            cases = [n for n, d in self.g.nodes(data=True) if d["type"] == "Patient"]
            for old in cases[:-max_cases]:
                self.g.remove_node(old)

    # ------------------------------------------------------------ export
    def to_json(self, include_patients: bool = True) -> dict:
        nodes = [{"id": n, **{k: v for k, v in d.items()}} for n, d in self.g.nodes(data=True)
                 if include_patients or d["type"] != "Patient"]
        ids = {n["id"] for n in nodes}
        edges = [{"source": u, "target": v, "relation": d.get("relation", k), "weight": d.get("weight"),
                  "source_ref": d.get("source"),
                  "source_url": SOURCES.get(d.get("source"), {}).get("url")}
                 for u, v, k, d in self.g.edges(keys=True, data=True) if u in ids and v in ids]
        counts = {}
        for n in nodes:
            counts[n["type"]] = counts.get(n["type"], 0) + 1
        return {"nodes": nodes, "edges": edges, "counts": counts, "n_nodes": len(nodes), "n_edges": len(edges)}


_KG: KnowledgeGraph | None = None


def get_kg() -> KnowledgeGraph:
    global _KG
    if _KG is None:
        _KG = KnowledgeGraph()
    return _KG
