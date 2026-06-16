import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Candidate(SQLModel, table=True):
    __tablename__ = "candidates"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    full_name: str
    email: Optional[str] = None
    years_exp: Optional[float] = None
    seniority: Optional[str] = None
    discipline: Optional[str] = None  # profession class (fullstack, data-engineering, ...)
    current_role: Optional[str] = None
    tech_stack: Optional[str] = None  # JSON array as string
    education: Optional[str] = None  # JSON array as string
    languages: Optional[str] = None  # JSON array as string
    work_experience: Optional[str] = None  # JSON array of roles, most-recent-first
    remote_pref: Optional[str] = None
    location: Optional[str] = None
    summary: Optional[str] = None
    raw_text: Optional[str] = None
    recruiter_notes: Optional[str] = None
    file_paths: Optional[str] = None  # JSON array of MinIO paths
    section_sources: Optional[str] = None  # JSON dict: section_name → 'ai' | 'recruiter'
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Position(SQLModel, table=True):
    __tablename__ = "positions"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    title: str
    description: Optional[str] = None
    extracted_schema: Optional[str] = None  # JSON (JD extraction result)
    stages: Optional[str] = None  # JSON array of stage names
    status: str = "open"  # open | paused | closed_filled | closed_cancelled
    budget_range: Optional[str] = None
    remote_pref: Optional[str] = None
    location: Optional[str] = None
    min_years_exp: Optional[float] = None
    seniority: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    closed_at: Optional[datetime] = None


class PipelineCandidate(SQLModel, table=True):
    __tablename__ = "pipeline_candidates"
    __table_args__ = (UniqueConstraint("position_id", "candidate_id"),)

    id: str = Field(default_factory=new_uuid, primary_key=True)
    position_id: str = Field(foreign_key="positions.id", index=True)
    candidate_id: str = Field(foreign_key="candidates.id", index=True)
    current_stage: Optional[str] = None
    fit_score: Optional[float] = None
    dimension_scores: Optional[str] = None  # JSON [{dimension, score, justification}]
    status: str = "eligible"  # eligible | excluded (failed an exclusion gate)
    exclusion_reason: Optional[str] = None  # which gate + plain-language why
    recruiter_notes: Optional[str] = None
    added_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class StageHistory(SQLModel, table=True):
    __tablename__ = "stage_history"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    pipeline_cand_id: str = Field(foreign_key="pipeline_candidates.id", index=True)
    from_stage: Optional[str] = None
    to_stage: str
    changed_at: datetime = Field(default_factory=utcnow)
    note: Optional[str] = None


class PipelineNote(SQLModel, table=True):
    """Stage-tagged interview/screening note for a candidate within a position."""
    __tablename__ = "pipeline_notes"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    pipeline_cand_id: str = Field(foreign_key="pipeline_candidates.id", index=True)
    stage: str  # pipeline stage the note belongs to (e.g. "Technical Interview")
    content: str
    created_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    position_id: str = Field(foreign_key="positions.id", index=True)
    role: str  # 'user' | 'assistant'
    content: str
    response_type: Optional[str] = None
    response_data: Optional[str] = None  # JSON payload for frontend rendering
    created_at: datetime = Field(default_factory=utcnow)


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"

    key: str = Field(primary_key=True)
    value: str


class TrainingDataset(SQLModel, table=True):
    __tablename__ = "training_datasets"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    name: str
    description: Optional[str] = None
    method: Optional[str] = None  # 'sft' | 'dpo' | 'grpo'
    status: str = "draft"  # draft | ready | training | completed
    created_at: datetime = Field(default_factory=utcnow)


class TrainingExample(SQLModel, table=True):
    __tablename__ = "training_examples"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    dataset_id: str = Field(foreign_key="training_datasets.id", index=True)
    example_type: Optional[str] = None  # 'sft' | 'dpo_pair' | 'grpo_prompt'
    prompt: str
    chosen_response: Optional[str] = None
    rejected_response: Optional[str] = None
    cot_trace: Optional[str] = None
    recruiter_notes: Optional[str] = None
    confidence: Optional[str] = None  # high | medium | low
    source_pipeline_id: Optional[str] = Field(default=None, foreign_key="positions.id")
    source_candidate_ids: Optional[str] = None  # JSON array of candidate UUIDs
    created_at: datetime = Field(default_factory=utcnow)


class TrainingTag(SQLModel, table=True):
    __tablename__ = "training_tags"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    candidate_id: Optional[str] = Field(default=None, foreign_key="candidates.id")
    position_id: Optional[str] = Field(default=None, foreign_key="positions.id")
    dataset_id: Optional[str] = Field(default=None, foreign_key="training_datasets.id")
    outcome: Optional[str] = None  # selected | rejected | shortlisted | pending
    signal_type: Optional[str] = None
    stage_reached: Optional[str] = None
    confidence: Optional[str] = None
    reasoning: Optional[str] = None
    cot_trace: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class TrainingRun(SQLModel, table=True):
    __tablename__ = "training_runs"

    id: str = Field(default_factory=new_uuid, primary_key=True)
    dataset_id: str = Field(foreign_key="training_datasets.id", index=True)
    method: str  # 'sft' | 'dpo' | 'grpo'
    base_model: str = "Qwen/Qwen3-4B"
    lora_rank: int = 16
    epochs: int = 3
    learning_rate: float = 2e-4
    use_qlora: bool = True
    status: str = "queued"  # queued | running | completed | failed
    progress: float = 0.0
    adapter_path: Optional[str] = None
    gguf_path: Optional[str] = None
    eval_loss: Optional[float] = None
    notes: Optional[str] = None
    eval_summary: Optional[str] = None
    metrics: Optional[str] = None  # JSON loss curve etc.
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class ActiveAdapter(SQLModel, table=True):
    __tablename__ = "active_adapter"

    id: int = Field(default=1, primary_key=True)
    run_id: str = Field(foreign_key="training_runs.id")
    activated_at: datetime = Field(default_factory=utcnow)
