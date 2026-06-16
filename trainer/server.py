"""Trainer service HTTP API: receives jobs from the main API, runs them in a worker thread."""
import logging
import threading
from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import trainer_db
import training
from hardware import detect_hardware

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="RecruiterRAG Trainer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local single-user app; the UI calls the trainer directly
    allow_methods=["*"],
    allow_headers=["*"],
)

_active_lock = threading.Lock()
_active_run: str | None = None


class JobRequest(BaseModel):
    run_id: str


@app.get("/health")
def health():
    return {"status": "ok", "active_run": _active_run}


@app.get("/hardware")
def hardware():
    return asdict(detect_hardware())


@app.post("/jobs")
def submit_job(body: JobRequest):
    global _active_run
    run = trainer_db.get_run(body.run_id)
    if run is None:
        raise HTTPException(404, f"Run {body.run_id} not found")
    with _active_lock:
        if _active_run is not None:
            raise HTTPException(409, f"Training run {_active_run} already in progress")
        _active_run = body.run_id

    def worker():
        global _active_run
        try:
            training.run_training(body.run_id)
        finally:
            with _active_lock:
                _active_run = None

    threading.Thread(target=worker, daemon=True).start()
    return {"accepted": True, "run_id": body.run_id}


@app.post("/activate")
def activate(body: JobRequest):
    if not training.stage_adapter(body.run_id):
        raise HTTPException(500, "Failed to stage adapter into model volume")
    return {"ok": True}
