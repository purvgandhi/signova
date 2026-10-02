from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from backend.models import SentenceRequest, SentenceResponse
from backend.wordpacks import find_custom_template

DATA_FILE = Path(__file__).parent / "data" / "local_sentences.json"

_DATA_CACHE = None

def _load_data():
    global _DATA_CACHE
    if _DATA_CACHE is None:
        try:
            _DATA_CACHE = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            _DATA_CACHE = {"vocabulary": [], "exact_sentences": {}}
    return _DATA_CACHE

def normalize_signs(signs: List[str]) -> List[str]:
    return [str(s).strip().lower() for s in signs if str(s).strip()]

# Section 12: Controlled deterministic sentence templates for common phrases
DETERMINISTIC_TEMPLATES: Dict[str, str] = {
    "help": "I need help.",
    "doctor": "I need a doctor.",
    "water": "I need water.",
    "food": "I need food.",
    "stop": "Please stop.",
    "yes": "Yes.",
    "no": "No.",
    "hello": "Hello.",
    "thankyou": "Thank you.",
    "pain": "I am in pain.",
    "happy": "I am happy.",
    "good": "Everything is good.",
    "bad": "This is bad.",
    "more": "I need more.",
    "where home": "Where is my home?",
    "what name": "What is your name?",
    "name what": "What is your name?",
    "please water": "Please give me some water.",
    "water please": "Water, please.",
    "please food": "Please give me some food.",
    "food please": "Please give me some food.",
    "please help": "Please help me.",
    "help please": "Please help me.",
    "help doctor": "I need help from a doctor.",
    "doctor help": "I need help from a doctor.",
    "doctor pain": "I need to see a doctor because I am in pain.",
    "pain doctor": "I need to see a doctor because I am in pain.",
    "help pain": "I need help because I am in pain.",
    "pain help": "I am in pain and need help.",
    "help doctor pain": "I need help from a doctor because I am in pain.",
    "doctor help pain": "I need help from a doctor because I am in pain.",
    "hello doctor": "Hello doctor.",
    "hello name": "Hello, my name is.",
    "where doctor": "Where is the doctor?",
    "where school": "Where is the school?",
    "where water": "Where can I find water?",
    "more water": "I need more water, please.",
    "more food": "I need more food, please.",
    "stop please": "Please stop.",
    "thankyou doctor": "Thank you, doctor."
}

def rule_based_fallback(signs: List[str]) -> str:
    if not signs:
        return ""
    display_map = {"thankyou": "thank you"}
    tokens = [display_map.get(s, s) for s in signs]
    s = " ".join(tokens)
    s = s[0].upper() + s[1:] if len(s) > 1 else s.upper()
    has_question = any(q in signs for q in ["where", "what", "how", "who", "when"])
    punctuation = "?" if has_question else "."
    if not s.endswith((".", "?", "!")):
        s += punctuation
    return s

# Section 9: Dedicated controlled system prompt for Gemini
GEMINI_SYSTEM_PROMPT = """You are the controlled natural-language reconstruction engine for a real-time Indian Sign Language assistive communication application.

The upstream computer-vision model has already recognized the signs. You must NOT reinterpret or hallucinate visual information.

Your task is to convert the recognized sign sequence into exactly ONE natural, grammatically correct English sentence.

Rules:
1. Preserve every meaningful recognized concept.
2. Add only grammatical helper words needed to create natural English.
3. Do not invent information.
4. Do not invent people.
5. Do not invent locations.
6. Do not invent diseases.
7. Do not invent symptoms.
8. Do not invent objects.
9. Do not invent events.
10. Do not invent emotions.
11. Do not invent urgency.
12. Do not invent intentions.
13. Do not diagnose medical conditions.
14. Do not answer questions unless the recognized signs form a question.
15. Do not provide explanations.
16. Do not provide multiple alternatives.
17. Do not use bullet points.
18. Do not return JSON unless explicitly required by the API layer.
19. Return exactly one concise English sentence.
20. Preserve the meaning of the recognized signs."""

class SentenceEngine:
    def __init__(self):
        self.primary_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.candidate_models = [self.primary_model, "gemini-3.5-flash-lite", "gemini-flash-latest"]
        self._client = None
        # Section 11: In-memory sentence cache
        self.sentence_cache: Dict[str, str] = {}
        # Analytics metrics (Section 37 & 38)
        self.metrics = {
            "total_requests": 0,
            "cache_hits": 0,
            "template_hits": 0,
            "gemini_calls": 0,
            "gemini_errors": 0,
            "last_latency_ms": 0.0
        }

    def _get_client(self):
        if self._client is not None:
            return self._client
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None
        try:
            from google import genai
            self._client = genai.Client(api_key=api_key)
            return self._client
        except Exception:
            return None

    def reconstruct_sentence(self, request: SentenceRequest) -> SentenceResponse:
        self.metrics["total_requests"] += 1
        start_time = time.time()
        signs = normalize_signs(request.signs)
        version_id = request.version_id

        if not signs:
            return SentenceResponse(
                text="",
                source="fallback",
                version_id=version_id,
                status="No signs in buffer",
                is_fallback=False
            )

        key = " ".join(signs)
        cache_key = "|".join(signs)

        # 1. Check local runtime cache (Section 11)
        if cache_key in self.sentence_cache:
            self.metrics["cache_hits"] += 1
            self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
            return SentenceResponse(
                text=self.sentence_cache[cache_key],
                source="cache",
                version_id=version_id,
                status="Loaded from sentence cache",
                is_fallback=False
            )

        # 2. Check deterministic high-frequency templates (Section 12)
        if key in DETERMINISTIC_TEMPLATES:
            sentence = DETERMINISTIC_TEMPLATES[key]
            self.sentence_cache[cache_key] = sentence
            self.metrics["template_hits"] += 1
            self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
            return SentenceResponse(
                text=sentence,
                source="exact",
                version_id=version_id,
                status="Matched controlled template",
                is_fallback=False
            )

        # 3. Check 100 controlled examples from local_sentences.json
        data = _load_data()
        exact_map = data.get("exact_sentences", {})
        if key in exact_map:
            sentence = exact_map[key]
            self.sentence_cache[cache_key] = sentence
            self.metrics["template_hits"] += 1
            self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
            return SentenceResponse(
                text=sentence,
                source="exact",
                version_id=version_id,
                status="Matched controlled example",
                is_fallback=False
            )

        # 4. Check custom local word pack template
        custom = find_custom_template(signs)
        if custom is not None:
            self.sentence_cache[cache_key] = custom.sentence
            self.metrics["template_hits"] += 1
            self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
            return SentenceResponse(
                text=custom.sentence,
                source="template",
                version_id=version_id,
                status="Matched custom word pack",
                is_fallback=False
            )

        # 5. Gemini SLM reconstruction with controlled prompt (Section 9)
        client = self._get_client()
        if client is not None:
            sign_seq_str = " + ".join([s.upper() for s in signs])
            user_content = (
                f"Recognized signs:\n{sign_seq_str}\n\n"
                f"Previous sentence:\nNone\n\n"
                f"Conversation context:\nNone\n\n"
                f"Return ONLY the reconstructed English sentence."
            )

            for model_name in self.candidate_models:
                try:
                    self.metrics["gemini_calls"] += 1
                    from google.genai import types
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=user_content,
                        config=types.GenerateContentConfig(
                            temperature=0.1,
                            system_instruction=GEMINI_SYSTEM_PROMPT
                        )
                    )
                    text = (resp.text or "").strip()
                    if text:
                        text = text.strip('"\'')
                        self.sentence_cache[cache_key] = text
                        self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
                        return SentenceResponse(
                            text=text,
                            source="gemini",
                            version_id=version_id,
                            status=f"Reconstructed with {model_name}",
                            is_fallback=False
                        )
                except Exception as e:
                    self.metrics["gemini_errors"] += 1
                    continue

        # 6. Deterministic grammar fallback
        fallback_text = rule_based_fallback(signs)
        self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
        return SentenceResponse(
            text=fallback_text,
            source="fallback",
            version_id=version_id,
            status="Offline deterministic fallback",
            is_fallback=True
        )

sentence_engine = SentenceEngine()
