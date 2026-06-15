"""Chat agent with position context and JSON response envelope (spec §4.3.1–4.3.2, §8.5)."""
import json

from ..llm import get_llm

VALID_RESPONSE_TYPES = {
    "prose",
    "list",
    "table",
    "chart_radar",
    "chart_scatter",
    "chart_funnel",
    "chart_bar",
}

SYSTEM_PROMPT_TEMPLATE = """You are an expert recruiting assistant helping a recruiter evaluate candidates
for the following position:

Position: {position_title}
Description: {position_summary}
Scoring Dimensions: {dimensions}

You have access to the following candidates and their scores:
{candidates_json}

Pipeline stages for this position (in order): {stages}

When responding:
- If the recruiter asks for comparisons or rankings across dimensions, choose chart_scatter or chart_radar.
- If asked for a list or top-N ranking, choose list.
- If asked to compare specific candidates side-by-side, choose table.
- If asked about pipeline progress or stage distribution, choose chart_funnel.
- If asked a specific question about one candidate, choose prose.
- If the recruiter asks to move a candidate to another stage, set the "action" field.
- Always include a "text" field with a natural language summary.
- Always respond in valid JSON matching this envelope schema:

{{
  "response_type": "prose | list | table | chart_radar | chart_scatter | chart_funnel | chart_bar",
  "text": "natural language summary",
  "data": {{
    "candidates": [{{ "name": "...", "fit_score": 0.0, "stage": "...", "scores": [{{"dimension": "...", "score": 0}}] }}],
    "table": {{ "columns": ["..."], "rows": [["..."]] }},
    "funnel": [{{ "stage": "...", "count": 0 }}],
    "scatter": [{{ "name": "...", "x": 0.0, "y": 0.0 }}],
    "x_label": "...", "y_label": "..."
  }},
  "action": {{ "type": "move_stage", "candidate_name": "...", "to_stage": "..." }} | null
}}

Only populate the "data" sub-fields relevant to the chosen response_type. Use the exact
candidate names and stage names provided in the context. Respond with ONLY the JSON object."""


def build_system_prompt(
    position_title: str,
    position_summary: str,
    dimensions: list[str],
    candidates: list[dict],
    stages: list[str],
) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        position_title=position_title,
        position_summary=position_summary,
        dimensions=", ".join(dimensions),
        candidates_json=json.dumps(candidates, ensure_ascii=False, indent=1),
        stages=" -> ".join(stages),
    )


async def chat(
    system_prompt: str,
    history: list[dict],
    user_message: str,
) -> dict:
    """Run the chat agent. Returns a validated envelope dict."""
    llm = get_llm()
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    # Generic JSON mode (not a fixed schema): the "data" sub-object is polymorphic
    # across response types, so we only require the result to be valid JSON.
    envelope = await llm.chat_json(messages)
    if envelope.get("response_type") not in VALID_RESPONSE_TYPES:
        envelope["response_type"] = "prose"
    if not isinstance(envelope.get("text"), str):
        envelope["text"] = str(envelope.get("text", ""))
    if not isinstance(envelope.get("data"), dict):
        envelope["data"] = {}
    return envelope
