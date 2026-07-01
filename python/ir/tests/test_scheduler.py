"""Tests for Scheduler — deterministic main loop integration."""

import pytest
from datetime import datetime, timezone

from ir.scheduler import Scheduler
from ir.work_surface import WorkSurface, WorkSurfaceEntry
from ir.lease_pool import LeasePool
from ir.arbitration_engine import ArbitrationEngine
from ir.dispatcher import DispatchEvent


# ── helpers ──────────────────────────────────────────────────────────

def _make_event(event_id="evt-001", event_type="NODE_START", priority=0.8,
                causal_epoch=1, tags=None):
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


def _make_lease(lease_id="lease-001", role_name="builder", caps=None):
    class MockRole:
        pass
    r = MockRole()
    r.role_name = role_name

    class MockLease:
        pass
    l = MockLease()
    l.lease_id = lease_id
    l.role = r
    l.status = "PENDING"
    l.capabilities = set(caps or ["execute"])
    return l


# ── ingest ──────────────────────────────────────────────────────────

class TestSchedulerIngest:
    def test_ingest_adds_to_work_surface(self):
        s = Scheduler()
        entries = s.ingest([_make_event("e1"), _make_event("e2")])
        assert len(entries) == 2
        assert s.work_surface.unassigned_count == 2

    def test_ingest_emits_receipts(self):
        s = Scheduler()
        s.ingest([_make_event("e1")])
        assert len(s.work_surface.receipts) == 1


# ── process cycle ──────────────────────────────────────────────────

class TestSchedulerCycle:
    def test_cycle_with_no_leases_defers(self):
        s = Scheduler()
        s.ingest([_make_event("e1")])
        result = s.cycle()
        # Event gets deferred since no idle leases exist
        assert result["cycle_unassigned"] == 0
        assert result["cycle_deferred"] == 1
        assert result["cycle_dispatched"] == 0

    def test_cycle_dispatches_with_idle_leases(self):
        s = Scheduler()
        s.lease_pool.register(_make_lease("l1"))
        s.ingest([_make_event("e1")])
        result = s.cycle()
        assert result["cycle_dispatched"] == 1

    def test_cycle_dispatches_in_priority_order(self):
        s = Scheduler()
        s.lease_pool.register(_make_lease("l1"))
        s.lease_pool.register(_make_lease("l2"))
        s.ingest([
            _make_event("low", priority=0.3),
            _make_event("high", priority=1.0),
        ])
        result = s.cycle()
        assert result["cycle_dispatched"] > 0

    def test_cycle_returns_telemetry(self):
        s = Scheduler()
        s.lease_pool.register(_make_lease("l1"))
        result = s.cycle([_make_event("e1")])
        assert "cycle_unassigned" in result
        assert "cycle_dispatched" in result
        assert "pool_active" in result
        assert "pool_idle" in result

    def test_cycle_no_new_events_still_processes(self):
        s = Scheduler()
        s.ingest([_make_event("e1")])
        result = s.cycle()  # no new events
        # Processes the unassigned event from ingest (defers since no leases)
        assert result["cycle_unassigned"] == 0
        assert result["cycle_deferred"] == 1


# ── process_deferred ────────────────────────────────────────────────

class TestSchedulerDeferred:
    def test_deferred_events_retried(self):
        s = Scheduler()
        entry = s.work_surface.add(_make_event("e1"))
        s.work_surface.defer(entry.entry_id, "test", retry_after_seconds=0.0)
        s.process_deferred()
        e = s.work_surface.get_entry(entry.entry_id)
        assert e.status.value == "UNASSIGNED"


# ── run loop ────────────────────────────────────────────────────────

class TestSchedulerRun:
    def test_run_processes_events(self):
        class MockSource:
            def __init__(self, events):
                self.events = events
                self.called = 0
            def poll(self):
                if self.called == 0:
                    self.called += 1
                    return self.events
                return []

        s = Scheduler()
        s.lease_pool.register(_make_lease("l1"))
        source = MockSource([_make_event("e1")])
        telemetry = s.run(source)
        assert len(telemetry) == 1

    def test_run_stops_on_empty(self):
        class EmptySource:
            def poll(self):
                return []

        s = Scheduler()
        telemetry = s.run(EmptySource())
        assert len(telemetry) == 0

    def test_telemetry_snapshot(self):
        s = Scheduler()
        s.lease_pool.register(_make_lease("l1"))
        s.lease_pool.register(_make_lease("l2"))
        t = s.telemetry()
        assert t["work_surface"]["total"] == 0
        assert t["lease_pool"]["total"] == 2
