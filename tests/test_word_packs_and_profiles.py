from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_wordpacks_crud():
    # 1. Get word packs
    res = client.get("/api/wordpacks")
    assert res.status_code == 200
    initial_items = res.json()
    assert isinstance(initial_items, list)
    assert len(initial_items) >= 1

    # 2. Add custom word pack
    new_wp = {
        "signs_key": "help home please",
        "sentence": "Please help me return home safely.",
        "marathi": "कृपया मला सुरक्षितपणे घरी परत जाण्यास मदत करा.",
        "hindi": "कृपया मुझे सुरक्षित घर लौटने में मदद करें।"
    }
    res_add = client.post("/api/wordpacks", json=new_wp)
    assert res_add.status_code == 200

    # 3. Test that sentence engine resolves it as template
    res_sent = client.post("/api/sentence", json={"signs": ["help", "home", "please"], "version_id": 10})
    assert res_sent.status_code == 200
    assert res_sent.json()["text"] == "Please help me return home safely."
    assert res_sent.json()["source"] == "template"

    # 4. Delete custom word pack
    res_del = client.delete("/api/wordpacks/help home please")
    assert res_del.status_code == 200

def test_calibration_profiles():
    res = client.get("/api/profiles")
    assert res.status_code == 200
    data = res.json()
    assert "profiles" in data
    assert "active_profile_id" in data
    assert len(data["profiles"]) >= 3

    # Switch active profile
    res_switch = client.post("/api/profiles/active", json={"id": "expert"})
    assert res_switch.status_code == 200
    assert res_switch.json()["active_profile_id"] == "expert"

    # Restore default standard
    client.post("/api/profiles/active", json={"id": "standard"})

def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["backend_online"] is True
    assert data["active_model"] == "gemini-3.5-flash"
    assert "troubleshooting_tip" in data

def test_emergency_card_endpoint():
    res = client.get("/api/export-card")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "SignBridge" in res.text
    assert "Emergency" in res.text
