"""IntentGraph — structured intent derived from an EventProjection.

Represents *what needs to be done* — extracted from events and organized
into a graph of intent nodes and dependency edges.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import uuid


@dataclass(frozen=True)
class IntentNode:
    """A single intent — a unit of work derived from events."""

    node_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    label: str = ""
    description: str = ""
    source_event_ids: tuple[str, ...] = field(default_factory=tuple)
    priority: float = 0.5
    required_capabilities: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class IntentEdge:
    """A dependency between intent nodes."""

    source_id: str
    target_id: str
    relation: str = "depends_on"  # "depends_on" | "enables" | "conflicts_with"


@dataclass(frozen=True)
class IntentGraph:
    """Structured intent derived from event projection.

    Represents the second stage of the compilation pipeline:
    EventProjection → IntentGraph.
    """

    graph_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    nodes: list[IntentNode] = field(default_factory=list)
    edges: list[IntentEdge] = field(default_factory=list)
    role_name: str = ""

    @classmethod
    def from_events(cls, projection: Any) -> "IntentGraph":
        """Build an IntentGraph from an EventProjection.

        v1: Simple one-node-per-event mapping.  Each event becomes an
        intent node.  Future versions will merge related events and
        infer dependencies.
        """
        events = getattr(projection, "events", [])
        role_name = getattr(projection, "role_name", "")
        scores = getattr(projection, "relevance_scores", {})

        nodes: list[IntentNode] = []
        for event in events:
            event_id = getattr(event, "event_id", "")
            event_type = getattr(event, "event_type", "")
            payload = getattr(event, "payload", {})

            node = IntentNode(
                label=f"{event_type}:{event_id}",
                description=payload.get("result", payload.get("handler", event_type)),
                source_event_ids=(event_id,),
                priority=scores.get(event_id, 0.5),
                required_capabilities=("execute",),
            )
            nodes.append(node)

        return cls(
            nodes=nodes,
            role_name=role_name,
        )
