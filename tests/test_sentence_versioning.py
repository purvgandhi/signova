from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_empty_buffer_reconstruction():
    res = client.post("/api/sentence", json={"signs": [], "version_id": 10})
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == ""
    assert data["version_id"] == 10
    assert data["source"] == "fallback"

def test_exact_sentence_matching():
    # Exactly from 100 controlled examples
    res = client.post("/api/sentence", json={"signs": ["water", "please"], "version_id": 1})
    assert res.status_code == 200
    data = res.json()
    assert data["text"] == "Water, please."
    assert data["source"] == "exact"
    assert data["version_id"] == 1

def test_custom_wordpack_matching():
    # Test word pack
    res = client.post("/api/sentence", json={"signs": ["water", "please", "more"], "version_id": 4})
    assert res.status_code == 200
    data = res.json()
    assert data["source"] in ["template", "gemini", "exact"]
    assert "water" in data["text"].lower()
    assert data["version_id"] == 4

def test_version_id_preservation():
    # Verify version IDs increment and are returned strictly matching request
    for v in [1, 2, 5, 42, 999]:
        res = client.post("/api/sentence", json={"signs": ["hello"], "version_id": v})
        assert res.status_code == 200
        data = res.json()
        assert data["version_id"] == v
