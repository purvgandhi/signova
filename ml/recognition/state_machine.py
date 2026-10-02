"""
Robust Gesture State Machine & Consensus Filter for Signova
- Temporal stability window & consensus voting
- Unknown / Idle / Detecting / Stable / Accepted / Cooldown states
- Ambiguity and entropy filtering (suppresses noisy transitional states)
- Duplicate suppression when a user holds the same sign continuously
- Rapid boundary reset on hand release / gesture transitions
"""
from __future__ import annotations

import time
from enum import Enum
from collections import deque, Counter
from typing import Optional, Tuple, Dict, Any, List

class RecognitionState(str, Enum):
    IDLE = "IDLE"
    DETECTING = "DETECTING"
    STABLE = "STABLE"
    ACCEPTED = "ACCEPTED"
    COOLDOWN = "COOLDOWN"

class RecognitionEvent(str, Enum):
    SIGN_ACCEPTED = "SIGN_ACCEPTED"
    SIGN_UNCERTAIN = "SIGN_UNCERTAIN"
    NONE = "NONE"

class RecognitionStateMachine:
    """
    State machine that manages gesture acceptance, temporal voting,
    transition boundaries, and duplicate suppression.
    """
    def __init__(
        self,
        target_stable_frames: int = 7,
        accept_threshold: float = 0.65,
        reject_threshold: float = 0.45,
        cooldown_frames: int = 6,
        repeat_gesture_window_ms: int = 1200,
        consensus_window_size: int = 7
    ):
        self.target_stable_frames = target_stable_frames
        self.accept_threshold = accept_threshold
        self.reject_threshold = reject_threshold
        self.cooldown_frames = cooldown_frames
        self.repeat_gesture_window_sec = repeat_gesture_window_ms / 1000.0

        self.consensus_window = deque(maxlen=consensus_window_size)
        self.confidence_window = deque(maxlen=consensus_window_size)

        self.state = RecognitionState.IDLE
        self.stable_frames = 0
        self.current_candidate: Optional[str] = None
        self.current_confidence: float = 0.0
        self.cooldown_remaining = 0
        self.last_accepted: Optional[str] = None
        self.last_accepted_time: float = 0.0
        self.hand_released: bool = True
        self.total_accepted = 0
        self.duplicate_suppressions = 0

    def update(
        self,
        has_hand: bool,
        top_gesture: str,
        confidence: float
    ) -> Tuple[RecognitionState, int, int, RecognitionEvent, Optional[str]]:
        """
        Updates state with sliding window consensus and boundary detection.
        Returns:
            (state, stable_frames, target_stable_frames, event, accepted_sign)
        """
        self.current_confidence = confidence
        event = RecognitionEvent.NONE
        accepted_sign = None
        now = time.time()

        # Cooldown management
        if self.cooldown_remaining > 0:
            self.cooldown_remaining -= 1
            if self.cooldown_remaining > 0:
                self.state = RecognitionState.COOLDOWN
                return self.state, 0, self.target_stable_frames, event, None
            else:
                self.state = RecognitionState.IDLE

        if not has_hand:
            # Hand dropped / neutral boundary
            self.state = RecognitionState.IDLE
            self.stable_frames = 0
            self.current_candidate = None
            self.hand_released = True
            self.consensus_window.clear()
            self.confidence_window.clear()
            return self.state, 0, self.target_stable_frames, event, None

        # Hand is present -> add to rolling consensus buffer
        self.consensus_window.append(top_gesture)
        self.confidence_window.append(confidence)

        # Calculate consensus in sliding window
        counts = Counter(self.consensus_window)
        dominant_gesture, count = counts.most_common(1)[0]
        avg_confidence = float(np_mean(list(self.confidence_window)))

        # Reject low confidence / uncertain gestures
        if avg_confidence < self.reject_threshold or dominant_gesture in ("none", "unknown"):
            self.state = RecognitionState.DETECTING
            self.stable_frames = 0
            self.current_candidate = None
            self.hand_released = True
            event = RecognitionEvent.SIGN_UNCERTAIN
            return self.state, 0, self.target_stable_frames, event, None

        # Duplicate suppression check
        is_same_as_last = (dominant_gesture == self.last_accepted)
        in_repeat_window = (now - self.last_accepted_time) < self.repeat_gesture_window_sec

        if is_same_as_last and not self.hand_released and in_repeat_window:
            self.duplicate_suppressions += 1
            self.state = RecognitionState.IDLE
            return self.state, 0, self.target_stable_frames, RecognitionEvent.NONE, None

        # Temporal stability tracking
        if dominant_gesture == self.current_candidate:
            self.stable_frames += 1
            # Check acceptance condition: enough stable frames & sufficient consensus ratio & confidence
            consensus_ratio = count / len(self.consensus_window)
            if (self.stable_frames >= self.target_stable_frames and
                consensus_ratio >= 0.70 and
                avg_confidence >= self.accept_threshold):

                self.state = RecognitionState.ACCEPTED
                event = RecognitionEvent.SIGN_ACCEPTED
                accepted_sign = dominant_gesture
                self.last_accepted = dominant_gesture
                self.last_accepted_time = now
                self.hand_released = False
                self.total_accepted += 1
                self.stable_frames = 0
                self.current_candidate = None
                self.consensus_window.clear()
                self.confidence_window.clear()
                self.cooldown_remaining = self.cooldown_frames
            else:
                self.state = RecognitionState.STABLE
        else:
            # Gesture changed
            self.current_candidate = dominant_gesture
            self.stable_frames = 1
            self.state = RecognitionState.DETECTING
            if dominant_gesture != self.last_accepted:
                self.hand_released = True

        return self.state, self.stable_frames, self.target_stable_frames, event, accepted_sign

    def reset(self):
        self.state = RecognitionState.IDLE
        self.stable_frames = 0
        self.current_candidate = None
        self.current_confidence = 0.0
        self.cooldown_remaining = 0
        self.last_accepted = None
        self.last_accepted_time = 0.0
        self.hand_released = True
        self.consensus_window.clear()
        self.confidence_window.clear()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state.value,
            "stable_frames": self.stable_frames,
            "target_stable_frames": self.target_stable_frames,
            "candidate": self.current_candidate,
            "confidence": round(self.current_confidence, 4),
            "cooldown_remaining": self.cooldown_remaining,
            "total_accepted": self.total_accepted,
            "duplicate_suppressions": self.duplicate_suppressions
        }

def np_mean(vals: List[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0
