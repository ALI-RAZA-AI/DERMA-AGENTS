"""LangChain tools used by the live agents (real model / KG / RAG operations)."""
from __future__ import annotations

from langchain_core.tools import tool

from ..knowledge.graph import get_kg
from ..knowledge.rag import get_rag
from ..ml.inference import predict_skin_disease


@tool
def classify_skin_image(image_path: str) -> dict:
    """Run the trained DermaAgents skin classifier (with uncertainty/OOD checks) on an image file."""
    return predict_skin_disease(image_path)


@tool
def kg_verify_prediction(disease: str, symptoms: list[str]) -> dict:
    """Check an AI-predicted disease against reported symptom ids using the knowledge graph."""
    return get_kg().verify(disease or None, symptoms)


@tool
def kg_disease_profile(disease: str) -> dict:
    """Return key symptoms, differentials, simulated pathway and reassessment triggers for a disease."""
    kg = get_kg()
    return {"disease": disease, "symptoms": kg.symptoms_of(disease), "differentials": kg.differentials(disease),
            "pathway": [s["label"] for s in kg.pathway(disease)],
            "reassessment_triggers": kg.reassessment_triggers(disease),
            "follow_up_weeks": kg.follow_up_weeks(disease)}


@tool
def retrieve_dermatology_knowledge(question: str, disease: str = "") -> dict:
    """Retrieve grounded knowledge-base passages (RAG) with citations."""
    return get_rag().query(question, k=4, disease=disease or None)


ALL_TOOLS = [classify_skin_image, kg_verify_prediction, kg_disease_profile, retrieve_dermatology_knowledge]
