import os
import tempfile

import pytest


@pytest.fixture()
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{path}")
    # Reload modules so the engine picks up the temp DB
    import importlib

    from app import config, db

    importlib.reload(config)
    importlib.reload(db)
    db.init_db()
    yield db
    db.engine.dispose()
    os.unlink(path)


def test_fts5_trigger_sync(temp_db):
    from sqlalchemy import text
    from sqlmodel import Session

    from app.models import TrainingDataset, TrainingExample

    with Session(temp_db.engine) as session:
        ds = TrainingDataset(name="test")
        session.add(ds)
        session.commit()
        ex = TrainingExample(dataset_id=ds.id, prompt="Evaluate kubernetes expertise",
                             chosen_response="strong", example_type="dpo_pair")
        session.add(ex)
        session.commit()

    with temp_db.engine.connect() as conn:
        rows = conn.execute(
            text("SELECT example_id FROM fts_training_examples WHERE fts_training_examples MATCH 'kubernetes'")
        ).fetchall()
    assert len(rows) == 1


def test_settings_seeded(temp_db):
    from sqlmodel import Session, select

    from app.models import AppSetting

    with Session(temp_db.engine) as session:
        row = session.exec(select(AppSetting).where(AppSetting.key == "onboarding_complete")).first()
    assert row is not None
    assert row.value == "false"
