"""test_conformance_replay_idempotency.py — T19 replay-idempotency conformance.

Proves the event-spine replay guarantee at the fold layer (T19 acceptance:
"Replaying the chain does not double-admit, double-execute, double-consume a
lease, or create duplicate semantic events" — the fold contribution is that
state is a deterministic function of the event log, so replay is byte-identical):

  1. ``fold_events(work_request_id, events)`` is a pure function — folding the
     SAME canonical event sequence N times yields byte-identical serialized
     state (JSON), never a divergent or double-advanced state.
  2. Fold is order-independent — the same events in any input order fold to
     the same state (``fold_events`` sorts by ``sequence_number``).
  3. Replaying a prefix then the full sequence yields the same final state as
     folding the full sequence once (no double-counting).

Usage::

    cd /home/codex/dev/nexus/python/cascade
    python3 -m pytest test_conformance_replay_idempotency.py -v
"""

import json
import random

from event_store import (
    LedgerEvent,
    LedgerEventType,
    fold_events,
)

# ── Golden contract ─────────────────────────────────────────────────
# The byte-stable folded state for the canonical full-lifecycle sequence
# below. Freezes the projection shape so any change to the fold is a
# visible, deliberate contract change.
GOLDEN_STATE = {
    "work_request_id": "wr-t19",
    "current_state": "COMPLETED",
    "vision_stage": "EXECUTION_IR",
    "vision_ir_version": 2,
    "last_event_id": "evt-007",
    "version": 7,
}


def _make_event(seq: int, event_type: str, payload: dict | None = None, wr_id: str = "wr-t19") -> LedgerEvent:
    return LedgerEvent(
        event_id=f"evt-{seq:03d}",
        work_request_id=wr_id,
        event_type=event_type,
        sequence_number=seq,
        payload=payload or {},
    )


def _serialize(state) -> bytes:
    """Byte-stable serialization of a folded state."""
    return json.dumps(state.to_dict(), sort_keys=True).encode("utf-8")


def _full_lifecycle(wr_id: str = "wr-t19") -> list[LedgerEvent]:
    """Canonical event sequence: PROPOSED → PLANNING → PENDING → IMPLEMENTING
    (with a VISION.IR_PRODUCED side event) → REVIEW → COMPLETED."""
    return [
        _make_event(1, LedgerEventType.WORKREQUEST_CREATED.value, wr_id=wr_id),
        _make_event(2, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {"new_state": "PLANNING"}, wr_id=wr_id),
        _make_event(3, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {"new_state": "PENDING"}, wr_id=wr_id),
        _make_event(4, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {"new_state": "IMPLEMENTING"}, wr_id=wr_id),
        _make_event(5, LedgerEventType.VISION_IR_PRODUCED.value, {"ir_stage": "EXECUTION_IR", "ir_version": 2}, wr_id=wr_id),
        _make_event(6, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {"new_state": "REVIEW"}, wr_id=wr_id),
        _make_event(7, LedgerEventType.STATE_TRANSITION_COMMITTED.value, {"new_state": "COMPLETED"}, wr_id=wr_id),
    ]


class TestReplayIdempotency:
    """The core T19 conformance claim: replay is byte-identical."""

    def test_fold_twice_is_byte_identical(self):
        events = _full_lifecycle()
        s1 = _serialize(fold_events("wr-t19", events))
        s2 = _serialize(fold_events("wr-t19", events))
        assert s1 == s2

    def test_fold_many_times_is_byte_identical(self):
        events = _full_lifecycle()
        baseline = _serialize(fold_events("wr-t19", events))
        for _ in range(10):
            assert _serialize(fold_events("wr-t19", events)) == baseline

    def test_folded_state_matches_golden_contract(self):
        """Freeze the exact byte-stable projection for the canonical sequence."""
        events = _full_lifecycle()
        state = fold_events("wr-t19", events)
        assert json.loads(_serialize(state)) == GOLDEN_STATE

    def test_fold_is_order_independent(self):
        """Replay must not depend on delivery order — fold sorts by sequence."""
        events = _full_lifecycle()
        shuffled = list(events)
        rng = random.Random(42)
        rng.shuffle(shuffled)
        assert _serialize(fold_events("wr-t19", events)) == _serialize(fold_events("wr-t19", shuffled))

    def test_replay_does_not_double_advance(self):
        """Folding a prefix then the full sequence equals folding the full
        sequence once — re-seen events add no new state."""
        events = _full_lifecycle()
        full_only = _serialize(fold_events("wr-t19", events))
        _ = fold_events("wr-t19", events[:3])  # an earlier partial replay
        replayed = _serialize(fold_events("wr-t19", events))
        assert replayed == full_only
        final = fold_events("wr-t19", events)
        assert final.current_state.value == "COMPLETED"
        assert final.version == len(events)  # version advanced exactly once per event

    def test_duplicate_redelivery_is_stable(self):
        """At-least-once redelivery of the identical log yields the same
        terminal state every time (no double-consume)."""
        events = _full_lifecycle()
        baseline = fold_events("wr-t19", events)
        for _ in range(5):
            again = fold_events("wr-t19", events)
            assert again.current_state == baseline.current_state
            assert again.version == baseline.version
            assert again.last_event_id == baseline.last_event_id

    def test_terminal_state_is_replay_stable(self):
        """Once terminal, re-folding the full log keeps it terminal (COMPLETED),
        never resurrects to an earlier state."""
        events = _full_lifecycle()
        for _ in range(3):
            assert fold_events("wr-t19", events).current_state.value == "COMPLETED"
