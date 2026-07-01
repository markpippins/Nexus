"""Tests for RL-IR LeaseLifecycle state machine and ConstraintSet."""

import pytest
from datetime import datetime, timezone, timedelta

from ir.lease_lifecycle import LeaseLifecycle, VALID_TRANSITIONS, TERMINAL_STATES
from ir.role_lease import RoleLease, LeaseStatus, LifecycleModel
from ir.constraints import ConstraintSet, Constraint


class TestLeaseLifecycle:
    def test_valid_transition_pending_to_active(self):
        lease = RoleLease()
        lease2 = LeaseLifecycle.transition(lease, LeaseStatus.ACTIVE)
        assert lease2.status == LeaseStatus.ACTIVE

    def test_valid_transition_active_to_completed(self):
        lease = RoleLease(status=LeaseStatus.ACTIVE)
        lease2 = LeaseLifecycle.transition(lease, LeaseStatus.COMPLETED)
        assert lease2.status == LeaseStatus.COMPLETED

    def test_invalid_transition_raises(self):
        lease = RoleLease()  # PENDING
        with pytest.raises(ValueError, match="Invalid transition"):
            LeaseLifecycle.transition(lease, LeaseStatus.COMPLETED)

    def test_invalid_from_terminal(self):
        lease = RoleLease(status=LeaseStatus.COMPLETED)
        with pytest.raises(ValueError):
            LeaseLifecycle.transition(lease, LeaseStatus.ACTIVE)

    def test_is_terminal(self):
        for status in LeaseStatus:
            lease = RoleLease(status=status)
            if status in TERMINAL_STATES:
                assert LeaseLifecycle.is_terminal(lease)
            else:
                assert not LeaseLifecycle.is_terminal(lease)

    def test_pending_to_expired(self):
        lease = RoleLease()  # PENDING
        lease2 = LeaseLifecycle.transition(lease, LeaseStatus.EXPIRED)
        assert lease2.status == LeaseStatus.EXPIRED

    def test_active_to_failed(self):
        lease = RoleLease(status=LeaseStatus.ACTIVE)
        lease2 = LeaseLifecycle.transition(lease, LeaseStatus.FAILED)
        assert lease2.status == LeaseStatus.FAILED

    def test_active_to_preempted(self):
        lease = RoleLease(status=LeaseStatus.ACTIVE)
        lease2 = LeaseLifecycle.transition(lease, LeaseStatus.PREEMPTED)
        assert lease2.status == LeaseStatus.PREEMPTED

    def test_apply_timeout_expired(self):
        past = datetime.now(timezone.utc) - timedelta(seconds=600)
        lease = RoleLease(
            status=LeaseStatus.ACTIVE,
            lifecycle=LifecycleModel(timeout_seconds=300, created_at=past),
        )
        result = LeaseLifecycle.apply_timeout(lease)
        assert result is not None
        assert result.status == LeaseStatus.EXPIRED

    def test_apply_timeout_not_expired(self):
        lease = RoleLease(
            status=LeaseStatus.ACTIVE,
            lifecycle=LifecycleModel(timeout_seconds=9999),
        )
        result = LeaseLifecycle.apply_timeout(lease)
        assert result is None

    def test_apply_timeout_non_active(self):
        lease = RoleLease(status=LeaseStatus.PENDING)
        result = LeaseLifecycle.apply_timeout(lease)
        assert result is None

    def test_original_lease_unchanged(self):
        lease = RoleLease()
        _ = LeaseLifecycle.transition(lease, LeaseStatus.ACTIVE)
        assert lease.status == LeaseStatus.PENDING  # original unchanged

    def test_can_retry(self):
        lease = RoleLease(status=LeaseStatus.FAILED)
        assert LeaseLifecycle.can_retry(lease)

    def test_cannot_retry_completed(self):
        lease = RoleLease(status=LeaseStatus.COMPLETED)
        assert not LeaseLifecycle.can_retry(lease)


class TestConstraintSet:
    def test_empty_constraints_pass(self):
        cs = ConstraintSet()
        lease = RoleLease()
        assert cs.check(lease, "execute")

    def test_capability_check_denies(self):
        cs = ConstraintSet(required_capabilities=["sudo"])
        lease = RoleLease()
        assert not cs.check(lease, "execute")

    def test_capability_check_allows(self):
        from ir.role_lease import CapabilitySet
        cs = ConstraintSet(required_capabilities=["read"])
        lease = RoleLease(capabilities=CapabilitySet.of("read", "write"))
        assert cs.check(lease, "read")

    def test_time_check_expired(self):
        past = datetime.now(timezone.utc) - timedelta(seconds=60)
        cs = ConstraintSet(max_duration_seconds=30)
        lease = RoleLease(lifecycle=LifecycleModel(created_at=past))
        assert not cs.check(lease, "execute")

    def test_time_check_ok(self):
        cs = ConstraintSet(max_duration_seconds=9999)
        lease = RoleLease()
        assert cs.check(lease, "execute")
