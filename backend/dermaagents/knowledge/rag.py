"""Retrieval-Augmented Generation over the DermaAgents knowledge base.

Pipeline (LangChain LCEL):
    query -> retriever (InMemoryVectorStore + LSA embeddings)
          -> + knowledge-graph facts for the diseases involved
          -> generator (LLM if ANTHROPIC_API_KEY is set, otherwise a clearly
             labelled rule-based extractive composer)
          -> grounded answer with numbered citations.

Embeddings: sentence-transformer models could not be downloaded in the build
sandbox, so `LSAEmbeddings` (TF-IDF + truncated SVD, fitted on the knowledge
base) implements LangChain's `Embeddings` interface. Swap in any LangChain
embedding class (e.g. HuggingFaceEmbeddings) without changing the pipeline.
ChromaDB/FAISS were likewise not installable; LangChain's InMemoryVectorStore is
used and the store is persisted to JSON so it survives restarts.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import numpy as np
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .facts import DISEASES, PASSAGES, SYMPTOMS
from .graph import get_kg
from .sources import SOURCES


class LSAEmbeddings(Embeddings):
    """TF-IDF (word 1-2 grams + char 3-5 grams) -> SVD latent semantic embeddings."""

    def __init__(self, corpus: list[str], dim: int = 96, seed: int = 0):
        from scipy.sparse import hstack
        self._hstack = hstack
        self.word = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english").fit(corpus)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True).fit(corpus)
        X = self._tfidf(corpus)
        self.svd = TruncatedSVD(n_components=min(dim, X.shape[1] - 1, len(corpus) - 1), random_state=seed).fit(X)

    def _tfidf(self, texts):
        return self._hstack([self.word.transform(texts), self.char.transform(texts)]).tocsr()

    def _embed(self, texts: list[str]) -> list[list[float]]:
        return normalize(self.svd.transform(self._tfidf(texts))).tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]


def build_documents() -> list[Document]:
    docs = []
    splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=40)
    for i, (disease, section, text, src) in enumerate(PASSAGES):
        for j, chunk in enumerate(splitter.split_text(text)):
            s = SOURCES[src]
            docs.append(Document(page_content=chunk, metadata={
                "id": f"kb{i}_{j}", "disease": disease, "section": section, "source_key": src,
                "source_title": s["title"], "source_url": s["url"], "publisher": s["publisher"]}))
    # disease profile documents derived from structured facts
    for name, d in DISEASES.items():
        syms = ", ".join(SYMPTOMS[s][0].lower() for s, _, _ in d["symptoms"])
        src = d["symptoms"][0][2]
        docs.append(Document(page_content=f"{name}: {d['summary']} Characteristic features: {syms}.",
                             metadata={"id": f"profile_{name}", "disease": name, "section": "profile",
                                       "source_key": src, "source_title": SOURCES[src]["title"],
                                       "source_url": SOURCES[src]["url"], "publisher": SOURCES[src]["publisher"]}))
    return docs


class RAGPipeline:
    def __init__(self, persist_path: Path | None = None):
        self.docs = build_documents()
        self.embeddings = LSAEmbeddings([d.page_content for d in self.docs])
        self.store = InMemoryVectorStore(self.embeddings)
        self.store.add_documents(self.docs, ids=[d.metadata["id"] for d in self.docs])
        if persist_path:
            persist_path.parent.mkdir(parents=True, exist_ok=True)
            self.store.dump(str(persist_path))
        self.kg = get_kg()
        self.llm_available = bool(os.environ.get("ANTHROPIC_API_KEY"))
        self.chain = (
            {"question": RunnablePassthrough(), "docs": RunnableLambda(self._retrieve)}
            | RunnableLambda(self._add_kg_context)
            | RunnableLambda(self._generate)
        )

    # ------------------------------------------------------------ steps
    def _retrieve(self, q: dict | str):
        query = q["question"] if isinstance(q, dict) else q
        k = q.get("k", 4) if isinstance(q, dict) else 4
        disease = q.get("disease") if isinstance(q, dict) else None
        res = self.store.similarity_search_with_score(query, k=k + 6)
        if disease:  # boost passages about the disease under review
            res = sorted(res, key=lambda r: -(r[1] + (0.15 if r[0].metadata["disease"] == disease else 0)))
        return res[:k]

    def _add_kg_context(self, x: dict):
        q = x["question"]
        qtext = q["question"] if isinstance(q, dict) else q
        diseases = {d.metadata["disease"] for d, _ in x["docs"]} & set(DISEASES)
        if isinstance(q, dict) and q.get("disease") in DISEASES:
            diseases.add(q["disease"])
        for name in DISEASES:
            if name.lower() in qtext.lower():
                diseases.add(name)
        facts = []
        for name in sorted(diseases):
            syms = sorted(self.kg.symptoms_of(name).items(), key=lambda kv: -kv[1])[:4]
            facts.append({"disease": name,
                          "key_symptoms": [SYMPTOMS[s][0] for s, _ in syms],
                          "differentials": self.kg.differentials(name),
                          "reassessment_triggers": self.kg.reassessment_triggers(name),
                          "simulated_pathway": [s["label"] for s in self.kg.pathway(name)]})
        return {**x, "question": qtext, "kg_facts": facts}

    def _generate(self, x: dict):
        refs = []
        for i, (doc, score) in enumerate(x["docs"], 1):
            refs.append({"n": i, "text": doc.page_content, "score": round(float(score), 4), **doc.metadata})
        answer, generator = None, "rule-based extractive composer (no LLM API key configured)"
        if self.llm_available:
            try:
                answer = self._llm_answer(x["question"], refs, x["kg_facts"])
                generator = f"LLM ({os.environ.get('DERMA_LLM_MODEL', 'claude-haiku-5-5')}) grounded on retrieved context"
            except Exception as e:  # network / auth problems -> fallback, reported
                generator = f"rule-based extractive composer (LLM call failed: {type(e).__name__})"
        if answer is None:
            answer = self._extractive_answer(x["question"], refs, x["kg_facts"])
        return {"question": x["question"], "answer": answer, "references": refs, "kg_facts": x["kg_facts"],
                "generator": generator, "disclaimer": "Academic simulation. Not medical advice; "
                "knowledge content is from public sources and is not clinically validated."}

    @staticmethod
    def _extractive_answer(question: str, refs: list[dict], kg_facts: list[dict]) -> str:
        qwords = set(re.findall(r"[a-z]{4,}", question.lower()))
        lines = []
        for r in refs:
            overlap = len(qwords & set(re.findall(r"[a-z]{4,}", r["text"].lower())))
            if overlap or r["n"] <= 2:
                lines.append(f"{r['text']} [{r['n']}]")
        out = " ".join(lines[:3]) if lines else "No sufficiently relevant passage was retrieved."
        if kg_facts:
            f = kg_facts[0]
            out += (f"\n\nKnowledge-graph facts for {f['disease']}: key features - {', '.join(f['key_symptoms'])}"
                    + (f"; differentials - {', '.join(f['differentials'])}" if f["differentials"] else "") + ".")
        return out

    @staticmethod
    def _llm_answer(question: str, refs: list[dict], kg_facts: list[dict]) -> str:
        import httpx
        ctx = "\n".join(f"[{r['n']}] {r['text']} (source: {r['source_title']})" for r in refs)
        prompt = (f"Answer the question for an academic dermatology simulation using ONLY the context. "
                  f"Cite passages as [n]. If the context is insufficient, say so. Do not give prescriptions or doses.\n\n"
                  f"Context:\n{ctx}\n\nKnowledge-graph facts: {json.dumps(kg_facts)}\n\nQuestion: {question}")
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=30,
                       headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
                                "content-type": "application/json"},
                       json={"model": os.environ.get("DERMA_LLM_MODEL", "claude-haiku-5-5"), "max_tokens": 400,
                             "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json()["content"])

    # ------------------------------------------------------------ public
    def query(self, question: str, k: int = 4, disease: str | None = None) -> dict:
        return self.chain.invoke({"question": question, "k": k, "disease": disease})

    def retrieval_matrix(self) -> np.ndarray:
        return np.array(self.embeddings.embed_documents([d.page_content for d in self.docs]))


_RAG: RAGPipeline | None = None


def get_rag() -> RAGPipeline:
    global _RAG
    if _RAG is None:
        from ..config import ARTIFACTS
        _RAG = RAGPipeline(persist_path=ARTIFACTS / "vectorstore" / "kb_store.json")
    return _RAG
