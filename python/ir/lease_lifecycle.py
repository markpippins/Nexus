"""LeaseLifecycle — state machine for RoleLease status transitions.

Valid transitions: PENDING→ACTIVE→COMPLETED, PENDING→EXPIRED,
ACTIVE→FAILED, ACTIVE→PREEMPTED.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timezone

from .role_lease import LeaseStatus, RoleLease


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Valid Transitions ─────────────────────────────────────────────────

VALID_TRANSITIONS: dict[LeaseStatus, set[LeaseStatus]] = {
    LeaseStatus.PENDING: {LeaseStatus.ACTIVE, LeaseStatus.EXPIRED},
    LeaseStatus.ACTIVE: {LeaseStatus.COMPLETED, LeaseStatus.FAILED, LeaseStatus.PREEMPTED},
    LeaseStatus.COMPLETED: set(),
    LeaseStatus.FAILED: set(),
    LeaseStatus.PREEMPTED: set(),
    LeaseStatus.EXPIRED: set(),
}

TERMINAL_STATES: set[LeaseStatus] = {
    LeaseStatus.COMPLETED,
    LeaseStatus.FAILED,
    LeaseStatus.PREEMPTED,
    LeaseStatus.EXPIRED,
}


# ── LeaseLifecycle ────────────────────────────────────────────────────


class LeaseLifecycle:
    """Manages RoleLease status transitions with validation."""

    @staticmethod
    def transition(lease: RoleLease, to_status: LeaseStatus) -> RoleLease:
        """Transition a lease to a new status.

        Args:
            lease: The RoleLease to transition.
            to_status: Target status.

        Returns:
            A new RoleLease with the updated status (immutable).

        Raises:
            ValueError: If the transition is invalid.
        """
        allowed = VALID_TRANSITIONS.get(lease.status, set())
        if to_status not in allowed:
            raise ValueError(
                f"Invalid transition: {lease.status.value} → {to_status.value}. "
                f"Allowed: {[s.value for s in allowed]}"
            )
        return replace(lease, status=to_status)

    @staticmethod
    def is_terminal(lease: RoleLease) -> bool:
        """True if the lease is in a terminal state."""
        return lease.status in TERMINAL_STATES

    @staticmethod
    def apply_timeout(lease: RoleLease) -> RoleLease | None:
        """Transition ACTIVE leases past their timeout to EXPIRED.

        Returns a new lease if expired, None if still within timeout.
        """
        if lease.status != LeaseStatus.ACTIVE:
            return None

        timeout = lease.lifecycle.timeout_seconds
        elapsed = (_utc_now() - lease.lifecycle.created_at).total_seconds()

        if elapsed > timeout:
            return replace(lease, status=LeaseStatus.EXPIRED)

        return None

    @staticmethod
    def can_retry(lease: RoleLease) -> bool:
        """True if the lease can be retried (FAILED or PREEMPTED with retries remaining)."""
        if lease.status in (LeaseStatus.FAILED, LeaseStatus.PREEMPTED):
            # v1: no retry counter on the lease itself — always allow
            return True
        return False
