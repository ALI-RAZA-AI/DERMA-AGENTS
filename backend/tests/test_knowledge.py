"""Knowledge graph, ontology and RAG retrieval tests."""
from dermaagents.knowledge.facts import DISEASES, PASSAGES
from dermaagents.knowledge.graph import KnowledgeGraph
from dermaagents.knowledge.ontology import build_ontology, symptoms_indicating
from dermaagents.knowledge.rag import RAGPipeline
from dermaagents.knowledge.sources import SOURCES


def test_every_fact_is_sourced():
    for name, d in DISEASES.items():
        for _, _, src in d["symptoms"]:
            assert src in SOURCES
    for _, _, _, src in PASSAGES:
        assert src in SOURCES and SOURCES[src]["url"].startswith("https://")


def test_ontology_classes_and_relations():
    g = build_ontology()
    labels = {str(o) for o in g.objects()}
    for c in ["Patient", "Symptom", "Disease", "Severity", "Treatment", "FollowUp"]:
        assert c in labels
    assert "Silvery-white scales" in symptoms_indicating(g, "Psoriasis")


def test_kg_structure_and_relations():
    kg = KnowledgeGraph()
    rels = {d["relation"] for _, _, d in kg.g.edges(data=True)}
    assert {"indicatesDisease", "treatedBy", "differentialOf", "requiresReassessment"} <= rels
    assert "Psoriasis" in kg.differentials("Eczema")
    assert len(kg.pathway("Acne")) >= 3


def test_kg_verification_supports_and_conflicts():
    kg = KnowledgeGraph()
    assert kg.verify("Acne", ["comedones", "oily_skin", "face_chest_back"])["status"] == "supported"
    v = kg.verify("Acne", ["silvery_scales", "plaques_extensor", "nail_changes"])
    assert v["conflict"] and v["kg_best"] == "Psoriasis"
    assert kg.verify("Acne", [])["status"] == "insufficient_symptoms"


def test_kg_patient_case_nodes():
    kg = KnowledgeGraph()
    kg.add_case("abc123", ["itch", "dry_skin"], "Eczema")
    assert "P:abc123" in kg.g and kg.g.has_edge("P:abc123", "D:Eczema")


def test_rag_retrieves_relevant_disease():
    rag = RAGPipeline()
    for q, disease in [("silvery scales on elbows and knees", "Psoriasis"), ("new or changing mole ABCDE", "Melanoma"),
                       ("stuck-on warty lesion in older adults", "Seborrheic Keratosis"), ("blackheads and oily skin", "Acne")]:
        r = rag.query(q, k=3)
        assert disease in {x["disease"] for x in r["references"]}, (q, [x["disease"] for x in r["references"]])
        assert all(x["source_url"].startswith("https://") for x in r["references"])
        assert r["answer"]
