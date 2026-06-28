"""
LineageEngine — causal event recording for the WRP kernel.

Lineage records every step of the reduce pipeline as a first-class event.
Each event is a node in the causal graph that maps to a specific delta
and step in the reduce process.

Design invariants:
  - Lineage is append-only (events are never modified or deleted)
  - Lineage is deterministic (same deltas → same lineage)
  - Errors are recorded as lineage events (not thrown as exceptions)

Design reference: kernel-projection-answers.md §6 (lineage.py)
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class LineageEvent:
    """A single causal event in the lineage trace.

    Fields:
        version: KernelState version at the time of this event.
        delta_id: The KernelDelta that triggered this event.
        step: Which reduce step produced this event
              ("materialize", "identity", "graph", "lineage", "commit").
        event_type: Type of event ("apply", "skip", "error", "reject").
        affected_plans: List of plan IDs affected by this event.
        detail: Optional human-readable detail message.
    """
    version: int
    delta_id: str
    step: str
    event_type: str = "apply"
    affected_plans: List[str] = field(default_factory=list)
    detail: Optional[str] = None


class LineageEngine:
    """Append-only causal event recorder.

    Records every reduce step so the full execution trace can be
    reconstructed from logs. Supports replay verification.
    """

    def __init__(self) -> None:
        self._events: List[LineageEvent] = []

    def record(self, event: LineageEvent) -> None:
        """Append a lineage event.

        Events are stored in chronological order.
        """
        self._events.append(event)

    def record_from_delta(
        self,
        version: int,
        delta_id: str,
        step: str,
        event_type: str = "apply",
        affected_plans: Optional[List[str]] = None,
        detail: Optional[str] = None,
    ) -> LineageEvent:
        """Convenience: create and record a LineageEvent in one call."""
        event = LineageEvent(
            version=version,
            delta_id=delta_id,
            step=step,
            event_type=event_type,
            affected_plans=affected_plans or [],
            detail=detail,
        )
        self._events.append(event)
        return event

    def events_since(self, version: int) -> List[LineageEvent]:
        """Get all lineage events with version > the given version."""
        return [e for e in self._events if e.version > version]

    def events_for_delta(self, delta_id: str) -> List[LineageEvent]:
        """Get all lineage events for a specific delta."""
        return [e for e in self._events if e.delta_id == delta_id]

    def last_event(self) -> Optional[LineageEvent]:
        """Get the most recent lineage event."""
        if not self._events:
            return None
        return self._events[-1]

    def all_events(self) -> List[LineageEvent]:
        """Return all recorded lineage events."""
        return list(self._events)

    def event_count(self) -> int:
        return len(self._events)

    def reset(self) -> None:
        """Clear all lineage state. Used for test isolation."""
        self._events.clear()
