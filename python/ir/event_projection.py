"""EventProjection — selects relevant events from the causal lattice for a role.

Not a materialization — a filter.  Given a role, time range, and causal
boundary, selects which CausalEvents are visible and relevant.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
import uuid


@dataclass(frozen=True)
class EventProjection:
    """A filtered view of events relevant to a specific role.

    Attributes:
        projection_id: Unique identifier for this projection.
        events: The selected CausalEvents visible to the role (immutable tuple).
        role_name: Which role this projection was created for.
        causal_boundary: Event IDs at the edge of reachability.
        time_range: Start/end timestamps bounding the projection.
        relevance_scores: Per-event relevance scores (0.0-1.0).
    """

    projection_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    events: tuple[Any, ...] = field(default_factory=tuple)  # tuple[CausalEvent]
    role_name: str = ""
    causal_boundary: frozenset[str] = field(default_factory=frozenset)
    time_range: tuple[datetime | None, datetime | None] = (None, None)
    relevance_scores: dict[str, float] = field(default_factory=dict)

    @classmethod
    def select(
        cls,
        events: list[Any],  # list[CausalEvent]
        role: Any,          # RoleDefinition
        time_range: tuple[datetime, datetime] | None = None,
        causal_boundary: set[str] | None = None,
    ) -> "EventProjection":
        """Select events relevant to a role.

        Args:
            events: Raw CausalEvents to filter.
            role: RoleDefinition for capability scoping.
            time_range: Optional (start, end) time filter.
            causal_boundary: Optional set of event IDs at the reachability edge.

        Returns:
            An EventProjection with filtered events and relevance scores.
        """
        role_name = getattr(role, "role_name", str(role))
        allowed = set(getattr(role, "allowed_actions", []))
        caps = getattr(role, "default_capabilities", set())

        selected: list[Any] = []
        boundary: set[str] = set(causal_boundary or set())
        scores: dict[str, float] = {}

        for event in events:
            event_id = getattr(event, "event_id", "")
            event_type = getattr(event, "event_type", "")

            # Time range filter
            ts_str = getattr(event, "timestamp", "")
            if time_range and ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    if time_range[0] and ts < time_range[0]:
                        boundary.add(event_id)
                        continue
                    if time_range[1] and ts > time_range[1]:
                        boundary.add(event_id)
                        continue
                except (ValueError, TypeError):
                    pass

            # Relevance scoring (v1: simple heuristic)
            score = 0.5  # default relevance
            if event_type in allowed:
                score = 1.0
            elif allowed and event_type not in allowed:
                score = 0.1

            scores[event_id] = score
            selected.append(event)

        return cls(
            events=tuple(selected),
            role_name=role_name,
            causal_boundary=frozenset(boundary),
            time_range=time_range or (None, None),
            relevance_scores=scores,
        )

    @property
    def event_count(self) -> int:
        return len(self.events)
