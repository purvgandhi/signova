from __future__ import annotations

import time
from enum import Enum
from typing import Optional, Tuple, Dict, Any

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
    Robust gesture acceptance and deduplication state machine for SignBridge.
    Enforces temporal stability, confidence thresholds, cooldown, boundary detection,
    and duplicate suppression (preventing holding a gesture from flooding the buffer).
    """
    def __init__(
        self,
        target_stable_frames: int = 8,
        accept_threshold: float = 0.70,
        reject_threshold: float = 0.50,
        cooldown_frames: int = 8,
        repeat_gesture_window_ms: int = 1200
    ):
        self.target_stable_frames = target_stable_frames
        self.accept_threshold = accept_threshold
        self.reject_threshold = reject_threshold
        self.cooldown_frames = cooldown_frames
        self.repeat_gesture_window_sec = repeat_gesture_window_ms / 1000.0

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
        Transitions the state machine given hand presence, top gesture prediction, and confidence.
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
            # Hand removed/neutral boundary detected
            self.state = RecognitionState.IDLE
            self.stable_frames = 0
            self.current_candidate = None
            self.hand_released = True
            return self.state, 0, self.target_stable_frames, event, None

        # Hand is present
        if confidence < self.reject_threshold:
            # Below reject threshold -> UNCERTAIN / DETECTING
            self.state = RecognitionState.DETECTING
            self.stable_frames = 0
            self.current_candidate = None
            self.hand_released = True
            event = RecognitionEvent.SIGN_UNCERTAIN
            return self.state, 0, self.target_stable_frames, event, None

        # Check duplicate suppression if user is still continuously holding the exact same sign
        is_same_as_last = (top_gesture == self.last_accepted)
        in_repeat_window = (now - self.last_accepted_time) < self.repeat_gesture_window_sec

        if is_same_as_last and not self.hand_released and in_repeat_window:
            # User is holding the sign without a neutral boundary or pause -> suppress duplicate
            self.duplicate_suppressions += 1
            self.state = RecognitionState.IDLE
            return self.state, 0, self.target_stable_frames, RecognitionEvent.NONE, None

        # Hand is active with candidate gesture
        if top_gesture == self.current_candidate:
            self.stable_frames += 1
            if self.stable_frames >= self.target_stable_frames and confidence >= self.accept_threshold:
                # Gesture is accepted!
                self.state = RecognitionState.ACCEPTED
                event = RecognitionEvent.SIGN_ACCEPTED
                accepted_sign = top_gesture
                self.last_accepted = top_gesture
                self.last_accepted_time = now
                self.hand_released = False
                self.total_accepted += 1
                self.stable_frames = 0
                self.current_candidate = None
                self.cooldown_remaining = self.cooldown_frames
            else:
                self.state = RecognitionState.STABLE
        else:
            # Sign changed or starting gesture
            self.current_candidate = top_gesture
            self.stable_frames = 1
            self.state = RecognitionState.DETECTING
            if top_gesture != self.last_accepted:
                # Different sign -> boundary crossed
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
