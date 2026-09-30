"""Controlled sentence reconstruction for the existing gesture vocabulary.

This module is deliberately independent from MediaPipe and the LSTM.  It only
receives labels which the existing model has already recognized.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable

try:
    from dotenv import load_dotenv
except ImportError:  # .env support is optional, not a runtime requirement.
    load_dotenv = None


GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# The vocabulary saved with lstm_gesture_model.keras.  Do not add labels here
# without retraining the model and updating its saved label file.
TRAINED_LABELS = frozenset({
    "hello", "yes", "no", "please", "thankyou", "water", "food", "help",
    "stop", "good", "bad", "more", "where", "what", "name", "home",
    "school", "doctor", "pain", "happy",
})

# Exactly 100 controlled examples.  Every input token is a trained LSTM label.
EXAMPLES = [
    ("hello", "Hello."), ("yes", "Yes."), ("no", "No."),
    ("please", "Please."), ("thankyou", "Thank you."),
    ("water", "Water."), ("food", "Food."), ("help", "I need help."),
    ("stop", "Stop."), ("good", "Good."), ("bad", "Bad."),
    ("more", "More."), ("where", "Where?"), ("what", "What?"),
    ("name", "My name."), ("home", "Home."), ("school", "School."),
    ("doctor", "Doctor."), ("pain", "I am in pain."), ("happy", "I am happy."),
    ("please help", "Please help me."),
    ("help please", "Please help me."),
    ("help doctor", "I need help from a doctor."),
    ("doctor help", "I need help from a doctor."),
    ("help pain", "I need help because I am in pain."),
    ("pain help", "I am in pain and need help."),
    ("doctor pain", "I am in pain and need a doctor."),
    ("pain doctor", "I am in pain and need a doctor."),
    ("water please", "Water, please."), ("please water", "Water, please."),
    ("food please", "Food, please."), ("please food", "Food, please."),
    ("more water", "More water."), ("water more", "More water."),
    ("more food", "More food."), ("food more", "More food."),
    ("good water", "The water is good."), ("bad water", "The water is bad."),
    ("good food", "The food is good."), ("bad food", "The food is bad."),
    ("stop please", "Please stop."), ("please stop", "Please stop."),
    ("where home", "Where is home?"), ("where school", "Where is the school?"),
    ("where doctor", "Where is the doctor?"),
    ("what name", "What is your name?"), ("name what", "What is your name?"),
    ("hello name", "Hello. My name."), ("happy good", "I am happy and good."),
    ("happy home", "I am happy at home."), ("happy school", "I am happy at school."),
    ("no water", "No water."), ("no food", "No food."),
    ("yes please", "Yes, please."), ("yes water", "Yes, water."),
    ("yes food", "Yes, food."), ("no more", "No more."),
    ("yes more", "Yes, more."), ("thankyou doctor", "Thank you, doctor."),
    ("thankyou help", "Thank you for the help."),
    ("thankyou water", "Thank you for the water."),
    ("thankyou food", "Thank you for the food."),
    ("help home", "I need help at home."), ("help school", "I need help at school."),
    ("help stop", "Help me stop."), ("stop help", "Stop and help me."),
    ("doctor home", "Doctor at home."), ("doctor school", "Doctor at school."),
    ("pain bad", "The pain is bad."), ("pain more", "I have more pain."),
    ("bad pain", "The pain is bad."), ("good happy", "I am good and happy."),
    ("good help", "The help is good."), ("bad help", "The help is bad."),
    ("more help", "I need more help."), ("more doctor", "More doctor."),
    ("more pain", "I have more pain."), ("where water", "Where is the water?"),
    ("where food", "Where is the food?"), ("what doctor", "What doctor?"),
    ("what food", "What food?"), ("what water", "What water?"),
    ("what school", "What school?"), ("what home", "What home?"),
    ("what help", "What help?"), ("hello happy", "Hello, I am happy."),
    ("hello please", "Hello, please."), ("please thankyou", "Please, thank you."),
    ("yes good", "Yes, good."), ("no bad", "No, bad."),
    ("water food", "Water and food."), ("food water", "Food and water."),
    ("help doctor pain", "I need help from a doctor because I am in pain."),
    ("please help doctor", "Please help me, doctor."),
    ("doctor please", "Doctor, please."),
    ("pain doctor help", "I am in pain and need help from a doctor."),
    ("where school home", "Where are the school and home?"),
    ("more water please", "More water, please."),
    ("more food please", "More food, please."), ("hello thankyou", "Hello, thank you."),
]

if len(EXAMPLES) != 100:
    raise RuntimeError("EXAMPLES must contain exactly 100 controlled examples.")

EXACT_SENTENCES = dict(EXAMPLES)

SYSTEM_INSTRUCTION = """You are the controlled language reconstruction component of a
sign-language communication system. The upstream gesture-recognition model has
already identified the signs. Convert the recognized labels into exactly one
short, natural grammatical English sentence. Preserve every recognized concept.
Do not reinterpret gestures or invent facts, symptoms, locations, people,
emotions, urgency, or intentions. Only add grammatical words necessary for
natural English. Do not explain. Return only the final sentence."""


@dataclass(frozen=True)
class SentenceResult:
    text: str
    source: str  # "exact", "gemini", or "fallback"
    status: str


def normalize_signs(words: Iterable[str]) -> tuple[str, ...]:
    """Normalize spelling/case while rejecting labels outside the trained model."""
    normalized = tuple(str(word).strip().lower() for word in words if str(word).strip())
    invalid = set(normalized) - TRAINED_LABELS
    if invalid:
        raise ValueError("Unrecognized gesture labels: " + ", ".join(sorted(invalid)))
    return normalized


def _safe_fallback(signs: tuple[str, ...]) -> str:
    display = {"thankyou": "thank you"}
    words = [display.get(sign, sign) for sign in signs]
    return " ".join(words).capitalize() + "."


class SentenceAI:
    """Reusable Gemini client with deterministic local matching first."""

    def __init__(self, model_name: str | None = None) -> None:
        if load_dotenv:
            load_dotenv()
        self.model_name = model_name or os.getenv("GEMINI_MODEL", GEMINI_MODEL)
        self._client = None

    def _client_or_none(self):
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

    def make_sentence_result(self, words: Iterable[str]) -> SentenceResult:
        signs = normalize_signs(words)
        if not signs:
            return SentenceResult("", "fallback", "No recognized signs to convert.")
        key = " ".join(signs)
        if key in EXACT_SENTENCES:
            return SentenceResult(EXACT_SENTENCES[key], "exact", "Matched a controlled example.")

        client = self._client_or_none()
        if client is None:
            return SentenceResult(_safe_fallback(signs), "fallback", "AI unavailable — showing recognized signs.")
        examples = "\n".join(f"{source.upper()} -> {target}" for source, target in EXAMPLES)
        prompt = f"Controlled examples:\n{examples}\n\nCURRENT RECOGNIZED SIGNS:\n{key.upper()}\n\nReturn exactly one natural English sentence. Do not explain."
        try:
            from google.genai import types
            response = client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION, temperature=0.1,
                ),
            )
            text = (response.text or "").strip()
            if not text:
                raise ValueError("Empty Gemini response")
            return SentenceResult(text, "gemini", "Generated with Gemini.")
        except Exception:
            return SentenceResult(_safe_fallback(signs), "fallback", "AI unavailable — showing recognized signs.")

    def make_sentence(self, words: Iterable[str]) -> str:
        return self.make_sentence_result(words).text

    def translate_sentence(self, sentence: str, target_language: str) -> SentenceResult:
        if not sentence.strip() or target_language.lower() == "english":
            return SentenceResult(sentence, "exact", "English selected.")
        supported = {"marathi", "hindi", "gujarati", "tamil", "telugu", "english"}
        if target_language.lower() not in supported:
            raise ValueError("Unsupported target language")
        client = self._client_or_none()
        if client is None:
            return SentenceResult(sentence, "fallback", "AI temporarily unavailable — translation not available.")
        try:
            from google.genai import types
            response = client.models.generate_content(
                model=self.model_name,
                contents=(f"Translate this final English sentence into {target_language}. "
                          f"Return only the translation:\n{sentence}"),
                config=types.GenerateContentConfig(temperature=0.1),
            )
            translated = (response.text or "").strip()
            if not translated:
                raise ValueError("Empty Gemini response")
            return SentenceResult(translated, "gemini", f"Translated to {target_language}.")
        except Exception:
            return SentenceResult(sentence, "fallback", "AI temporarily unavailable — translation not available.")


_default_ai = SentenceAI()


def make_sentence(words: Iterable[str]) -> str:
    """Convenience API for callers that only need the sentence text."""
    return _default_ai.make_sentence(words)


def translate_sentence(sentence: str, target_language: str) -> str:
    """Convenience API for callers that only need the translation text."""
    return _default_ai.translate_sentence(sentence, target_language).text
