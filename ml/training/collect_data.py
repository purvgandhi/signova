import cv2
import mediapipe as mp
import numpy as np
import os
import time

# ---- SETTINGS ----
GESTURES = [
    # Original 5
    'hello', 'yes', 'no', 'please', 'thankyou',
    # 15 new gestures
    'water', 'food', 'help', 'stop', 'good',
    'bad', 'more', 'where', 'what', 'name',
    'home', 'school', 'doctor', 'pain', 'happy'
]
RECORDINGS_PER_GESTURE = 30
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
DATA_FOLDER = str(REPO_ROOT / 'data' / 'gesture_data')

# ---- SETUP ----
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# max_num_hands changed to 2
hands = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Create folders
for gesture in GESTURES:
    os.makedirs(os.path.join(DATA_FOLDER, gesture), exist_ok=True)
    print(f"Created folder for: {gesture}")

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

def extract_landmarks(result):
    """
    Extract landmarks from up to 2 hands.
    
    Each hand gives 21 landmarks x 3 values = 63 numbers.
    Two hands = 126 numbers per frame.
    
    If only one hand is detected, the missing hand is filled with zeros.
    If no hands detected, returns all zeros.
    
    We also sort hands by x-position (left hand first, right hand second)
    so the model always sees them in the same order.
    """
    # Default: both hands are zeros (empty)
    left_hand  = [0.0] * 63
    right_hand = [0.0] * 63

    if result.multi_hand_landmarks and result.multi_handedness:
        for hand_landmarks, handedness in zip(
            result.multi_hand_landmarks,
            result.multi_handedness
        ):
            # MediaPipe labels hands as 'Left' or 'Right'
            # Note: these are mirrored because we flip the frame
            label = handedness.classification[0].label

            landmarks = []
            for lm in hand_landmarks.landmark:
                landmarks.extend([lm.x, lm.y, lm.z])

            if label == 'Left':
                right_hand = landmarks   # Mirrored — Left label = right hand on screen
            else:
                left_hand = landmarks    # Mirrored — Right label = left hand on screen

    # Always return both hands concatenated = 126 values
    return left_hand + right_hand


# ---- MAIN LOOP ----
for gesture in GESTURES:

    # Skip if already fully collected
    gesture_folder = os.path.join(DATA_FOLDER, gesture)
    if os.path.exists(gesture_folder):
        existing = len([f for f in os.listdir(gesture_folder) if f.endswith('.npy')])
        if existing >= RECORDINGS_PER_GESTURE:
            print(f"Skipping '{gesture}' — already have {existing} recordings")
            continue

    print(f"\n--- Get ready to perform: {gesture.upper()} ---")
    print("You have 3 seconds to get ready...")

    # Countdown
    for i in range(3, 0, -1):
        ret, frame = cap.read()
        frame = cv2.flip(frame, 1)
        cv2.putText(frame, f"Get ready for: {gesture}", (50, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        cv2.putText(frame, f"Starting in {i}...", (50, 180),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
        cv2.imshow("Collecting Data", frame)
        cv2.waitKey(1000)

    # Collect 30 recordings
    for recording_num in range(RECORDINGS_PER_GESTURE):
        frames_collected = []
        frame_count = 0

        while frame_count < FRAMES_PER_RECORDING:
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb_frame)

            # Draw skeleton for all detected hands
            if result.multi_hand_landmarks:
                for hand_landmarks in result.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(
                        frame,
                        hand_landmarks,
                        mp_hands.HAND_CONNECTIONS
                    )

                # Count how many hands detected
                num_hands = len(result.multi_hand_landmarks)
                hand_count_color = (0, 255, 0) if num_hands == 2 else (0, 165, 255)
                cv2.putText(frame, f"Hands detected: {num_hands}", (10, 160),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, hand_count_color, 2)

                # Save landmark data (always 126 values)
                landmark_data = extract_landmarks(result)
                frames_collected.append(landmark_data)
                frame_count += 1

                # Show progress
                cv2.putText(frame, f"Gesture: {gesture}", (10, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(frame, f"Recording: {recording_num+1}/{RECORDINGS_PER_GESTURE}", (10, 80),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)
                cv2.putText(frame, f"Frame: {frame_count}/{FRAMES_PER_RECORDING}", (10, 120),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

            else:
                cv2.putText(frame, "NO HAND DETECTED - Show your hand!", (50, 200),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

            cv2.imshow("Collecting Data", frame)
            cv2.waitKey(1)

        # Save recording
        if len(frames_collected) == FRAMES_PER_RECORDING:
            save_path = os.path.join(DATA_FOLDER, gesture, f"{recording_num}.npy")
            np.save(save_path, np.array(frames_collected))
            print(f"  Saved recording {recording_num+1}/{RECORDINGS_PER_GESTURE} for '{gesture}'")

        time.sleep(0.3)

    print(f"Done collecting data for: {gesture}")

cap.release()
cv2.destroyAllWindows()
print("\nALL DATA COLLECTED! You can now run train_lstm.py")