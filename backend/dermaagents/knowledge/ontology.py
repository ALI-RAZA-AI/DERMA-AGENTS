"""DermaAgents OWL ontology built with rdflib.

Classes: Patient, Symptom, Disease, Severity, Treatment, FollowUp
Object properties: hasSymptom, indicatesDisease, treatedBy, differentialOf,
                   requiresReassessment (+ hasSeverity, hasFollowUp, citedBy)
"""
from __future__ import annotations

from rdflib import OWL, RDF, RDFS, XSD, Graph, Literal, Namespace, URIRef

from .facts import DISEASES, ESCALATION, FOLLOW_UP_WEEKS, PATHWAYS, SEVERITY, SYMPTOMS
from .sources import SOURCES

DA = Namespace("https://dermaagents.example.org/ontology#")


def _slug(s: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in s).strip("_")


def build_ontology() -> Graph:
    g = Graph()
    g.bind("da", DA)
    g.bind("owl", OWL)
    onto = URIRef(str(DA).rstrip("#"))
    g.add((onto, RDF.type, OWL.Ontology))
    g.add((onto, RDFS.comment, Literal("DermaAgents academic ontology - not clinically validated.")))

    for c in ["Patient", "Symptom", "Disease", "Severity", "Treatment", "FollowUp", "Source", "ReassessmentTrigger"]:
        g.add((DA[c], RDF.type, OWL.Class))
        g.add((DA[c], RDFS.label, Literal(c)))

    props = {
        "hasSymptom": ("Patient", "Symptom"),
        "indicatesDisease": ("Symptom", "Disease"),
        "treatedBy": ("Disease", "Treatment"),
        "differentialOf": ("Disease", "Disease"),
        "requiresReassessment": ("Disease", "ReassessmentTrigger"),
        "hasSeverity": ("Disease", "Severity"),
        "hasFollowUp": ("Disease", "FollowUp"),
        "citedBy": ("Disease", "Source"),
        "diagnosedWith": ("Patient", "Disease"),
    }
    for p, (dom, rng) in props.items():
        g.add((DA[p], RDF.type, OWL.ObjectProperty))
        g.add((DA[p], RDFS.domain, DA[dom]))
        g.add((DA[p], RDFS.range, DA[rng]))
    g.add((DA.differentialOf, RDF.type, OWL.SymmetricProperty))
    for dp in ["weight", "weeks", "responseProbability", "url"]:
        g.add((DA[dp], RDF.type, OWL.DatatypeProperty))

    for sid, (label, desc) in SYMPTOMS.items():
        s = DA["symptom_" + sid]
        g.add((s, RDF.type, DA.Symptom))
        g.add((s, RDFS.label, Literal(label)))
        g.add((s, RDFS.comment, Literal(desc)))

    for key, src in SOURCES.items():
        n = DA["source_" + key]
        g.add((n, RDF.type, DA.Source))
        g.add((n, RDFS.label, Literal(src["title"])))
        g.add((n, DA.url, Literal(src["url"], datatype=XSD.anyURI)))

    for dname, d in DISEASES.items():
        dn = DA["disease_" + _slug(dname)]
        g.add((dn, RDF.type, DA.Disease))
        g.add((dn, RDFS.label, Literal(dname)))
        g.add((dn, RDFS.comment, Literal(d["summary"])))
        for sid, w, src in d["symptoms"]:
            g.add((DA["symptom_" + sid], DA.indicatesDisease, dn))
            g.add((dn, DA.citedBy, DA["source_" + src]))
        for other in d["differentials"]:
            g.add((dn, DA.differentialOf, DA["disease_" + _slug(other)]))
        for lvl, text in SEVERITY.get(dname, {}).items():
            if lvl == "source":
                continue
            sv = DA[f"severity_{_slug(dname)}_{lvl}"]
            g.add((sv, RDF.type, DA.Severity))
            g.add((sv, RDFS.label, Literal(f"{dname}: {lvl}")))
            g.add((sv, RDFS.comment, Literal(text)))
            g.add((dn, DA.hasSeverity, sv))
        for i, st in enumerate(PATHWAYS.get(dname, [])):
            tn = DA[f"treatment_{_slug(dname)}_{i}"]
            g.add((tn, RDF.type, DA.Treatment))
            g.add((tn, RDFS.label, Literal(st["stage"])))
            g.add((tn, DA.weeks, Literal(st["weeks"])))
            g.add((tn, DA.responseProbability, Literal(st["p_response"])))
            g.add((dn, DA.treatedBy, tn))
        for i, (text, src) in enumerate(ESCALATION.get(dname, [])):
            rn = DA[f"reassess_{_slug(dname)}_{i}"]
            g.add((rn, RDF.type, DA.ReassessmentTrigger))
            g.add((rn, RDFS.label, Literal(text)))
            g.add((dn, DA.requiresReassessment, rn))
        fu = DA[f"followup_{_slug(dname)}"]
        g.add((fu, RDF.type, DA.FollowUp))
        g.add((fu, RDFS.label, Literal(f"Simulated review after {FOLLOW_UP_WEEKS[dname]} weeks")))
        g.add((fu, DA.weeks, Literal(FOLLOW_UP_WEEKS[dname])))
        g.add((dn, DA.hasFollowUp, fu))
    return g


def symptoms_indicating(g: Graph, disease: str) -> list[str]:
    q = """SELECT ?label WHERE { ?s da:indicatesDisease ?d . ?d rdfs:label ?dl . ?s rdfs:label ?label .
           FILTER(str(?dl) = ?name) }"""
    return sorted(str(r.label) for r in g.query(q, initBindings={"name": Literal(disease)}))


if __name__ == "__main__":
    import sys
    gr = build_ontology()
    out = sys.argv[1] if len(sys.argv) > 1 else "dermaagents_ontology.ttl"
    gr.serialize(out, format="turtle")
    print(len(gr), "triples ->", out)
