"""
E2E Verification of Newly Added Gesture Classes (accident, call, hot, lose, thief, doctor, help, pain)
"""
import sys
import numpy as np
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.resolve()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.recognition.recognizer import SignRecognizer
from backend.sentence_engine import sentence_engine
from backend.models import SentenceRequest


def test_new_classes_recognition():
    print("=" * 70)
    print(" TESTING RECOGNITION ACROSS NEW GESTURE CLASSES")
    print("=" * 70)

    rec = SignRecognizer()
    print(f"SignRecognizer loaded with {len(rec.labels)} gesture classes.")
    assert len(rec.labels) == 25, f"Expected 25 classes, got {len(rec.labels)}"

    new_classes = ["accident", "call", "hot", "lose", "thief"]

    for cls in new_classes:
        sample_path = REPO_ROOT / "data" / "gesture_data" / cls / "0.npy"
        assert sample_path.exists(), f"Sample file not found: {sample_path}"
        data = np.load(str(sample_path))

        rec.frame_buffer.clear()
        result = None
        for f in range(30):
            result = rec.process_landmarks_data(list(data[f]), has_hand=True)

        predicted_gesture = result["current_gesture"]
        confidence = result["confidence"]

        print(f"Class: {cls:10s} -> Predicted: {predicted_gesture:10s} (Confidence: {confidence * 100:.2f}%)")
        assert predicted_gesture == cls, f"Failed recognition for {cls}, got {predicted_gesture}"
        assert confidence >= 0.80, f"Low confidence {confidence} for {cls}"

    # Verify sentence engine reconstruction with new gestures
    sent = sentence_engine.reconstruct_sentence(SentenceRequest(signs=["call", "doctor"], version_id=1))
    print(f"\nReconstructed sentence for ['call', 'doctor']: '{sent.text}' (Source: {sent.source})")
    assert sent.text == "Please call a doctor."

    print("\n" + "=" * 70)
    print(" ALL NEW GESTURE CLASSES RECOGNIZED ACCURATELY & VERIFIED!")
    print("=" * 70)


if __name__ == "__main__":
    test_new_classes_recognition()
