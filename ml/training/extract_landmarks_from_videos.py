"""
High-Speed Sampled Video-to-Landmark Extraction Pipeline for Signova
Extracts 30 uniformly-spaced frames per video through MediaPipe to generate standardized (30, 126) .npy landmark files.
"""
from __future__ import annotations

import os
import re
import cv2
import zipfile
import tempfile
import numpy as np
import mediapipe as mp
from pathlib import Path
from typing import Dict, List, Tuple, Any

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
GESTURE_DATA_DIR = REPO_ROOT / "data" / "gesture_data"
CROPPED_DATA_DIR = GESTURE_DATA_DIR / "Cropped_Data"


def extract_landmarks_from_frame(result) -> List[float]:
    left_hand = [0.0] * 63
    right_hand = [0.0] * 63

    if result.multi_hand_landmarks and result.multi_handedness:
        for hand_landmarks, handedness in zip(result.multi_hand_landmarks, result.multi_handedness):
            label = handedness.classification[0].label
            landmarks = []
            for lm in hand_landmarks.landmark:
                landmarks.extend([lm.x, lm.y, lm.z])

            # Mirrored coordinate convention
            if label == "Left":
                right_hand = landmarks
            else:
                left_hand = landmarks

    return left_hand + right_hand


def extract_all_videos():
    if not CROPPED_DATA_DIR.exists():
        raise FileNotFoundError(f"Cropped_Data directory not found at {CROPPED_DATA_DIR}")

    zip_files = sorted([f for f in os.listdir(CROPPED_DATA_DIR) if f.endswith(".zip")])
    print(f"Found {len(zip_files)} zip archives in {CROPPED_DATA_DIR}")

    mp_hands = mp.solutions.hands.Hands(
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    temp_dir = tempfile.mkdtemp(prefix="signova_extract_")
    total_processed = 0

    for zip_name in zip_files:
        gesture_name = zip_name.replace("_Cropped.zip", "").lower()
        zip_path = CROPPED_DATA_DIR / zip_name
        target_gesture_dir = GESTURE_DATA_DIR / gesture_name
        target_gesture_dir.mkdir(parents=True, exist_ok=True)

        # Count existing original recordings (<30)
        existing_orig = [f for f in os.listdir(target_gesture_dir) if f.endswith(".npy") and int(re.sub(r"\D", "", f) or "999") < 30]
        # Clean any old >= 30 files
        for f in os.listdir(target_gesture_dir):
            if f.endswith(".npy"):
                num = int(re.sub(r"\D", "", f) or "0")
                if num >= 30:
                    try:
                        os.remove(str(target_gesture_dir / f))
                    except Exception:
                        pass

        # If existing original recordings exist, start at 30, otherwise start at 0
        start_idx = 30 if len(existing_orig) > 0 else 0

        print(f"\nProcessing '{gesture_name}' from {zip_name} (starting index {start_idx})...")
        vids_in_zip = 0

        with zipfile.ZipFile(zip_path, "r") as z:
            video_names = sorted([n for n in z.namelist() if n.lower().endswith((".avi", ".mp4", ".mov"))])
            for i, vname in enumerate(video_names):
                extracted_path = z.extract(vname, temp_dir)
                target_npy_path = target_gesture_dir / f"{start_idx + i}.npy"

                cap = cv2.VideoCapture(extracted_path)
                tot_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                if tot_frames < 10:
                    cap.release()
                    try:
                        os.remove(extracted_path)
                    except Exception:
                        pass
                    continue

                target_indices = set(np.linspace(0, tot_frames - 1, 30, dtype=int))
                frames_landmarks = []
                frame_idx = 0

                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        break
                    if frame_idx in target_indices:
                        frame = cv2.flip(frame, 1)
                        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        result = mp_hands.process(rgb_frame)
                        frames_landmarks.append(extract_landmarks_from_frame(result))
                    frame_idx += 1
                cap.release()

                try:
                    os.remove(extracted_path)
                except Exception:
                    pass

                # Pad or truncate to exactly 30 frames
                while len(frames_landmarks) < 30:
                    frames_landmarks.append(frames_landmarks[-1] if frames_landmarks else [0.0] * 126)
                frames_landmarks = frames_landmarks[:30]

                np_arr = np.array(frames_landmarks, dtype=np.float32)
                np.save(str(target_npy_path), np_arr)
                vids_in_zip += 1
                total_processed += 1

        total_folder = len([f for f in os.listdir(target_gesture_dir) if f.endswith(".npy")])
        print(f"  Processed {vids_in_zip} videos for '{gesture_name}'. Total files in folder: {total_folder}")

    mp_hands.close()
    print(f"\n=======================================================")
    print(f" ALL EXTRACTIONS COMPLETE: {total_processed} videos converted to .npy")
    print(f"=======================================================")


if __name__ == "__main__":
    extract_all_videos()
