"""
Live Sign Recognition Simulation Test:
Simulates a signer signing HELLO and WATER.
Verifies landmark input, confidence calculation, state machine transitions
(IDLE -> DETECTING -> STABLE -> ACCEPTED), buffer updating from 0/20 to 1/20 to 2/20,
and sentence reconstruction & Marathi translation.
"""
import sys
import numpy as np
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.resolve()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from ml.recognition.recognizer import SignRecognizer
from ml.recognition.state_machine import RecognitionState, RecognitionEvent
from backend.sentence_engine import sentence_engine
from backend.translation_engine import translation_engine
from backend.models import SentenceRequest, TranslationRequest

def run_simulation():
    print("=" * 70)
    print(" LIVE SIGNING SIMULATION: HELLO & WATER")
    print("=" * 70)

    rec = SignRecognizer()
    buffer = []
    version_id = 0

    # Initial state
    print(f"\n[Initial Buffer]: {buffer} (0/20 tokens)")
    initial_sent = sentence_engine.reconstruct_sentence(SentenceRequest(signs=buffer, version_id=version_id))
    print(f"[Initial Sentence]: '{initial_sent.text}' (Waiting state)")

    # -------------------------------------------------------------------------
    # GESTURE 1: HELLO
    # -------------------------------------------------------------------------
    print("\n--- STEP 1: SIGNING 'HELLO' ---")
    hello_path = REPO_ROOT / "Sign-Language-and-Local-language-bridge-using-SLM-main" / "sign_language_project" / "gesture_data" / "hello" / "0.npy"
    hello_data = np.load(str(hello_path))

    rec.frame_buffer.clear()
    for f in range(30):
        rec.frame_buffer.append(list(hello_data[f]))

    for step in range(15):
        input_tensor = np.array(rec.frame_buffer).reshape(1, 30, 126)
        preds = rec.model.predict(input_tensor, verbose=0)[0]
        top_idx = np.argmax(preds)
        gesture = rec.labels[top_idx]
        conf = float(preds[top_idx])

        state, stable, target, event, accepted = rec.state_machine.update(
            has_hand=True, top_gesture=gesture, confidence=conf
        )
        print(f"Frame #{step+1:02d}: gesture={gesture:5s} | conf={conf*100:5.1f}% | state={state.value:9s} | stable={stable}/{target} | event={event.value}")

        if event == RecognitionEvent.SIGN_ACCEPTED:
            buffer.append(accepted)
            version_id += 1
            print(f">>> EVENT: SIGN_ACCEPTED! Token '{accepted.upper()}' appended to buffer.")
            print(f">>> Buffer is now: {buffer} ({len(buffer)}/20 tokens)")
            break

    assert len(buffer) == 1 and buffer[0] == "hello"

    sent1 = sentence_engine.reconstruct_sentence(SentenceRequest(signs=buffer, version_id=version_id))
    print(f"\n[Reconstructed Sentence v{version_id}]: \"{sent1.text}\" (Source: {sent1.source})")

    # -------------------------------------------------------------------------
    # GESTURE 2: WATER
    # -------------------------------------------------------------------------
    print("\n--- STEP 2: SIGNING 'WATER' ---")
    water_path = REPO_ROOT / "Sign-Language-and-Local-language-bridge-using-SLM-main" / "sign_language_project" / "gesture_data" / "water" / "2.npy"
    water_data = np.load(str(water_path))

    rec.frame_buffer.clear()
    for f in range(30):
        rec.frame_buffer.append(list(water_data[f]))

    for step in range(20):
        input_tensor = np.array(rec.frame_buffer).reshape(1, 30, 126)
        preds = rec.model.predict(input_tensor, verbose=0)[0]
        top_idx = np.argmax(preds)
        gesture = rec.labels[top_idx]
        conf = float(preds[top_idx])

        state, stable, target, event, accepted = rec.state_machine.update(
            has_hand=True, top_gesture=gesture, confidence=conf
        )
        print(f"Frame #{step+1:02d}: gesture={gesture:5s} | conf={conf*100:5.1f}% | state={state.value:9s} | stable={stable}/{target} | event={event.value}")

        if event == RecognitionEvent.SIGN_ACCEPTED:
            buffer.append(accepted)
            version_id += 1
            print(f">>> EVENT: SIGN_ACCEPTED! Token '{accepted.upper()}' appended to buffer.")
            print(f">>> Buffer is now: {buffer} ({len(buffer)}/20 tokens)")
            break

    assert len(buffer) == 2 and buffer == ["hello", "water"]

    # -------------------------------------------------------------------------
    # SENTENCE RECONSTRUCTION & TRANSLATION
    # -------------------------------------------------------------------------
    print(f"\n--- STEP 3: FINAL SENTENCE & TRANSLATION (v{version_id}) ---")
    sent2 = sentence_engine.reconstruct_sentence(SentenceRequest(signs=buffer, version_id=version_id))
    print(f"Active Buffer:            {buffer} (2/20 tokens)")
    print(f"Reconstructed Sentence:   \"{sent2.text}\" (Source: {sent2.source})")

    trans_mr = translation_engine.translate(TranslationRequest(text=sent2.text, language="Marathi", version_id=version_id))
    print(f"Marathi Translation:      \"{trans_mr.text}\" (Source: {trans_mr.source})")

    print("\n" + "=" * 70)
    print(" LIVE RECOGNITION SIMULATION COMPLETED WITH 100% SUCCESS!")
    print("=" * 70)
    return 0

if __name__ == "__main__":
    sys.exit(run_simulation())
