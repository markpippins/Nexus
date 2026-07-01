"""ConstraintSet — time, resource, and capability constraints for RoleLeases.

Enforces limits on what a lease can do.  v1: simple time and capability
checks.  v2: will integrate GP-IR policy predicates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class Constraint:
    """A single constraint on a lease action."""

    name: str
    description: str = ""
    check_fn: str = ""  # v1: not used; v2: policy predicate reference


@dataclass(frozen=True)
class ConstraintSet:
    """A collection of constraints applied to a lease.

    v1: Time-based and capability-based checks only.
    v2: Will integrate GP-IR policy engine for predicate evaluation.
    """

    constraints: list[Constraint] = field(default_factory=list)
    max_duration_seconds: float | None = None
    max_memory_mb: int | None = None
    required_capabilities: list[str] = field(default_factory=list)

    def check(self, lease: Any, action: str) -> bool:
        """Check if an action is allowed under all constraints.

        Args:
            lease: The RoleLease to check.
            action: The action being attempted.

        Returns:
            True if the action is allowed.
        """
        # Time check
        if self.max_duration_seconds is not None:
            lifecycle = getattr(lease, "lifecycle", None)
            if lifecycle:
                elapsed = (_utc_now() - lifecycle.created_at).total_seconds()
                if elapsed > self.max_duration_seconds:
                    return False

        # Capability check — use explicit None check, not truthiness,
        # because CapabilitySet with 0 members is still a valid set.
        caps = getattr(lease, "capabilities", None)
        if caps is not None and self.required_capabilities:
            for req in self.required_capabilities:
                if not hasattr(caps, "__contains__"):
                    return False
                if req not in caps:
                    return False

        return True
