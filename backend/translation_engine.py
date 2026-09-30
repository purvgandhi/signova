from __future__ import annotations

import os
import json
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any
from backend.models import TranslationRequest, TranslationResponse
from backend.wordpacks import get_all_wordpacks

DATA_FILE = Path(__file__).parent / "data" / "local_sentences.json"

_DATA_CACHE = None

def _load_data():
    global _DATA_CACHE
    if _DATA_CACHE is None:
        try:
            _DATA_CACHE = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            _DATA_CACHE = {}
    return _DATA_CACHE

def is_devanagari(text: str) -> bool:
    return any('\u0900' <= ch <= '\u097f' for ch in text)

def is_gujarati(text: str) -> bool:
    return any('\u0a80' <= ch <= '\u0aff' for ch in text)

def is_tamil(text: str) -> bool:
    return any('\u0b80' <= ch <= '\u0bff' for ch in text)

def is_telugu(text: str) -> bool:
    return any('\u0c00' <= ch <= '\u0c7f' for ch in text)

def validate_script(text: str, lang: str) -> bool:
    lang_lower = lang.lower()
    if lang_lower in ["marathi", "hindi"]:
        return is_devanagari(text)
    elif lang_lower == "gujarati":
        return is_gujarati(text)
    elif lang_lower == "tamil":
        return is_tamil(text)
    elif lang_lower == "telugu":
        return is_telugu(text)
    return True

# Section 17: Dedicated translation system prompt
TRANSLATION_SYSTEM_PROMPT = """You are a precise translation engine for an accessibility communication application.

Translate the provided English sentence into the requested target language.

Preserve the exact meaning.
Do not add information.
Do not remove meaningful information.
Do not reinterpret the sentence.
Do not explain.
Do not provide alternatives.
Return ONLY the translated sentence in the native script of the target language."""

# Offline common baseline for Gujarati, Tamil, Telugu
EXTRA_OFFLINE_TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "gujarati": {
        "hello": "નમસ્તે.",
        "yes": "હા.",
        "no": "ના.",
        "please": "મહેરબાની કરીને.",
        "thank you": "આભાર.",
        "water": "પાણી.",
        "food": "ખોરાક.",
        "i need help": "મને મદદની જરૂર છે.",
        "stop": "રોકો.",
        "good": "સારું.",
        "bad": "ખરાબ.",
        "where": "ક્યાં?",
        "what": "શું?",
        "i am in pain": "મને દુખાવો થઈ રહ્યો છે.",
        "please help me": "કૃપા કરીને મને મદદ કરો.",
        "i need help from a doctor": "મને ડૉક્ટરની મદદની જરૂર છે.",
        "i need help from a doctor because i am in pain": "મને ડૉક્ટરની મદદ જોઈએ છે કારણ કે મને દુખાવો થાય છે.",
        "i need water": "મને પાણી જોઈએ છે.",
        "i need food": "મને ખોરાક જોઈએ છે."
    },
    "tamil": {
        "hello": "வணக்கம்.",
        "yes": "ஆம்.",
        "no": "இல்லை.",
        "please": "தயவுசெய்து.",
        "thank you": "நன்றி.",
        "water": "தண்ணீர்.",
        "food": "உணவு.",
        "i need help": "எனக்கு உதவி தேவை.",
        "stop": "நிறுத்து.",
        "good": "நல்லது.",
        "bad": "மோசமானது.",
        "where": "எங்கே?",
        "what": "என்ன?",
        "i am in pain": "எனக்கு வலி இருக்கிறது.",
        "please help me": "தயவுசெய்து எனக்கு உதவுங்கள்.",
        "i need help from a doctor": "எனக்கு மருத்துவரிடம் இருந்து உதவி தேவை.",
        "i need help from a doctor because i am in pain": "எனக்கு வலி இருப்பதால் மருத்துவரிடம் உதவி தேவை.",
        "i need water": "எனக்கு தண்ணீர் வேண்டும்.",
        "i need food": "எனக்கு உணவு வேண்டும்."
    },
    "telugu": {
        "hello": "నమస్కారం.",
        "yes": "అవును.",
        "no": "కాదు.",
        "please": "దయచేసి.",
        "thank you": "ధన్యవాదాలు.",
        "water": "నీరు.",
        "food": "ఆహారం.",
        "i need help": "నాకు సహాయం కావాలి.",
        "stop": "ఆపండి.",
        "good": "మంచిది.",
        "bad": "చెడు.",
        "where": "ఎక్కడ?",
        "what": "ఏమిటి?",
        "i am in pain": "నాకు నొప్పిగా ఉంది.",
        "please help me": "దయచేసి నాకు సహాయం చేయండి.",
        "i need help from a doctor": "నాకు డాక్టర్ సహాయం కావాలి.",
        "i need help from a doctor because i am in pain": "నాకు నొప్పిగా ఉన్నందున డాక్టర్ సహాయం కావాలి.",
        "i need water": "నాకు నీరు కావాలి.",
        "i need food": "నాకు ఆహారం కావాలి."
    }
}

class TranslationEngine:
    def __init__(self):
        self.primary_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
        self.candidate_models = [self.primary_model, "gemini-2.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]
        self._client = None
        # Section 18: Translation cache (key: "sentence|language")
        self.translation_cache: Dict[str, str] = {}
        # Analytics metrics (Section 37 & 38)
        self.metrics = {
            "total_requests": 0,
            "cache_hits": 0,
            "local_dict_hits": 0,
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

    def translate(self, request: TranslationRequest) -> TranslationResponse:
        self.metrics["total_requests"] += 1
        start_time = time.time()
        text = request.text.strip()
        lang = request.language.strip()
        lang_lower = lang.lower()
        version_id = request.version_id

        if not text:
            return TranslationResponse(
                text="",
                language=lang,
                source="fallback",
                version_id=version_id,
                status="Empty input text",
                has_error=False
            )

        if lang_lower == "english":
            return TranslationResponse(
                text=text,
                language=lang,
                source="local_dict",
                version_id=version_id,
                status="English source selected",
                has_error=False
            )

        # 1. Section 18: Check runtime translation cache
        cache_key = f"{text.lower().rstrip('.?!')}|{lang_lower}"
        if cache_key in self.translation_cache:
            self.metrics["cache_hits"] += 1
            self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
            return TranslationResponse(
                text=self.translation_cache[cache_key],
                language=lang,
                source="cache",
                version_id=version_id,
                status="Loaded from translation cache",
                has_error=False
            )

        # 2. Check local dictionary in local_sentences.json (Hindi & Marathi)
        data = _load_data()
        translations = data.get("translations", {})
        lang_dict = translations.get(lang_lower, {})
        normalized_query = text.lower().rstrip(".?!")

        for k, v in lang_dict.items():
            if k.strip().lower().rstrip(".?!") == normalized_query:
                self.translation_cache[cache_key] = v
                self.metrics["local_dict_hits"] += 1
                self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
                return TranslationResponse(
                    text=v,
                    language=lang,
                    source="local_dict",
                    version_id=version_id,
                    status=f"Matched local {lang} dictionary",
                    has_error=False
                )

        # 3. Check extra offline translations (Gujarati, Tamil, Telugu)
        if lang_lower in EXTRA_OFFLINE_TRANSLATIONS:
            sub_dict = EXTRA_OFFLINE_TRANSLATIONS[lang_lower]
            for k, v in sub_dict.items():
                if k == normalized_query:
                    self.translation_cache[cache_key] = v
                    self.metrics["local_dict_hits"] += 1
                    self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
                    return TranslationResponse(
                        text=v,
                        language=lang,
                        source="local_dict",
                        version_id=version_id,
                        status=f"Matched local {lang} dictionary",
                        has_error=False
                    )

        # 4. Check custom wordpacks
        for wp in get_all_wordpacks():
            if wp.sentence.strip().lower().rstrip(".?!") == normalized_query:
                if lang_lower == "marathi" and wp.marathi:
                    self.translation_cache[cache_key] = wp.marathi
                    return TranslationResponse(
                        text=wp.marathi,
                        language=lang,
                        source="local_dict",
                        version_id=version_id,
                        status="Matched custom word pack translation",
                        has_error=False
                    )
                elif lang_lower == "hindi" and wp.hindi:
                    self.translation_cache[cache_key] = wp.hindi
                    return TranslationResponse(
                        text=wp.hindi,
                        language=lang,
                        source="local_dict",
                        version_id=version_id,
                        status="Matched custom word pack translation",
                        has_error=False
                    )

        # 5. Gemini API translation (Section 17)
        client = self._get_client()
        if client is None:
            # Explicit diagnostic when API key is missing
            return TranslationResponse(
                text=text,
                language=lang,
                source="fallback",
                version_id=version_id,
                status=f"AI offline: Local {lang} dictionary entry not found",
                has_error=True,
                error_reason="offline_no_api_key"
            )

        prompt = (
            f"English:\n{text}\n\n"
            f"Target language:\n{lang}\n\n"
            f"Return ONLY the translated sentence in the native script."
        )

        last_error = "unknown_error"
        for model_name in self.candidate_models:
            try:
                self.metrics["gemini_calls"] += 1
                from google.genai import types
                resp = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        system_instruction=TRANSLATION_SYSTEM_PROMPT
                    )
                )
                translated_text = (resp.text or "").strip()
                if translated_text:
                    # Clean any accidental quotes
                    translated_text = translated_text.strip('"\'')
                    # Validate script
                    if not validate_script(translated_text, lang):
                        last_error = "invalid_script"
                        continue

                    self.translation_cache[cache_key] = translated_text
                    self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
                    return TranslationResponse(
                        text=translated_text,
                        language=lang,
                        source="gemini",
                        version_id=version_id,
                        status=f"Translated with {model_name}",
                        has_error=False
                    )
            except Exception as e:
                self.metrics["gemini_errors"] += 1
                err_str = str(e).lower()
                if "404" in err_str:
                    last_error = "model_decommissioned_404"
                elif "429" in err_str or "quota" in err_str:
                    last_error = "rate_limit_exceeded_429"
                elif "503" in err_str or "unavailable" in err_str:
                    last_error = "upstream_service_503"
                else:
                    last_error = f"network_or_api_error: {str(e)[:40]}"

        # Fallback with detailed diagnostic
        self.metrics["last_latency_ms"] = round((time.time() - start_time) * 1000, 1)
        return TranslationResponse(
            text=text,
            language=lang,
            source="fallback",
            version_id=version_id,
            status=f"Translation fallback: {last_error}",
            has_error=True,
            error_reason=last_error
        )

translation_engine = TranslationEngine()
