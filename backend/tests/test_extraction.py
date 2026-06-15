import pytest

from app.services.extraction import ExtractionError, extract_text


def test_txt_extraction():
    text, used_ocr = extract_text("resume.txt", b"Alice Chen\nSenior Engineer")
    assert "Alice Chen" in text
    assert used_ocr is False


def test_md_extraction():
    text, _ = extract_text("notes.md", "# Notes\nGreat communicator".encode())
    assert "Great communicator" in text


def test_unsupported_type():
    with pytest.raises(ExtractionError):
        extract_text("malware.exe", b"\x00")
