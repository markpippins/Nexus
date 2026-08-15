"""Tests for LeasePool — idle/active lease tracking, capacity, preemption."""

import pytest

from ir.lease_pool import LeasePool, LeaseBinding, LeaseSlot


# ── helpers ──────────────────────────────────────────────────────────

def _make_lease(lease_id="lease-001", role_name="builder", caps=None):
    """Create a duck-typed RoleLease for testing."""
    class MockRole:
        def __init__(self, name):
            self.role_name = name
    class MockLease:
        pass
    l = MockLease()
    l.lease_id = lease_id
    l.status = "PENDING"
    l.role = MockRole(role_name)
    l.capabilities = set(caps or [])
    return l


def _make_event(event_id="evt-001", event_type="test", priority=0.5):
    class MockEvent:
        pass
    e = MockEvent()
    e.event_id = event_id
    e.event_type = event_type
    e.priority = priority
    return e


# ── registration ────────────────────────────────────────────────────

class TestLeasePoolRegistration:
    def test_register_adds_lease(self):
        pool = LeasePool()
        lease = _make_lease()
        pool.register(lease)
        assert pool.total_count == 1
        assert pool.idle_count == 1

    def test_register_duplicate_is_idempotent(self):
        pool = LeasePool()
        lease = _make_lease()
        pool.register(lease)
        pool.register(lease)
        assert pool.total_count == 1

    def test_deregister_removes(self):
        pool = LeasePool()
        lease = _make_lease()
        pool.register(lease)
        pool.deregister("lease-001")
        assert pool.total_count == 0


# ── acquire / release ───────────────────────────────────────────────

class TestLeasePoolAcquireRelease:
    def test_acquire_returns_binding(self):
        pool = LeasePool()
        lease = _make_lease()
        pool.register(lease)
        binding = pool.acquire("lease-001", _make_event())
        assert binding is not None
        assert binding.lease_id == "lease-001"

    def test_acquire_marks_active(self):
        pool = LeasePool()
        pool.register(_make_lease())
        pool.acquire("lease-001", _make_event())
        assert pool.active_count == 1
        assert pool.idle_count == 0

    def test_release_returns_to_idle(self):
        pool = LeasePool()
        pool.register(_make_lease())
        pool.acquire("lease-001", _make_event())
        pool.release("lease-001")
        assert pool.active_count == 0
        assert pool.idle_count == 1

    def test_acquire_at_capacity_returns_none(self):
        pool = LeasePool(max_active=1)
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        pool.acquire("l1", _make_event())
        binding = pool.acquire("l2", _make_event())
        assert binding is None

    def test_acquire_nonexistent_returns_none(self):
        pool = LeasePool()
        assert pool.acquire("nonexistent", _make_event()) is None

    def test_set_load(self):
        pool = LeasePool()
        pool.register(_make_lease())
        pool.set_load("lease-001", 0.75)
        slot = pool.get_slot("lease-001")
        assert slot.load == 0.75


# ── idle / active queries ───────────────────────────────────────────

class TestLeasePoolQueries:
    def test_idle_leases_returns_unbound(self):
        pool = LeasePool()
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        pool.acquire("l1", _make_event())
        idle = pool.idle_leases()
        assert len(idle) == 1
        assert idle[0].lease_id == "l2"

    def test_active_leases(self):
        pool = LeasePool()
        pool.register(_make_lease("l1"))
        pool.acquire("l1", _make_event())
        active = pool.active_leases()
        assert len(active) == 1

    def test_idle_slots_include_load(self):
        pool = LeasePool()
        pool.register(_make_lease())
        pool.set_load("lease-001", 0.3)
        slots = pool.idle_slots()
        assert len(slots) == 1
        assert slots[0].load == 0.3


# ── capacity ────────────────────────────────────────────────────────

class TestLeasePoolCapacity:
    def test_at_capacity(self):
        pool = LeasePool(max_active=1)
        pool.register(_make_lease("l1"))
        assert not pool.at_capacity()
        pool.acquire("l1", _make_event())
        assert pool.at_capacity()

    def test_telemetry(self):
        pool = LeasePool(max_active=5)
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        t = pool.telemetry()
        assert t["total"] == 2
        assert t["active"] == 0
        assert t["idle"] == 2
        assert t["max_active"] == 5


# ── consolidation (nbk MergeIdleLeasesRule port) ────────────────────

class TestLeasePoolConsolidation:
    def test_consolidate_idle_tags_idle_slots(self):
        pool = LeasePool()
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        pool.acquire("l1", _make_event())
        n = pool.consolidate_idle(target_executor="executor-shared")
        assert n == 1  # only l2 is idle
        assert pool.get_slot("l2").executor == "executor-shared"
        assert pool.get_slot("l1").executor == ""  # active untouched

    def test_consolidate_all_idle(self):
        pool = LeasePool()
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        n = pool.consolidate_idle()
        assert n == 2
        assert pool.get_slot("l1").executor == "executor-shared"

    def test_consolidate_empty_pool(self):
        pool = LeasePool()
        assert pool.consolidate_idle() == 0

    def test_consolidate_custom_target(self):
        pool = LeasePool()
        pool.register(_make_lease("l1"))
        pool.consolidate_idle(target_executor="executor-bulk")
        assert pool.get_slot("l1").executor == "executor-bulk"


# ── preemption ──────────────────────────────────────────────────────

class TestLeasePoolPreemption:
    def test_preemption_disabled_by_default(self):
        pool = LeasePool()
        assert not pool.preemption_enabled

    def test_find_preemption_target_disabled(self):
        pool = LeasePool(preemption_enabled=False)
        pool.register(_make_lease("l1"))
        pool.acquire("l1", _make_event(priority=0.2))
        target = pool.find_preemption_target(0.9)
        assert target is None

    def test_find_preemption_target_returns_lowest(self):
        pool = LeasePool(preemption_enabled=True)
        pool.register(_make_lease("l1"))
        pool.register(_make_lease("l2"))
        pool.acquire("l1", _make_event("e1", priority=0.2))
        pool.acquire("l2", _make_event("e2", priority=0.8))
        target = pool.find_preemption_target(0.9)
        assert target is not None
        assert target.binding.event_id == "e1"

    def test_preempt_releases_lease(self):
        pool = LeasePool(preemption_enabled=True)
        pool.register(_make_lease("l1"))
        pool.acquire("l1", _make_event("e1", priority=0.2))
        slot = pool.get_slot("l1")
        event_id = pool.preempt(slot)
        assert event_id == "e1"
        assert pool.active_count == 0
