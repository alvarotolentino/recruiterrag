import pytest

from app.services.llm import extract_json


def test_plain_json():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_json_with_think_block():
    raw = "<think>\nreasoning here\n</think>\n{\"score\": 8}"
    assert extract_json(raw) == {"score": 8}


def test_json_in_code_fence():
    raw = '```json\n{"scores": [{"dimension": "Rust", "score": 7}]}\n```'
    assert extract_json(raw)["scores"][0]["score"] == 7


def test_json_embedded_in_prose():
    raw = 'Here is the result: {"ok": true} hope that helps'
    assert extract_json(raw) == {"ok": True}


def test_trailing_text_after_object():
    # Regression: model emitted a valid object then extra prose ("Extra data" case).
    raw = '{"full_name": "Alice", "score": 8}\n\nLet me know if you need more detail!'
    assert extract_json(raw) == {"full_name": "Alice", "score": 8}


def test_second_object_after_first_is_ignored():
    raw = '{"a": 1}\n{"b": 2}'
    assert extract_json(raw) == {"a": 1}


def test_think_block_then_object_with_trailing():
    raw = '<think>reasoning {nested}</think>\n{"ok": true}\nDone.'
    assert extract_json(raw) == {"ok": True}


def test_no_json_raises():
    with pytest.raises(ValueError):
        extract_json("no json here at all")
