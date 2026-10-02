"""
Signova Real-Time Recognition Engine
- Integrates MediaPipe hand detection with BiLSTM deep temporal model
- Invariant coordinate normalization matching training pipeline exactly
- State machine with sliding window consensus and duplicate suppression
"""
from __future__ import annotations

import os
import time
import pickle
from pathlib import Path
from collections import deque
from typing import Optional, List, Dict, Any, Tuple

import cv2
import numpy as np
import yaml
import mediapipe as mp
from tensorflow.keras.models import load_model

from ml.recognition.state_machine import RecognitionStateMachine, RecognitionState, RecognitionEvent
from ml.recognition.normalization import normalize_landmarks_frame, normalize_landmarks_sequence

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
CONFIG_FILE = REPO_ROOT / "config" / "recognition.yaml"

class SignRecognizer:
    def __init__(self, config_path: Optional[Path] = None):
        cfg_path = config_path or CONFIG_FILE
        if cfg_path.exists():
            with open(cfg_path, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f).get("recognition", {})
        else:
            self.config = {
                "model_path": "models/lstm_gesture_model.keras",
                "labels_path": "models/lstm_gesture_labels.pkl",
                "buffer_size": 30,
                "target_stable_frames": 7,
                "accept_threshold": 0.65,
                "reject_threshold": 0.45,
                "cooldown_frames": 6
            }

        # Resolve model and labels path
        model_path = REPO_ROOT / self.config.get("model_path", "models/lstm_gesture_model.keras")
        labels_path = REPO_ROOT / self.config.get("labels_path", "models/lstm_gesture_labels.pkl")

        print(f"[SignRecognizer] Loading LSTM model from {model_path}...")
        self.model = load_model(str(model_path))

        with open(labels_path, "rb") as f:
            self.labels = pickle.load(f)
        print(f"[SignRecognizer] Loaded {len(self.labels)} gesture labels: {self.labels}")

        self.buffer_size = self.config.get("buffer_size", 30)
        self.frame_buffer = deque(maxlen=self.buffer_size)

        # MediaPipe Hands (server-side fallback)
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        # State Machine
        self.state_machine = RecognitionStateMachine(
            target_stable_frames=self.config.get("target_stable_frames", 7),
            accept_threshold=self.config.get("accept_threshold", 0.65),
            reject_threshold=self.config.get("reject_threshold", 0.45),
            cooldown_frames=self.config.get("cooldown_frames", 6),
            repeat_gesture_window_ms=self.config.get("repeat_gesture_window_ms", 1200)
        )

        self.packet_counter = 0

    def extract_landmarks(self, result) -> List[float]:
        """
        Extracts 126 raw features (63 left hand + 63 right hand) from MediaPipe result.
        """
        left_hand = [0.0] * 63
        right_hand = [0.0] * 63

        if result.multi_hand_landmarks and result.multi_handedness:
            for hand_landmarks, handedness in zip(result.multi_hand_landmarks, result.multi_handedness):
                points = []
                for lm in hand_landmarks.landmark:
                    points.extend([lm.x, lm.y, lm.z])
                # Camera frame mirrored perspective
                if handedness.classification[0].label == "Left":
                    right_hand = points
                else:
                    left_hand = points

        return left_hand + right_hand

    def process_landmarks_data(self, features: List[float], has_hand: bool, raw_landmarks: list = None) -> Dict[str, Any]:
        """
        Processes pre-extracted 126-float landmark vector from client-side MediaPipe.
        Applies invariant landmark normalization before temporal buffering and model inference.
        """
        self.packet_counter += 1

        if has_hand and features and len(features) == 126:
            # Normalize frame landmarks to ensure exact parity with training
            norm_frame = normalize_landmarks_frame(features)
            self.frame_buffer.append(norm_frame)
        else:
            if len(self.frame_buffer) > 0:
                self.frame_buffer.clear()

        top_predictions = []
        top_gesture = "none"
        confidence = 0.0

        if len(self.frame_buffer) > 0 and has_hand:
            frames = list(self.frame_buffer)
            # Immediate inference by repeating initial frame if buffer is filling
            if len(frames) < self.buffer_size:
                frames = [frames[0]] * (self.buffer_size - len(frames)) + frames

            input_tensor = np.array(frames, dtype=np.float32).reshape(1, self.buffer_size, 126)
            preds = self.model.predict(input_tensor, verbose=0)[0]

            top_indices = np.argsort(preds)[::-1][:3]
            for idx in top_indices:
                top_predictions.append({
                    "gesture": self.labels[idx],
                    "confidence": round(float(preds[idx]), 4)
                })

            top_gesture = top_predictions[0]["gesture"]
            confidence = top_predictions[0]["confidence"]

        state, stable_frames, target_stable, event, accepted_sign = self.state_machine.update(
            has_hand=has_hand,
            top_gesture=top_gesture,
            confidence=confidence
        )

        return {
            "packet_id": self.packet_counter,
            "has_hand": has_hand,
            "landmarks": raw_landmarks or [],
            "top_predictions": top_predictions,
            "current_gesture": top_gesture,
            "confidence": round(confidence, 4),
            "state": state.value,
            "stable_frames": stable_frames,
            "target_stable_frames": target_stable,
            "event": event.value,
            "accepted_sign": accepted_sign,
            "buffer_fill": len(self.frame_buffer)
        }

    def process_frame_data(self, bgr_frame: np.ndarray) -> Dict[str, Any]:
        """
        Processes a raw BGR frame from webcam via server-side MediaPipe.
        """
        self.packet_counter += 1
        rgb_frame = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        result = self.hands.process(rgb_frame)

        has_hand = bool(result.multi_hand_landmarks)
        raw_landmarks = []

        if has_hand:
            for hand_lms, handedness in zip(result.multi_hand_landmarks, result.multi_handedness):
                hand_type = handedness.classification[0].label
                lms = [{"x": round(lm.x, 4), "y": round(lm.y, 4), "z": round(lm.z, 4)} for lm in hand_lms.landmark]
                raw_landmarks.append({
                    "hand": hand_type,
                    "score": round(handedness.classification[0].score, 3),
                    "landmarks": lms
                })

            raw_features = self.extract_landmarks(result)
            norm_features = normalize_landmarks_frame(raw_features)
            self.frame_buffer.append(norm_features)
        else:
            if len(self.frame_buffer) > 0:
                self.frame_buffer.clear()

        top_predictions = []
        top_gesture = "none"
        confidence = 0.0

        if len(self.frame_buffer) > 0 and has_hand:
            frames = list(self.frame_buffer)
            if len(frames) < self.buffer_size:
                frames = [frames[0]] * (self.buffer_size - len(frames)) + frames

            input_tensor = np.array(frames, dtype=np.float32).reshape(1, self.buffer_size, 126)
            preds = self.model.predict(input_tensor, verbose=0)[0]

            top_indices = np.argsort(preds)[::-1][:3]
            for idx in top_indices:
                top_predictions.append({
                    "gesture": self.labels[idx],
                    "confidence": round(float(preds[idx]), 4)
                })

            top_gesture = top_predictions[0]["gesture"]
            confidence = top_predictions[0]["confidence"]

        state, stable_frames, target_stable, event, accepted_sign = self.state_machine.update(
            has_hand=has_hand,
            top_gesture=top_gesture,
            confidence=confidence
        )

        return {
            "packet_id": self.packet_counter,
            "has_hand": has_hand,
            "landmarks": raw_landmarks,
            "top_predictions": top_predictions,
            "current_gesture": top_gesture,
            "confidence": round(confidence, 4),
            "state": state.value,
            "stable_frames": stable_frames,
            "target_stable_frames": target_stable,
            "event": event.value,
            "accepted_sign": accepted_sign,
            "buffer_fill": len(self.frame_buffer)
        }
