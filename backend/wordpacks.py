from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Dict
from backend.models import WordPackItem

DATA_FILE = Path(__file__).parent / "data" / "custom_wordpacks.json"

DEFAULT_WORDPACKS: List[Dict[str, str]] = [
    {
        "signs_key": "pain doctor help",
        "sentence": "I am in severe pain and need a doctor immediately.",
        "marathi": "मला तीव्र वेदना होत आहेत आणि ताबडतोब डॉक्टरांची गरज आहे.",
        "hindi": "मुझे बहुत तेज दर्द हो रहा है और तुरंत डॉक्टर की जरूरत है।"
    },
    {
        "signs_key": "water please more",
        "sentence": "Could you please give me some more drinking water?",
        "marathi": "कृपया मला आणखी पिण्याचे पाणी द्याल का?",
        "hindi": "क्या आप मुझे थोड़ा और पीने का पानी दे सकते हैं?"
    },
    {
        "signs_key": "school please help",
        "sentence": "Please help me with my school studies.",
        "marathi": "कृपया मला माझ्या शाळेच्या अभ्यासात मदत करा.",
        "hindi": "कृपया मेरी स्कूल की पढ़ाई में मदद करें।"
    },
    {
        "signs_key": "hello name happy",
        "sentence": "Hello, my name is a pleasure to share and I am very happy to meet you.",
        "marathi": "नमस्कार, माझे नाव सांगताना आनंद होत आहे आणि मला भेटून खूप आनंद झाला.",
        "hindi": "नमस्ते, अपना नाम बताते हुए खुशी हो रही है और आपसे मिलकर बहुत खुशी हुई।"
    }
]

def _ensure_file():
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps(DEFAULT_WORDPACKS, indent=2, ensure_ascii=False), encoding="utf-8")

def get_all_wordpacks() -> List[WordPackItem]:
    _ensure_file()
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return [WordPackItem(**item) for item in data]
    except Exception:
        return [WordPackItem(**item) for item in DEFAULT_WORDPACKS]

def save_wordpack(item: WordPackItem) -> WordPackItem:
    _ensure_file()
    items = get_all_wordpacks()
    # Normalize key
    key = " ".join(item.signs_key.strip().lower().split())
    item.signs_key = key
    updated = False
    for i, existing in enumerate(items):
        if existing.signs_key == key:
            items[i] = item
            updated = True
            break
    if not updated:
        items.append(item)
    DATA_FILE.write_text(json.dumps([i.model_dump() for i in items], indent=2, ensure_ascii=False), encoding="utf-8")
    return item

def delete_wordpack(signs_key: str) -> bool:
    _ensure_file()
    key = " ".join(signs_key.strip().lower().split())
    items = get_all_wordpacks()
    filtered = [i for i in items if i.signs_key != key]
    if len(filtered) == len(items):
        return False
    DATA_FILE.write_text(json.dumps([i.model_dump() for i in filtered], indent=2, ensure_ascii=False), encoding="utf-8")
    return True

def find_custom_template(signs: List[str]) -> Optional[WordPackItem]:
    key = " ".join(s.strip().lower() for s in signs)
    for item in get_all_wordpacks():
        if item.signs_key == key:
            return item
    return None
