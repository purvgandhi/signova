"""
Comprehensive System Verification Test for Consolidated Signova Platform
Verifies all HTTP routes, WebSockets, Gemini sentence layer, translation engine, and static assets.
"""
import sys
import json
import time
import asyncio
import websockets
import urllib.request
from pathlib import Path
import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:8000"


def test_http(path, desc, method="GET", data=None):
    url = f"{BASE}{path}"
    req = urllib.request.Request(url, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode("utf-8")
    with urllib.request.urlopen(req) as res:
        code = res.getcode()
        body = res.read()
        print(f"[PASS] {desc:32s}: HTTP {code} (Length: {len(body)} bytes)")
        return body


def verify_all_endpoints():
    print("=" * 70)
    print(" SIGNOVA SYSTEM INTEGRATION & ENDPOINT VERIFICATION")
    print("=" * 70)

    print("\n--- 1. HTTP ROUTES & ASSETS ---")
    test_http("/", "Root Landing Page")
    test_http("/studio", "Studio Route")
    test_http("/landing.js", "Landing Script")
    test_http("/landing.css", "Landing Styles")
    test_http("/app.js", "Studio App Script")
    test_http("/style.css", "Studio Main Styles")
    test_http("/api/health", "Health Endpoint")

    voc_raw = test_http("/api/vocabulary", "Vocabulary Endpoint")
    voc = json.loads(voc_raw.decode("utf-8"))
    assert voc["count"] == 25, f"Expected 25 classes, got {voc['count']}"
    print(f"       -> Confirmed {voc['count']} gesture classes in active vocabulary.")

    sent_raw = test_http(
        "/api/sentence", "Sentence Reconstruction",
        method="POST", data={"signs": ["call", "doctor"], "version_id": 1}
    )
    sent_res = json.loads(sent_raw.decode("utf-8"))
    print(f"       -> Reconstructed Sentence: '{sent_res['text']}' (Source: {sent_res['source']})")
    assert sent_res["text"] == "Please call a doctor."

    gem_raw = test_http(
        "/api/gemini-sentence", "Gemini Sentence Layer",
        method="POST", data={"words": ["accident", "help"], "request_id": 1}
    )
    gem_res = json.loads(gem_raw.decode("utf-8"))
    print(f"       -> Gemini Sentence: '{gem_res['sentence']}' (Source: {gem_res['source']})")

    trans_raw = test_http(
        "/api/translate", "Marathi Translation",
        method="POST", data={"text": "Please call a doctor.", "language": "Marathi", "version_id": 1}
    )
    trans_res = json.loads(trans_raw.decode("utf-8"))
    print(f"       -> Marathi Translation: '{trans_res['text']}'")
    assert "डॉक्टर" in trans_res["text"] or "कॉल" in trans_res["text"]

    test_http("/api/wordpacks", "Wordpacks Endpoint")
    test_http("/api/profiles", "Profiles Endpoint")
    test_http("/api/export-card", "Emergency Card Endpoint")

    print("\n--- 2. REAL-TIME WEBSOCKET STREAMING ---")
    async def test_ws():
        uri = "ws://127.0.0.1:8000/ws/recognition"
        async with websockets.connect(uri) as ws:
            # 1. Ping
            await ws.send(json.dumps({"type": "ping"}))
            ping_resp = json.loads(await ws.recv())
            print(f"[PASS] WS Ping-Pong Handshake   : type={ping_resp.get('type')}, packet_count={ping_resp.get('packet_count')}")

            # 2. Stream landmark feature frames
            sample_path = Path("data/gesture_data/hello/0.npy")
            hello_data = np.load(str(sample_path))

            for f in range(10):
                frame_features = hello_data[f].tolist()
                await ws.send(json.dumps({"type": "landmarks", "data": frame_features, "has_hand": True}))
                resp = json.loads(await ws.recv())

            print(f"[PASS] WS Live Landmark Stream  : gesture={resp.get('current_gesture')}, conf={resp.get('confidence', 0)*100:.1f}%, state={resp.get('state')}")
            assert resp.get("current_gesture") == "hello"

    asyncio.run(test_ws())

    print("\n" + "=" * 70)
    print(" ALL SYSTEM INTEGRATION TESTS PASSED PERFECTLY (100% SUCCESS)!")
    print("=" * 70)


if __name__ == "__main__":
    verify_all_endpoints()
