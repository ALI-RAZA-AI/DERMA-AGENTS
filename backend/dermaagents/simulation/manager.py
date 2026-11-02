"""Live simulation controller (start / pause / reset) and background job manager."""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, fields

from .model import ClinicModel, SimParams


def params_from_dict(d: dict) -> SimParams:
    names = {f.name for f in fields(SimParams)}
    return SimParams(**{k: v for k, v in (d or {}).items() if k in names and v is not None})


class SimulationManager:
    """Runs one interactive Mesa model in a background thread so the UI can watch it live."""

    def __init__(self):
        self.lock = threading.RLock()
        self.model: ClinicModel | None = None
        self.thread: threading.Thread | None = None
        self.running = False
        self.state = "idle"  # idle | running | paused | finished
        self.steps_per_tick = 20
        self.tick_seconds = 0.05
        self.run_id = None
        self.started_at = None
        self.on_finish = None

    def start(self, params: SimParams | None = None, speed: int | None = None):
        with self.lock:
            if speed:
                self.steps_per_tick = max(1, min(int(speed), 2000))
            if self.model is None or self.state == "finished" or params is not None:
                self.model = ClinicModel(params or SimParams())
                self.run_id = uuid.uuid4().hex[:12]
                self.started_at = time.time()
            if self.running:
                return self.status()
            self.running = True
            self.state = "running"
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
            return self.status()

    def _loop(self):
        while True:
            with self.lock:
                if not self.running or self.model is None:
                    return
                for _ in range(self.steps_per_tick):
                    if self.model.done():
                        self.running = False
                        self.state = "finished"
                        if self.on_finish:
                            try:
                                self.on_finish(self.run_id, self.model)
                            except Exception:  # noqa: BLE001
                                traceback.print_exc()
                        return
                    self.model.step()
            time.sleep(self.tick_seconds)

    def pause(self):
        with self.lock:
            if self.running:
                self.running = False
                self.state = "paused"
            return self.status()

    def reset(self):
        with self.lock:
            self.running = False
            self.model = None
            self.state = "idle"
            self.run_id = None
            return self.status()

    def status(self) -> dict:
        with self.lock:
            m = self.model
            if m is None:
                return {"state": self.state, "run_id": None}
            total = m.total_minutes
            return {
                "state": self.state, "run_id": self.run_id, "minute": m.minute, "total_minutes": total,
                "day": min(m.p.days, m.minute // m.p.operating_minutes + 1),
                "progress": min(1.0, m.minute / total), "clinic_open": m.is_open(),
                "queues": {"ai": len(m.env.ai_queue),
                           "dermatologist": len([p for p in m.env.derm_queue if p.status == "waiting_derm"]),
                           "treatment": len(m.env.treatment_queue)},
                "busy": {"dermatologists": sum(d.current is not None for d in m.derms), "of": len(m.derms),
                         "ai_stations": sum(a.current is not None for a in m.ai_agents), "ai_of": len(m.ai_agents)},
                "arrived": m.env.arrivals, "served": len(m.served), "left": m.left_without_seen,
                "congestion": round(m.env.congestion, 2), "params": asdict(m.p),
                "recent_events": list(m.events)[-25:], "steps_per_tick": self.steps_per_tick,
            }

    def metrics(self) -> dict:
        with self.lock:
            m = self.model
            if m is None:
                return {"state": self.state, "metrics": None}
            return {"state": self.state, "run_id": self.run_id, "metrics": m.metrics(),
                    "timeseries": m.timeseries(), "agents": m.agent_summary()}


class JobManager:
    def __init__(self, workers: int = 2):
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()

    def submit(self, kind: str, fn, *args, **kw) -> str:
        jid = uuid.uuid4().hex[:12]
        with self.lock:
            self.jobs[jid] = {"id": jid, "kind": kind, "state": "queued", "created": time.time(), "result": None,
                              "error": None}

        def run():
            self.jobs[jid]["state"] = "running"
            try:
                self.jobs[jid]["result"] = fn(*args, **kw)
                self.jobs[jid]["state"] = "done"
            except Exception as e:  # noqa: BLE001
                self.jobs[jid]["state"] = "error"
                self.jobs[jid]["error"] = f"{type(e).__name__}: {e}"
            self.jobs[jid]["finished"] = time.time()
        self.pool.submit(run)
        return jid

    def get(self, jid: str) -> dict | None:
        return self.jobs.get(jid)
