"""SQLite persistence for synthetic/demo cases, simulation runs and reports.

Only synthetic patient data is stored. For production PostgreSQL, set
DERMA_DB_URL=postgresql://... and install psycopg (see docs/DEPLOYMENT.md); the
same SQL is used (parameter style adapted automatically).
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager

from .config import DB_URL

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY, created REAL, name TEXT, age INTEGER, gender TEXT, severity TEXT,
  symptoms TEXT, history TEXT, synthetic INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, created REAL, patient_id TEXT, image_name TEXT, ai_status TEXT, ai_prediction TEXT,
  ai_confidence REAL, decision TEXT, final_diagnosis TEXT, kg_status TEXT, improved INTEGER,
  reassessments INTEGER, route TEXT, payload TEXT);
CREATE TABLE IF NOT EXISTS sim_runs (
  id TEXT PRIMARY KEY, created REAL, kind TEXT, params TEXT, metrics TEXT);
"""


class DB:
    def __init__(self, url: str = DB_URL):
        if url.startswith("postgres"):
            import psycopg  # type: ignore  # optional production dependency
            self.conn = psycopg.connect(url, autocommit=True)
            self.ph = "%s"
            self.kind = "postgres"
        else:
            path = url.replace("sqlite:///", "")
            from pathlib import Path
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            self.conn = sqlite3.connect(path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self.ph = "?"
            self.kind = "sqlite"
        with self.cursor() as c:
            for stmt in SCHEMA.strip().split(";"):
                if stmt.strip():
                    c.execute(stmt)

    @contextmanager
    def cursor(self):
        with _lock:
            cur = self.conn.cursor()
            try:
                yield cur
                if self.kind == "sqlite":
                    self.conn.commit()
            finally:
                cur.close()

    def _q(self, sql: str) -> str:
        return sql.replace("?", self.ph)

    def execute(self, sql: str, args=()):
        with self.cursor() as c:
            c.execute(self._q(sql), args)

    def query(self, sql: str, args=()) -> list[dict]:
        with self.cursor() as c:
            c.execute(self._q(sql), args)
            cols = [d[0] for d in c.description]
            return [dict(zip(cols, r)) for r in c.fetchall()]

    # ---------------------------------------------------------------- helpers
    def add_patient(self, pid: str, p: dict):
        self.execute("INSERT INTO patients VALUES (?,?,?,?,?,?,?,?,1)",
                     (pid, time.time(), p.get("name"), p.get("age"), p.get("gender"), p.get("severity"),
                      json.dumps(p.get("symptoms", [])), p.get("history", "")))

    def get_patient(self, pid: str) -> dict | None:
        r = self.query("SELECT * FROM patients WHERE id=?", (pid,))
        if not r:
            return None
        r[0]["symptoms"] = json.loads(r[0]["symptoms"] or "[]")
        return r[0]

    def add_case(self, case: dict, image_name: str | None):
        ai = case.get("ai", {})
        tr = case.get("treatment", {})
        self.execute("INSERT OR REPLACE INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)" if self.kind == "sqlite" else
                     "INSERT INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING",
                     (case["case_id"], time.time(), case.get("patient_id"), image_name, ai.get("status"),
                      ai.get("predicted_class"), ai.get("confidence"), case.get("review", {}).get("decision"),
                      case.get("final_diagnosis"), case.get("kg", {}).get("status"),
                      None if tr.get("improved") is None else int(tr["improved"]),
                      case.get("reassessment_count", 0), json.dumps(case.get("route_log", [])),
                      json.dumps(case, default=str)))

    def list_cases(self, limit: int = 100) -> list[dict]:
        rows = self.query("SELECT id, created, patient_id, image_name, ai_status, ai_prediction, ai_confidence, "
                          "decision, final_diagnosis, kg_status, improved, reassessments, route FROM cases "
                          "ORDER BY created DESC LIMIT ?", (limit,))
        for r in rows:
            r["route"] = json.loads(r["route"] or "[]")
        return rows

    def get_case(self, cid: str) -> dict | None:
        r = self.query("SELECT payload FROM cases WHERE id=?", (cid,))
        return json.loads(r[0]["payload"]) if r else None

    def add_run(self, rid: str, kind: str, params: dict, metrics: dict):
        self.execute("INSERT INTO sim_runs VALUES (?,?,?,?,?)",
                     (rid, time.time(), kind, json.dumps(params, default=str), json.dumps(metrics, default=str)))

    def list_runs(self, kind: str | None = None, limit: int = 50) -> list[dict]:
        sql = "SELECT * FROM sim_runs" + (" WHERE kind=?" if kind else "") + " ORDER BY created DESC LIMIT ?"
        rows = self.query(sql, ((kind, limit) if kind else (limit,)))
        for r in rows:
            r["params"], r["metrics"] = json.loads(r["params"]), json.loads(r["metrics"])
        return rows


_DB: DB | None = None


def get_db() -> DB:
    global _DB
    if _DB is None:
        _DB = DB()
    return _DB
