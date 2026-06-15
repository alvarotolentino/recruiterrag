import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import Candidate, ChatMessage, PipelineCandidate, Position, StageHistory, utcnow
from ..services.agents import chat_agent

router = APIRouter(prefix="/positions/{position_id}/chat", tags=["chat"])

HISTORY_TURNS = 10  # last N messages injected into the LLM context


class ChatRequest(BaseModel):
    message: str


def _build_context(session: Session, position: Position) -> tuple[str, list[str]]:
    schema = json.loads(position.extracted_schema or "{}")
    stages = json.loads(position.stages or "[]")
    dimensions = [d["name"] for d in schema.get("scoring_dimensions", [])]

    rows = session.exec(
        select(PipelineCandidate, Candidate)
        .where(PipelineCandidate.position_id == position.id)
        .where(PipelineCandidate.candidate_id == Candidate.id)
        .where(PipelineCandidate.status != "excluded")
    ).all()
    candidates = []
    for pc, c in rows:
        candidates.append({
            "name": c.full_name,
            "candidate_id": c.id,
            "current_role": c.current_role,
            "seniority": c.seniority,
            "years_exp": c.years_exp,
            "remote_pref": c.remote_pref,
            "summary": c.summary,
            "fit_score": pc.fit_score,
            "stage": pc.current_stage,
            "dimension_scores": json.loads(pc.dimension_scores or "[]"),
        })
    candidates.sort(key=lambda x: x["fit_score"] or 0, reverse=True)

    summary = schema.get("position_title", position.title)
    responsibilities = schema.get("key_responsibilities") or []
    if responsibilities:
        summary += ". Key responsibilities: " + "; ".join(responsibilities[:5])

    system_prompt = chat_agent.build_system_prompt(
        position_title=position.title,
        position_summary=summary,
        dimensions=dimensions,
        candidates=candidates,
        stages=stages,
    )
    return system_prompt, stages


def _apply_action(session: Session, position: Position, action: dict) -> str | None:
    """Stage-move intent: chat can trigger a stage transition."""
    if not action or action.get("type") != "move_stage":
        return None
    name = (action.get("candidate_name") or "").strip().lower()
    to_stage = action.get("to_stage")
    stages = json.loads(position.stages or "[]")
    if not name or not to_stage or (stages and to_stage not in stages):
        return None
    rows = session.exec(
        select(PipelineCandidate, Candidate)
        .where(PipelineCandidate.position_id == position.id)
        .where(PipelineCandidate.candidate_id == Candidate.id)
        .where(PipelineCandidate.status != "excluded")
    ).all()
    for pc, c in rows:
        if c.full_name.strip().lower() == name:
            from_stage = pc.current_stage
            pc.current_stage = to_stage
            pc.updated_at = utcnow()
            session.add(pc)
            session.add(StageHistory(pipeline_cand_id=pc.id, from_stage=from_stage,
                                     to_stage=to_stage, note="Moved via chat"))
            session.commit()
            return f"{c.full_name} moved from {from_stage} to {to_stage}"
    return None


@router.post("")
async def send_message(position_id: str, body: ChatRequest, session: Session = Depends(get_session)):
    position = session.get(Position, position_id)
    if position is None:
        raise HTTPException(404, "Position not found")
    if not body.message.strip():
        raise HTTPException(400, "Empty message")

    system_prompt, _ = _build_context(session, position)

    past = session.exec(
        select(ChatMessage)
        .where(ChatMessage.position_id == position_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_TURNS)
    ).all()
    history = [{"role": m.role, "content": m.content} for m in reversed(past)]

    user_msg = ChatMessage(position_id=position_id, role="user", content=body.message)
    session.add(user_msg)
    session.commit()

    try:
        envelope = await chat_agent.chat(system_prompt, history, body.message)
    except Exception as exc:
        raise HTTPException(502, f"Chat agent failed: {exc}")

    action_result = _apply_action(session, position, envelope.get("action") or {})
    if action_result:
        envelope["text"] = (envelope.get("text") or "") + f"\n\n✅ {action_result}"

    assistant_msg = ChatMessage(
        position_id=position_id,
        role="assistant",
        content=envelope.get("text", ""),
        response_type=envelope.get("response_type"),
        response_data=json.dumps(envelope.get("data") or {}),
    )
    session.add(assistant_msg)
    session.commit()
    session.refresh(assistant_msg)

    return {
        "message_id": assistant_msg.id,
        "response_type": envelope.get("response_type"),
        "text": envelope.get("text"),
        "data": envelope.get("data") or {},
        "created_at": assistant_msg.created_at.isoformat(),
    }


@router.get("/history")
def history(position_id: str, session: Session = Depends(get_session)):
    messages = session.exec(
        select(ChatMessage)
        .where(ChatMessage.position_id == position_id)
        .order_by(ChatMessage.created_at)
    ).all()
    return [
        {
            "message_id": m.id,
            "role": m.role,
            "text": m.content,
            "response_type": m.response_type,
            "data": json.loads(m.response_data or "{}"),
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.delete("/history")
def clear_history(position_id: str, session: Session = Depends(get_session)):
    messages = session.exec(
        select(ChatMessage).where(ChatMessage.position_id == position_id)
    ).all()
    for m in messages:
        session.delete(m)
    session.commit()
    return {"ok": True, "deleted": len(messages)}
