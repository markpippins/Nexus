"""ArbitrationEngine — weighted scoring for lease selection.

Scores leases against events using: α·capability_fit + β·(1 - load) + γ·priority.
Uses argmax (first-valid wins ties) for determinism.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ArbitrationEngine:
    """Scores and selects leases for events using weighted criteria.

    Deterministic: argmax with first-valid-wins tie-breaking.  No random
    decisions, no wall-clock dependency.
    """

    alpha: float = 0.5   # weight for capability fit
    beta: float = 0.3    # weight for inverse load
    gamma: float = 0.2   # weight for event priority

    # ── scoring ────────────────────────────────────────────────────

    def capability_fit(self, lease: Any, event: Any) -> float:
        """Score how well a lease's capabilities match an event's requirements.

        Returns 1.0 if no capabilities are required (any lease can handle it),
        0.0 if any required capability is missing, or the overlap ratio.
        """
        lease_caps = self._get_lease_capabilities(lease)
        required = self._get_required_capabilities(event)

        if not required:
            return 1.0  # any lease can handle this

        if not lease_caps:
            return 0.0

        matched = sum(1 for cap in required if cap in lease_caps)
        return matched / len(required)

    def score(self, lease: Any, event: Any, load: float = 0.0) -> float:
        """Score a lease for an event.

        score = α × capability_fit + β × (1 - load) + γ × priority
        """
        cfit = self.capability_fit(lease, event)
        inv_load = 1.0 - load
        priority = getattr(event, "priority", 0.5)

        return self.alpha * cfit + self.beta * inv_load + self.gamma * priority

    # ── selection ──────────────────────────────────────────────────

    def select(self, leases: list[Any], event: Any) -> Any | None:
        """Return the highest-scoring lease, or None if all denied.

        Uses argmax — first valid lease wins ties (deterministic).
        """
        best_lease: Any = None
        best_score: float = -1.0

        for lease in leases:
            score = self.score(lease, event)
            if score > best_score:
                best_score = score
                best_lease = lease

        return best_lease

    def select_with_load(
        self, lease_slots: list[Any], event: Any
    ) -> tuple[Any | None, float]:
        """Select using slots (which carry load info). Returns (lease, score)."""
        best_lease: Any = None
        best_score: float = -1.0

        for slot in lease_slots:
            lease = getattr(slot, "lease", slot)
            load = getattr(slot, "load", 0.0)
            score = self.score(lease, event, load)
            if score > best_score:
                best_score = score
                best_lease = lease

        return best_lease, best_score

    # ── helpers ────────────────────────────────────────────────────

    @staticmethod
    def _get_lease_capabilities(lease: Any) -> set[str]:
        """Extract capability strings from a lease (duck-typed)."""
        caps = getattr(lease, "capabilities", None)
        if caps is None:
            return set()
        # CapabilitySet from RL-IR
        if hasattr(caps, "capabilities") and hasattr(caps.capabilities, "__iter__"):
            return set(caps.capabilities)
        # Plain set
        if isinstance(caps, (set, frozenset)):
            return set(caps)
        # List
        if isinstance(caps, list):
            return set(caps)
        return set()

    @staticmethod
    def _get_required_capabilities(event: Any) -> list[str]:
        """Extract required capability strings from an event."""
        req = getattr(event, "required_capabilities", None)
        if req is None:
            return []
        if isinstance(req, (list, tuple)):
            return list(req)
        return []
