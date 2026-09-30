from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Dict
from backend.models import CalibrationProfile

DATA_FILE = Path(__file__).parent / "data" / "profiles.json"

DEFAULT_PROFILES: List[Dict[str, object]] = [
    {
        "id": "standard",
        "name": "Standard Signer (Default)",
        "hold_threshold_frames": 8,
        "min_confidence": 0.70,
        "hand_preference": "both",
        "handedness_swap": True,
        "auto_speak_sentence": False,
        "voice_shortcuts_enabled": False
    },
    {
        "id": "expert",
        "name": "Expert / Fast Signer",
        "hold_threshold_frames": 4,
        "min_confidence": 0.65,
        "hand_preference": "both",
        "handedness_swap": True,
        "auto_speak_sentence": False,
        "voice_shortcuts_enabled": False
    },
    {
        "id": "tremor",
        "name": "Tremor & Stability Assist",
        "hold_threshold_frames": 14,
        "min_confidence": 0.78,
        "hand_preference": "both",
        "handedness_swap": True,
        "auto_speak_sentence": True,
        "voice_shortcuts_enabled": False
    },
    {
        "id": "left_dominant",
        "name": "Left-Handed Dominant",
        "hold_threshold_frames": 8,
        "min_confidence": 0.70,
        "hand_preference": "left",
        "handedness_swap": False,
        "auto_speak_sentence": False,
        "voice_shortcuts_enabled": False
    }
]

ACTIVE_PROFILE_FILE = Path(__file__).parent / "data" / "active_profile.txt"

def _ensure_file():
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(DEFAULT_PROFILES, indent=2), encoding="utf-8")
    if not ACTIVE_PROFILE_FILE.exists():
        ACTIVE_PROFILE_FILE.write_text("standard", encoding="utf-8")

def get_all_profiles() -> List[CalibrationProfile]:
    _ensure_file()
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return [CalibrationProfile(**p) for p in data]
    except Exception:
        return [CalibrationProfile(**p) for p in DEFAULT_PROFILES]

def get_active_profile_id() -> str:
    _ensure_file()
    try:
        val = ACTIVE_PROFILE_FILE.read_text(encoding="utf-8").strip()
        return val or "standard"
    except Exception:
        return "standard"

def set_active_profile_id(profile_id: str) -> str:
    _ensure_file()
    ACTIVE_PROFILE_FILE.write_text(profile_id, encoding="utf-8")
    return profile_id

def save_profile(profile: CalibrationProfile) -> CalibrationProfile:
    _ensure_file()
    profiles = get_all_profiles()
    updated = False
    for i, p in enumerate(profiles):
        if p.id == profile.id:
            profiles[i] = profile
            updated = True
            break
    if not updated:
        profiles.append(profile)
    DATA_FILE.write_text(json.dumps([p.model_dump() for p in profiles], indent=2), encoding="utf-8")
    return profile
