"""Tests for Dispatcher — event-to-lease binding with PromotionReceipt."""

import pytest

from ir.dispatcher import Dispatcher, DispatchEvent
from ir.work_surface import WorkSurface, WorkSurfaceEntry
from ir.lease_pool import LeasePool


# ── helpers ──────────────────────────────────────────────────────────

def _make_entry(event_id="evt-001", entry_id="entry-001", priority=0.5):
    """Create a WorkSurfaceEntry for dispatch testing."""
    return WorkSurfaceEntry(
        entry_id=entry_id,
        event_id=event_id,
        event_type="NODE_START",
        priority=priority,
    )


def _make_lease(lease_id="lease-001", caps=None):
    class MockRole:
        pass
    r = MockRole()
    r.role_name = "builder"

    class MockLease:
        pass
    l = MockLease()
    l.lease_id = lease_id
    l.role = r
    l.capabilities = set(caps or ["execute"])
    return l


# ── DispatchEvent ───────────────────────────────────────────────────

class TestDispatchEvent:
    def test_from_arbitration_creates_dispatch(self):
        event = _make_entry()
        lease = _make_lease()
        de = DispatchEvent.from_arbitration(event, lease, 0.85)
        assert isinstance(de, DispatchEvent)
        assert de.event_id == "evt-001"
        assert de.lease_id == "lease-001"
        assert de.score == 0.85

    def test_dispatch_carries_promotion_receipt(self):
        event = _make_entry()
        lease = _make_lease()
        de = DispatchEvent.from_arbitration(event, lease, 0.85)
        assert de.promotion_receipt is not None
        r = de.promotion_receipt
        assert r.from_type == "WorkSurface"
        assert r.to_type == "DispatchEvent"
        assert r.to_id == de.dispatch_id
        assert r.stage == "dispatch"
        assert r.metadata["lease_id"] == "lease-001"
        assert r.metadata["score"] == 0.85

    def test_receipt_includes_role_and_capabilities(self):
        event = _make_entry()
        lease = _make_lease(caps=["execute", "read"])
        de = DispatchEvent.from_arbitration(event, lease, 0.9)
        r = de.promotion_receipt
        assert r.metadata["role"] == "builder"
        assert "execute" in r.metadata["capabilities"]


# ── Dispatcher ──────────────────────────────────────────────────────

class TestDispatcher:
    def test_dispatch_returns_dispatch_event(self):
        ws = WorkSurface()
        pool = LeasePool()
        pool.register(_make_lease())
        dispatcher = Dispatcher(work_surface=ws, lease_pool=pool)
        entry = _make_entry()
        de = dispatcher.dispatch(entry, _make_lease(), 0.8)
        assert isinstance(de, DispatchEvent)

    def test_dispatch_acquires_lease(self):
        ws = WorkSurface()
        pool = LeasePool()
        pool.register(_make_lease())
        dispatcher = Dispatcher(work_surface=ws, lease_pool=pool)
        entry = _make_entry()
        dispatcher.dispatch(entry, _make_lease(), 0.8)
        assert pool.active_count == 1

    def test_dispatch_marks_entry_dispatched(self):
        ws = WorkSurface()
        pool = LeasePool()
        pool.register(_make_lease())
        dispatcher = Dispatcher(work_surface=ws, lease_pool=pool)
        ws_entry = ws.add(_make_entry())
        dispatcher.dispatch(ws_entry, _make_lease(), 0.8)
        assert ws.get_entry(ws_entry.entry_id).status.value == "DISPATCHED"

    def test_dispatch_at_capacity_returns_none(self):
        ws = WorkSurface()
        pool = LeasePool(max_active=0)
        pool.register(_make_lease())
        dispatcher = Dispatcher(work_surface=ws, lease_pool=pool)
        entry = _make_entry()
        de = dispatcher.dispatch(entry, _make_lease(), 0.8)
        assert de is None
