"""Tests for WorkSurface — indexed, queryable intent surface."""

import pytest
from datetime import datetime, timedelta, timezone

from ir.work_surface import (
    WorkSurface,
    WorkSurfaceEntry,
    WorkSurfaceStatus,
)
from ir.promotion_receipt import PromotionReceipt


# ── helpers ──────────────────────────────────────────────────────────

def _make_event(event_id="evt-001", event_type="test", priority=0.8,
                causal_epoch=1, tags=None):
    """Create a duck-typed event for WorkSurface."""
    class MockEvent:
        pass
    e = MockEvent()
    e.event_id = event_id
    e.event_type = event_type
    e.priority = priority
    e.causal_epoch = causal_epoch
    e.tags = tags or []
    e.timestamp = datetime.now(timezone.utc)
    return e


# ── add ──────────────────────────────────────────────────────────────

class TestWorkSurfaceAdd:
    def test_add_returns_entry(self):
        ws = WorkSurface()
        event = _make_event()
        entry = ws.add(event)
        assert isinstance(entry, WorkSurfaceEntry)
        assert entry.event_id == "evt-001"

    def test_add_sets_status_unassigned(self):
        ws = WorkSurface()
        event = _make_event()
        entry = ws.add(event)
        assert entry.status == WorkSurfaceStatus.UNASSIGNED

    def test_add_emits_promotion_receipt(self):
        ws = WorkSurface()
        event = _make_event()
        ws.add(event)
        assert len(ws.receipts) == 1
        r = ws.receipts[0]
        assert r.from_type == "CausalEvent"
        assert r.to_type == "WorkSurfaceEntry"
        assert r.stage == "ingest"

    def test_add_two_events_two_receipts(self):
        ws = WorkSurface()
        ws.add(_make_event("evt-001"))
        ws.add(_make_event("evt-002"))
        assert len(ws.receipts) == 2


# ── unassigned ───────────────────────────────────────────────────────

class TestWorkSurfaceUnassigned:
    def test_unassigned_returns_all_pending(self):
        ws = WorkSurface()
        ws.add(_make_event("evt-001", priority=0.5))
        ws.add(_make_event("evt-002", priority=0.9))
        unassigned = ws.unassigned()
        assert len(unassigned) == 2

    def test_unassigned_ordered_by_priority_desc(self):
        ws = WorkSurface()
        ws.add(_make_event("low", priority=0.3))
        ws.add(_make_event("high", priority=1.0))
        ws.add(_make_event("mid", priority=0.6))
        unassigned = ws.unassigned()
        priorities = [e.priority for e in unassigned]
        assert priorities == [1.0, 0.6, 0.3]

    def test_unassigned_same_priority_ordered_by_epoch(self):
        ws = WorkSurface()
        ws.add(_make_event("e1", priority=0.5, causal_epoch=3))
        ws.add(_make_event("e2", priority=0.5, causal_epoch=1))
        ws.add(_make_event("e3", priority=0.5, causal_epoch=2))
        unassigned = ws.unassigned()
        epochs = [e.causal_epoch for e in unassigned]
        assert epochs == [1, 2, 3]


# ── lifecycle ────────────────────────────────────────────────────────

class TestWorkSurfaceLifecycle:
    def test_dispatch_changes_status(self):
        ws = WorkSurface()
        entry = ws.add(_make_event())
        ws.dispatch(entry.entry_id)
        assert ws.get_entry(entry.entry_id).status == WorkSurfaceStatus.DISPATCHED

    def test_deferred_sets_retry_time(self):
        ws = WorkSurface()
        entry = ws.add(_make_event())
        ws.defer(entry.entry_id, "no_idle_leases", retry_after_seconds=10.0)
        e = ws.get_entry(entry.entry_id)
        assert e.status == WorkSurfaceStatus.DEFERRED
        assert e.defer_reason == "no_idle_leases"
        assert e.defer_until is not None

    def test_deferred_due_returns_past_retry(self):
        ws = WorkSurface()
        entry = ws.add(_make_event())
        ws.defer(entry.entry_id, "test", retry_after_seconds=0.0)
        due = ws.deferred_due()
        assert len(due) == 1
        assert due[0].entry_id == entry.entry_id

    def test_retry_moves_back_to_unassigned(self):
        ws = WorkSurface()
        entry = ws.add(_make_event())
        ws.defer(entry.entry_id, "test", retry_after_seconds=60.0)
        ws.retry(entry.entry_id)
        e = ws.get_entry(entry.entry_id)
        assert e.status == WorkSurfaceStatus.UNASSIGNED


# ── query ────────────────────────────────────────────────────────────

class TestWorkSurfaceQuery:
    def test_query_by_type(self):
        ws = WorkSurface()
        ws.add(_make_event("e1", event_type="NODE_START"))
        ws.add(_make_event("e2", event_type="NODE_COMPLETE"))
        results = ws.query(event_type="NODE_START")
        assert len(results) == 1
        assert results[0].event_id == "e1"

    def test_query_by_priority_range(self):
        ws = WorkSurface()
        ws.add(_make_event("low", priority=0.2))
        ws.add(_make_event("mid", priority=0.5))
        ws.add(_make_event("high", priority=0.9))
        results = ws.query(priority_min=0.5)
        assert len(results) == 2

    def test_query_by_status(self):
        ws = WorkSurface()
        e1 = ws.add(_make_event("e1"))
        ws.add(_make_event("e2"))
        ws.dispatch(e1.entry_id)
        dispatched = ws.query(status=WorkSurfaceStatus.DISPATCHED)
        unassigned = ws.query(status=WorkSurfaceStatus.UNASSIGNED)
        assert len(dispatched) == 1
        assert len(unassigned) == 1

    def test_query_by_tags(self):
        ws = WorkSurface()
        ws.add(_make_event("e1", tags=["urgent", "builder"]))
        ws.add(_make_event("e2", tags=["normal", "architect"]))
        urgent = ws.query(tags=["urgent"])
        assert len(urgent) == 1
        assert urgent[0].event_id == "e1"


# ── properties ───────────────────────────────────────────────────────

class TestWorkSurfaceProperties:
    def test_entry_count(self):
        ws = WorkSurface()
        assert ws.entry_count == 0
        ws.add(_make_event("e1"))
        ws.add(_make_event("e2"))
        assert ws.entry_count == 2

    def test_status_counts(self):
        ws = WorkSurface()
        ws.add(_make_event("e1"))
        ws.add(_make_event("e2"))
        assert ws.unassigned_count == 2
        assert ws.deferred_count == 0
