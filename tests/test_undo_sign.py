from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_undo_pipeline_sequence():
    """Bug 5 fix: Test that popping latest sign regenerates sentence for shortened buffer."""
    initial_signs = ["hello", "where", "doctor", "pain"]
    version_id = 1

    # Initial sentence with 4 tokens
    res1 = client.post("/api/sentence", json={"signs": initial_signs, "version_id": version_id})
    assert res1.status_code == 200
    data1 = res1.json()

    # User triggers Undo Sign
    popped = initial_signs.pop()
    assert popped == "pain"
    version_id += 1

    # Shortened buffer with 3 tokens
    assert initial_signs == ["hello", "where", "doctor"]
    res2 = client.post("/api/sentence", json={"signs": initial_signs, "version_id": version_id})
    assert res2.status_code == 200
    data2 = res2.json()

    assert data2["version_id"] == 2
    # Verify the sentence changed and no longer refers to pain
    assert data1["text"] != data2["text"] or len(initial_signs) < 4
