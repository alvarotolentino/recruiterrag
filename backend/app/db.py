from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import settings
from .models import AppSetting

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


FTS5_DDL = [
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_training_examples USING fts5(
      example_id UNINDEXED,
      dataset_id UNINDEXED,
      prompt,
      chosen_response,
      rejected_response,
      cot_trace,
      recruiter_notes
    )
    """,
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_training_tags USING fts5(
      tag_id UNINDEXED,
      candidate_id UNINDEXED,
      position_id UNINDEXED,
      outcome,
      signal_type,
      reasoning,
      cot_trace
    )
    """,
    """
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_training_runs USING fts5(
      run_id UNINDEXED,
      method,
      base_model,
      notes,
      eval_summary
    )
    """,
]

# Triggers keep the FTS5 indexes in sync with their source tables.
FTS5_TRIGGERS = [
    # training_examples
    """
    CREATE TRIGGER IF NOT EXISTS trg_te_ai AFTER INSERT ON training_examples BEGIN
      INSERT INTO fts_training_examples(rowid, example_id, dataset_id, prompt, chosen_response, rejected_response, cot_trace, recruiter_notes)
      VALUES (new.rowid, new.id, new.dataset_id, new.prompt, new.chosen_response, new.rejected_response, new.cot_trace, new.recruiter_notes);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_te_ad AFTER DELETE ON training_examples BEGIN
      DELETE FROM fts_training_examples WHERE rowid = old.rowid;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_te_au AFTER UPDATE ON training_examples BEGIN
      DELETE FROM fts_training_examples WHERE rowid = old.rowid;
      INSERT INTO fts_training_examples(rowid, example_id, dataset_id, prompt, chosen_response, rejected_response, cot_trace, recruiter_notes)
      VALUES (new.rowid, new.id, new.dataset_id, new.prompt, new.chosen_response, new.rejected_response, new.cot_trace, new.recruiter_notes);
    END
    """,
    # training_tags
    """
    CREATE TRIGGER IF NOT EXISTS trg_tt_ai AFTER INSERT ON training_tags BEGIN
      INSERT INTO fts_training_tags(rowid, tag_id, candidate_id, position_id, outcome, signal_type, reasoning, cot_trace)
      VALUES (new.rowid, new.id, new.candidate_id, new.position_id, new.outcome, new.signal_type, new.reasoning, new.cot_trace);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_tt_ad AFTER DELETE ON training_tags BEGIN
      DELETE FROM fts_training_tags WHERE rowid = old.rowid;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_tt_au AFTER UPDATE ON training_tags BEGIN
      DELETE FROM fts_training_tags WHERE rowid = old.rowid;
      INSERT INTO fts_training_tags(rowid, tag_id, candidate_id, position_id, outcome, signal_type, reasoning, cot_trace)
      VALUES (new.rowid, new.id, new.candidate_id, new.position_id, new.outcome, new.signal_type, new.reasoning, new.cot_trace);
    END
    """,
    # training_runs
    """
    CREATE TRIGGER IF NOT EXISTS trg_tr_ai AFTER INSERT ON training_runs BEGIN
      INSERT INTO fts_training_runs(rowid, run_id, method, base_model, notes, eval_summary)
      VALUES (new.rowid, new.id, new.method, new.base_model, new.notes, new.eval_summary);
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_tr_ad AFTER DELETE ON training_runs BEGIN
      DELETE FROM fts_training_runs WHERE rowid = old.rowid;
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_tr_au AFTER UPDATE ON training_runs BEGIN
      DELETE FROM fts_training_runs WHERE rowid = old.rowid;
      INSERT INTO fts_training_runs(rowid, run_id, method, base_model, notes, eval_summary)
      VALUES (new.rowid, new.id, new.method, new.base_model, new.notes, new.eval_summary);
    END
    """,
]


# Columns added after the initial schema shipped. SQLModel.create_all never ALTERs an
# existing table, so add any missing columns here (idempotent, additive only).
ADDITIVE_COLUMNS: dict[str, dict[str, str]] = {
    "candidates": {"work_experience": "TEXT", "discipline": "TEXT", "section_sources": "TEXT"},
    "pipeline_candidates": {
        "status": "TEXT DEFAULT 'eligible'",
        "exclusion_reason": "TEXT",
    },
}


def _apply_additive_columns(conn) -> None:
    for table, columns in ADDITIVE_COLUMNS.items():
        existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
        for name, coltype in columns.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {coltype}"))


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        _apply_additive_columns(conn)
        for ddl in FTS5_DDL:
            conn.execute(text(ddl))
        for trg in FTS5_TRIGGERS:
            conn.execute(text(trg))
    seed_settings()


def seed_settings() -> None:
    with Session(engine) as session:
        if session.exec(select(AppSetting).where(AppSetting.key == "onboarding_complete")).first() is None:
            session.add(AppSetting(key="onboarding_complete", value="false"))
        if session.exec(select(AppSetting).where(AppSetting.key == "app_version")).first() is None:
            session.add(AppSetting(key="app_version", value=settings.APP_VERSION))
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
