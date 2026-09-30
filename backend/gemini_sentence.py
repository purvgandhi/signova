"""
Gemini sentence-formation layer.

Takes the words already produced by the existing sign recognizer and asks Gemini for ONE
natural sentence. It never touches recognition: it only reads the recognized word list.
The API key is read from the server environment (GEMINI_API_KEY, loaded from .env by
backend/app.py) and is never sent to the browser.
"""
from __future__ import annotations

import os
import re
import time
from collections import OrderedDict
from typing import List, Optional

from pydantic import BaseModel, Field

SYSTEM_INSTRUCTION = (
    "You are the sentence-formation layer of a real-time sign-language recognition system. "
    "The input contains words detected by the existing sign recognizer and may contain incorrect "
    "ordering, repetition, or incomplete grammar. Convert them into ONE natural, grammatically "
    "correct sentence while preserving the exact meaning of the detected words. Correct grammar, "
    "ordering, and obvious repetition, but NEVER invent information, words, or meaning that are "
    "not supported by the input. If the input is unclear or insufficient, remain conservative. "
    "Return ONLY the final sentence."
)

REQUEST_TIMEOUT_MS = 10000   # the Gemini API rejects deadlines under 10 s
MAX_WORDS = 20
CACHE_SIZE = 256


class GeminiSentenceRequest(BaseModel):
    words: List[str] = Field(default_factory=list, description="Recognized words, in order")
    request_id: int = Field(default=0, description="Client counter used to discard stale replies")


class GeminiSentenceResponse(BaseModel):
    sentence: str
    available: bool
    source: str  # "gemini", "cache", "empty" or "unavailable"
    model: Optional[str] = None
    latency_ms: float = 0.0
    request_id: int = 0
    detail: Optional[str] = None


def _clean_words(words: List[str]) -> List[str]:
    """Trim, drop empties and collapse consecutive repeats caused by repeated predictions."""
    out: List[str] = []
    for w in words[:MAX_WORDS * 2]:
        w = re.sub(r"\s+", " ", str(w)).strip()
        if not w:
            continue
        if out and out[-1].lower() == w.lower():
            continue
        out.append(w)
    return out[:MAX_WORDS]


class GeminiSentenceFormer:
    def __init__(self):
        self._client = None
        self._cache: "OrderedDict[str, str]" = OrderedDict()
        self.metrics = {"requests": 0, "gemini_calls": 0, "cache_hits": 0, "errors": 0}
        self._cooldown: dict = {}   # model -> time until which it is skipped (quota / not found)

    def _models(self) -> List[str]:
        primary = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
        models = [primary, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]
        now = time.time()
        return [m for m in dict.fromkeys(models) if self._cooldown.get(m, 0) <= now]

    def _get_client(self):
        if self._client is not None:
            return self._client
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None
        try:
            from google import genai
            from google.genai import types
            self._client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
            )
        except Exception:
            self._client = None
        return self._client

    @staticmethod
    def _tidy(text: str) -> str:
        text = (text or "").strip()
        text = text.splitlines()[0].strip() if text else ""
        return text.strip('"“”\'` ').strip()

    def generate(self, request: GeminiSentenceRequest) -> GeminiSentenceResponse:
        self.metrics["requests"] += 1
        start = time.time()
        words = _clean_words(request.words)
        if not words:
            return GeminiSentenceResponse(sentence="", available=True, source="empty", request_id=request.request_id)

        key = " ".join(w.lower() for w in words)
        if key in self._cache:
            self._cache.move_to_end(key)
            self.metrics["cache_hits"] += 1
            return GeminiSentenceResponse(
                sentence=self._cache[key], available=True, source="cache",
                latency_ms=round((time.time() - start) * 1000, 1), request_id=request.request_id,
            )

        client = self._get_client()
        if client is None:
            return GeminiSentenceResponse(
                sentence="", available=False, source="unavailable", request_id=request.request_id,
                detail="GEMINI_API_KEY is not configured on the server",
            )

        from google.genai import types
        prompt = "Detected words, in the order they were signed:\n" + " ".join(w.upper() for w in words)
        last_error = None
        for model in self._models():
            try:
                self.metrics["gemini_calls"] += 1
                resp = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.2, system_instruction=SYSTEM_INSTRUCTION),
                )
                sentence = self._tidy(resp.text)
                if sentence:
                    self._cache[key] = sentence
                    if len(self._cache) > CACHE_SIZE:
                        self._cache.popitem(last=False)
                    return GeminiSentenceResponse(
                        sentence=sentence, available=True, source="gemini", model=model,
                        latency_ms=round((time.time() - start) * 1000, 1), request_id=request.request_id,
                    )
            except Exception as e:  # try the next model, then give up quietly
                self.metrics["errors"] += 1
                code = getattr(e, "code", None)
                last_error = f"{type(e).__name__} {code}" if code else type(e).__name__
                if code in (404, 429):   # out of quota or retired: skip this model for a while
                    self._cooldown[model] = time.time() + (600 if code == 404 else 60)
                continue

        return GeminiSentenceResponse(
            sentence="", available=False, source="unavailable",
            latency_ms=round((time.time() - start) * 1000, 1), request_id=request.request_id,
            detail=f"Gemini request failed ({last_error or 'empty response'})",
        )


gemini_sentence_former = GeminiSentenceFormer()
