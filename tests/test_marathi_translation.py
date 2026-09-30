from fastapi.testclient import TestClient
from backend.app import app
from backend.translation_engine import is_devanagari

client = TestClient(app)

def test_marathi_translation_devanagari():
    """Verify Marathi translation produces authentic Devanagari script."""
    res = client.post("/api/translate", json={
        "text": "Water, please.",
        "language": "Marathi",
        "version_id": 1
    })
    assert res.status_code == 200
    data = res.json()
    assert data["language"] == "Marathi"
    assert data["version_id"] == 1
    # Check that text contains Devanagari
    assert is_devanagari(data["text"])
    assert "पाणी" in data["text"]

def test_hindi_translation_devanagari():
    res = client.post("/api/translate", json={
        "text": "Water, please.",
        "language": "Hindi",
        "version_id": 2
    })
    assert res.status_code == 200
    data = res.json()
    assert data["language"] == "Hindi"
    assert is_devanagari(data["text"])

def test_english_bypass():
    res = client.post("/api/translate", json={
        "text": "I need help.",
        "language": "English",
        "version_id": 3
    })
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "I need help."
    assert data["has_error"] is False

def test_unknown_phrase_fallback_has_explicit_reason():
    """Bug 4 fix: Verify failure does NOT return generic failure without reason code."""
    res = client.post("/api/translate", json={
        "text": "A very obscure non-dictionary phrase XYZ123.",
        "language": "Marathi",
        "version_id": 4
    })
    assert res.status_code == 200
    data = res.json()
    # If API key is not present or Gemini fails, has_error should be True and error_reason provided
    if data["has_error"]:
        assert data["error_reason"] is not None
        assert len(data["error_reason"]) > 0
        assert data["error_reason"] in ["offline_no_api_key", "upstream_service_503", "rate_limit_exceeded_429", "model_decommissioned_404"] or "error" in data["error_reason"]
