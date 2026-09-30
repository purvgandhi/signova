from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()  # Load .env (GEMINI_API_KEY, GEMINI_MODEL)
import os
import json
import time
import base64
from pathlib import Path
from typing import List, Dict, Any, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.models import (
    SentenceRequest, SentenceResponse,
    TranslationRequest, TranslationResponse,
    WordPackItem, CalibrationProfile, HealthResponse
)
from backend.sentence_engine import sentence_engine
from backend.translation_engine import translation_engine
from backend.wordpacks import get_all_wordpacks, save_wordpack, delete_wordpack
from backend.calibration import (
    get_all_profiles, save_profile, get_active_profile_id, set_active_profile_id
)
from backend.export_card import generate_emergency_card_html
from backend.gemini_sentence import gemini_sentence_former, GeminiSentenceRequest, GeminiSentenceResponse
from ml.recognition.recognizer import SignRecognizer

app = FastAPI(
    title="SignBridge Intelligence Studio",
    description="Assistive Sign Language & Local Language Communication Bridge",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Runtime telemetry state
_camera_state = {
    "active": False,
    "fps": 0.0,
    "last_ping": 0.0
}

# Recognition Engine Singleton
_recognizer: Optional[SignRecognizer] = None

def get_recognizer() -> SignRecognizer:
    global _recognizer
    if _recognizer is None:
        print("[APP] Initializing SignRecognizer engine...")
        _recognizer = SignRecognizer()
    return _recognizer

@app.websocket("/ws/recognition")
async def websocket_recognition(websocket: WebSocket):
    await websocket.accept()
    rec = get_recognizer()
    print("[WS] Client connected to /ws/recognition")
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "frame")

            if msg_type == "landmarks":
                features = msg.get("data", [])
                has_hand = bool(msg.get("has_hand", False))
                raw_lms = msg.get("landmarks", [])
                result = rec.process_landmarks_data(features, has_hand, raw_lms)
                await websocket.send_json({
                    "type": "recognition_result",
                    **result
                })

            elif msg_type == "frame":
                data_url = msg.get("data", "")
                if "," in data_url:
                    data_url = data_url.split(",", 1)[1]
                frame_bytes = base64.b64decode(data_url)
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if frame is not None:
                    result = rec.process_frame_data(frame)
                    await websocket.send_json({
                        "type": "recognition_result",
                        **result
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to decode frame image"
                    })

            elif msg_type == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "time": time.time(),
                    "packet_count": rec.packet_counter
                })

            elif msg_type == "reset":
                rec.state_machine.reset()
                rec.frame_buffer.clear()
                await websocket.send_json({
                    "type": "reset_ack",
                    "state": rec.state_machine.state.value
                })

    except WebSocketDisconnect:
        print("[WS] Client disconnected from /ws/recognition")
    except Exception as e:
        print(f"[WS Exception] {e}")

@app.get("/api/vocabulary")
def api_vocabulary():
    rec = get_recognizer()
    return {"vocabulary": rec.labels, "count": len(rec.labels)}

@app.get("/api/analytics")
def api_analytics():
    rec = get_recognizer()
    return {
        "status": "online",
        "recognition": {
            "packet_counter": rec.packet_counter,
            "total_accepted": rec.state_machine.total_accepted,
            "duplicate_suppressions": rec.state_machine.duplicate_suppressions,
            "state_machine": rec.state_machine.to_dict(),
            "buffer_fill": len(rec.frame_buffer)
        },
        "sentence_engine": sentence_engine.metrics,
        "translation_engine": translation_engine.metrics,
        "camera": _camera_state
    }

@app.post("/api/sentence", response_model=SentenceResponse)
def api_reconstruct_sentence(request: SentenceRequest):
    return sentence_engine.reconstruct_sentence(request)

# Gemini sentence-formation layer: recognized words -> one generated sentence (key stays server-side)
@app.post("/api/gemini-sentence", response_model=GeminiSentenceResponse)
def api_gemini_sentence(request: GeminiSentenceRequest):
    return gemini_sentence_former.generate(request)

@app.post("/api/translate", response_model=TranslationResponse)
def api_translate(request: TranslationRequest):
    return translation_engine.translate(request)

@app.get("/api/wordpacks", response_model=List[WordPackItem])
def api_get_wordpacks():
    return get_all_wordpacks()

@app.post("/api/wordpacks", response_model=WordPackItem)
def api_save_wordpack(item: WordPackItem):
    return save_wordpack(item)

@app.delete("/api/wordpacks/{signs_key:path}")
def api_delete_wordpack(signs_key: str):
    success = delete_wordpack(signs_key)
    if not success:
        raise HTTPException(status_code=404, detail="Word pack key not found")
    return {"status": "deleted", "signs_key": signs_key}

@app.get("/api/profiles")
def api_get_profiles():
    profiles = get_all_profiles()
    active_id = get_active_profile_id()
    return {
        "active_profile_id": active_id,
        "profiles": [p.model_dump() for p in profiles]
    }

@app.post("/api/profiles", response_model=CalibrationProfile)
def api_save_profile(profile: CalibrationProfile):
    return save_profile(profile)

@app.post("/api/profiles/active")
def api_set_active_profile(payload: Dict[str, str] = Body(...)):
    profile_id = payload.get("id", "standard")
    set_active_profile_id(profile_id)
    return {"status": "ok", "active_profile_id": profile_id}

@app.post("/api/health/camera")
def api_update_camera(payload: Dict[str, Any] = Body(...)):
    _camera_state["active"] = bool(payload.get("active", False))
    _camera_state["fps"] = float(payload.get("fps", 0.0))
    _camera_state["last_ping"] = time.time()
    return {"status": "ok", "camera": _camera_state}

@app.get("/api/health", response_model=HealthResponse)
def api_health():
    now = time.time()
    cam_active = _camera_state["active"] and (now - _camera_state["last_ping"] < 10.0)
    fps = _camera_state["fps"] if cam_active else 0.0

    gemini_key = bool(os.getenv("GEMINI_API_KEY"))
    active_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    if not cam_active:
        tip = "Webcam is currently idle or disconnected. Click 'Start Camera' and check browser permissions."
    elif fps < 10.0:
        tip = "Camera frame rate is below 10 FPS. Ensure sufficient indoor lighting and close background apps."
    elif not gemini_key:
        tip = "Operating in Local SLM Offline mode with 100 controlled phrases & Devanagari dictionary."
    else:
        tip = f"System healthy: Camera active at {fps:.1f} FPS with {active_model} SLM online."

    return HealthResponse(
        status="healthy",
        backend_online=True,
        gemini_configured=gemini_key,
        active_model=active_model,
        camera_active=cam_active,
        fps=round(fps, 1),
        troubleshooting_tip=tip
    )

@app.get("/api/export-card", response_class=HTMLResponse)
def api_export_card():
    return generate_emergency_card_html()

# Explicit no-cache routes for key frontend assets
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

def _no_cache_response(file_path: Path, media_type: str) -> HTMLResponse:
    content = file_path.read_text(encoding="utf-8")
    return HTMLResponse(
        content=content,
        media_type=media_type,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@app.get("/", response_class=HTMLResponse)
@app.get("/index.html", response_class=HTMLResponse)
@app.get("/studio", response_class=HTMLResponse)
async def serve_index():
    return _no_cache_response(FRONTEND_DIR / "index.html", "text/html")

@app.get("/sw.js")
async def serve_sw():
    return _no_cache_response(FRONTEND_DIR / "sw.js", "application/javascript")

@app.get("/app.js")
async def serve_app_js():
    return _no_cache_response(FRONTEND_DIR / "app.js", "application/javascript")

@app.get("/style.css")
async def serve_style_css():
    return _no_cache_response(FRONTEND_DIR / "style.css", "text/css")

@app.get("/data/local_sentences.json")
async def serve_local_sentences():
    data_file = Path(__file__).parent / "data" / "local_sentences.json"
    return JSONResponse(content=json.loads(data_file.read_text(encoding="utf-8")))

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
