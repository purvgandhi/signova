from __future__ import annotations

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SentenceRequest(BaseModel):
    signs: List[str] = Field(default_factory=list, description="Array of sign tokens in buffer")
    version_id: int = Field(default=0, description="Atomic monotonic sequence version ID")


class SentenceResponse(BaseModel):
    text: str
    source: str  # "exact", "template", "gemini", or "fallback"
    version_id: int
    status: str
    is_fallback: bool = False


class TranslationRequest(BaseModel):
    text: str
    language: str  # "Hindi", "Marathi", etc.
    version_id: int = 0


class TranslationResponse(BaseModel):
    text: str
    language: str
    source: str  # "local_dict", "gemini", or "fallback"
    version_id: int
    status: str
    has_error: bool = False
    error_reason: Optional[str] = None


class WordPackItem(BaseModel):
    signs_key: str  # Space-separated signs, e.g., "water please"
    sentence: str
    marathi: Optional[str] = None
    hindi: Optional[str] = None


class CalibrationProfile(BaseModel):
    id: str
    name: str
    hold_threshold_frames: int = 8
    min_confidence: float = 0.70
    hand_preference: str = "both"  # "left", "right", or "both"
    handedness_swap: bool = True
    auto_speak_sentence: bool = False
    voice_shortcuts_enabled: bool = False


class HealthResponse(BaseModel):
    status: str
    backend_online: bool
    gemini_configured: bool
    active_model: str
    camera_active: bool
    fps: float
    troubleshooting_tip: str
