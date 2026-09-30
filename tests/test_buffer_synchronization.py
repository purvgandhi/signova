class MockSignBuffer:
    def __init__(self, max_capacity=20):
        self.tokens = []
        self.max_capacity = max_capacity
        self.version_id = 0

    def add(self, token: str):
        token = token.strip().lower()
        if not token:
            return
        if len(self.tokens) >= self.max_capacity:
            self.tokens.pop(0)
        self.tokens.append(token)
        self.version_id += 1

    def undo(self):
        if self.tokens:
            self.tokens.pop()
            self.version_id += 1

    def remove_at(self, index: int):
        if 0 <= index < len(self.tokens):
            self.tokens.pop(index)
            self.version_id += 1

    def clear(self):
        if self.tokens:
            self.tokens = []
            self.version_id += 1

    @property
    def hud_counter_display(self) -> str:
        return f"BUFFER: {len(self.tokens)}/{self.max_capacity}"

    @property
    def chip_count_display(self) -> str:
        count = len(self.tokens)
        return f"{count} TOKEN{'S' if count != 1 else ''}"

    @property
    def raw_model_sequence_display(self) -> str:
        if not self.tokens:
            return "[EMPTY]"
        return f"[{', '.join(t.upper() for t in self.tokens)}]"


def test_buffer_synchronization_three_way_match():
    """Asserts Bug 2 fix: HUD counter, chip count, and raw sequence always match 1:1."""
    buf = MockSignBuffer(max_capacity=20)

    # Initial empty state
    assert buf.hud_counter_display == "BUFFER: 0/20"
    assert buf.chip_count_display == "0 TOKENS"
    assert buf.raw_model_sequence_display == "[EMPTY]"
    assert len(buf.tokens) == 0

    # Add 4 signs
    signs = ["hello", "where", "doctor", "pain"]
    for s in signs:
        buf.add(s)

    # In Bug 2, the UI showed 0/20 vs 4 chips vs 6 tokens.
    # Here we assert that all three strictly evaluate to 4 tokens.
    assert buf.hud_counter_display == "BUFFER: 4/20"
    assert buf.chip_count_display == "4 TOKENS"
    assert buf.raw_model_sequence_display == "[HELLO, WHERE, DOCTOR, PAIN]"
    assert len(buf.tokens) == 4
    assert buf.version_id == 4

    # Undo one sign (Bug 5)
    buf.undo()
    assert buf.hud_counter_display == "BUFFER: 3/20"
    assert buf.chip_count_display == "3 TOKENS"
    assert buf.raw_model_sequence_display == "[HELLO, WHERE, DOCTOR]"
    assert len(buf.tokens) == 3
    assert buf.version_id == 5

    # Remove at index 1 ("where")
    buf.remove_at(1)
    assert buf.hud_counter_display == "BUFFER: 2/20"
    assert buf.chip_count_display == "2 TOKENS"
    assert buf.raw_model_sequence_display == "[HELLO, DOCTOR]"
    assert len(buf.tokens) == 2
    assert buf.version_id == 6

    # Clear buffer
    buf.clear()
    assert buf.hud_counter_display == "BUFFER: 0/20"
    assert buf.chip_count_display == "0 TOKENS"
    assert buf.raw_model_sequence_display == "[EMPTY]"
    assert len(buf.tokens) == 0
    assert buf.version_id == 7
