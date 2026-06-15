"""Direct SQLite access for the trainer service (shares the db_data volume with the API)."""
import json
import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.getenv("DATABASE_URL", "sqlite:////data/recruiterrag.db").replace("sqlite:///", "")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_run(run_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM training_runs WHERE id = ?", (run_id,)).fetchone()
        return dict(row) if row else None


def get_examples(dataset_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM training_examples WHERE dataset_id = ?", (dataset_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def update_run(run_id: str, **fields) -> None:
    sets = ", ".join(f"{k} = ?" for k in fields)
    with connect() as conn:
        conn.execute(f"UPDATE training_runs SET {sets} WHERE id = ?", (*fields.values(), run_id))
        conn.commit()


def mark_started(run_id: str) -> None:
    update_run(run_id, status="running", started_at=datetime.now(timezone.utc).isoformat())


def mark_completed(run_id: str, adapter_path: str, gguf_path: str | None,
                   eval_loss: float | None, metrics: dict) -> None:
    update_run(
        run_id,
        status="completed",
        progress=1.0,
        adapter_path=adapter_path,
        gguf_path=gguf_path,
        eval_loss=eval_loss,
        metrics=json.dumps(metrics),
        eval_summary=f"eval_loss={eval_loss}" if eval_loss is not None else "completed",
        completed_at=datetime.now(timezone.utc).isoformat(),
    )


def mark_failed(run_id: str, error: str) -> None:
    update_run(
        run_id,
        status="failed",
        eval_summary=error[:2000],
        completed_at=datetime.now(timezone.utc).isoformat(),
    )


def update_dataset_status(dataset_id: str, status: str) -> None:
    with connect() as conn:
        conn.execute("UPDATE training_datasets SET status = ? WHERE id = ?", (status, dataset_id))
        conn.commit()
