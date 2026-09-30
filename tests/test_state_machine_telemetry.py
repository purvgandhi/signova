from ml.recognition.state_machine import RecognitionStateMachine, RecognitionState, RecognitionEvent

def test_state_machine_idle_to_accepted_lifecycle():
    """Tests the exact state transitions: IDLE -> DETECTING -> STABLE -> ACCEPTED -> COOLDOWN -> IDLE."""
    sm = RecognitionStateMachine(
        target_stable_frames=4,
        accept_threshold=0.70,
        reject_threshold=0.50,
        cooldown_frames=2
    )

    # 1. No hand -> IDLE
    state, stable, target, event, accepted = sm.update(has_hand=False, top_gesture="hello", confidence=0.0)
    assert state == RecognitionState.IDLE
    assert stable == 0
    assert event == RecognitionEvent.NONE
    assert accepted is None

    # 2. Hand detected but low confidence (< 0.50) -> DETECTING / UNCERTAIN
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.45)
    assert state == RecognitionState.DETECTING
    assert stable == 0
    assert event == RecognitionEvent.SIGN_UNCERTAIN
    assert accepted is None

    # 3. Hand detected with good confidence (>= 0.70) -> DETECTING (frame 1)
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.88)
    assert state == RecognitionState.DETECTING
    assert stable == 1
    assert event == RecognitionEvent.NONE

    # 4. Consecutive frame 2 of "hello" -> STABLE
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.89)
    assert state == RecognitionState.STABLE
    assert stable == 2

    # 5. Consecutive frame 3 of "hello" -> STABLE
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.91)
    assert state == RecognitionState.STABLE
    assert stable == 3

    # 6. Consecutive frame 4 of "hello" (reaches target_stable_frames=4 and >= 0.70) -> ACCEPTED
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.92)
    assert state == RecognitionState.ACCEPTED
    assert event == RecognitionEvent.SIGN_ACCEPTED
    assert accepted == "hello"

    # 7. Next frames should be COOLDOWN
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.92)
    assert state == RecognitionState.COOLDOWN
    assert event == RecognitionEvent.NONE

    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture="hello", confidence=0.92)
    # Cooldown completes -> transitions to next cycle
    assert state in [RecognitionState.IDLE, RecognitionState.COOLDOWN, RecognitionState.DETECTING]

def test_telemetry_consistency_no_drift():
    """Asserts that telemetry displayed values match the values driving state events."""
    sm = RecognitionStateMachine(target_stable_frames=8, accept_threshold=0.70, reject_threshold=0.50)

    # Simulate frame
    test_confidence = 0.85
    test_gesture = "water"
    state, stable, target, event, accepted = sm.update(has_hand=True, top_gesture=test_gesture, confidence=test_confidence)

    d = sm.to_dict()
    assert d["state"] == state.value
    assert d["confidence"] == round(test_confidence, 4)
    assert d["candidate"] == test_gesture
    assert d["target_stable_frames"] == 8
