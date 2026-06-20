"""CER writer — event creation and execution ID generation.

Provides factory functions for building CEREvent instances with
deterministic event IDs and configurable timestamps.

The scheduler uses these factories to emit events for each node state
transition (NODE_START, NODE_COMPLETE, NODE_FAIL, NODE_SKIP).
"""

from __future__ import annotations

import datetime
import hashlib
from typing import Callable

from meep.models import CEREvent, CEREventType

# Callable that returns an ISO 8601 UTC timestamp string.
ClockFn = Callable[[], str]


def utc_clock() -> str:
    """Default clock — returns the current UTC time as an ISO 8601 string."""
    return datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def make_execution_id(graph_hash: str) -> str:
    """Generate a deterministic execution ID from the graph's content hash.

    Args:
        graph_hash: The ExecutionGraph.content_hash() value.

    Returns:
        A short hex execution ID.
    """
    return f"ex-{graph_hash[:12]}"


class EventIdGenerator:
    """Deterministic event ID counter.

    Produces IDs of the form ``evt-{execution_id}-{counter:04d}``.
    """

    def __init__(self, execution_id: str) -> None:
        self._execution_id = execution_id
        self._counter: int = 0

    def next_id(self) -> str:
        """Generate the next event ID in sequence."""
        self._counter += 1
        return f"evt-{self._execution_id}-{self._counter:04d}"


def make_node_start(
    event_id: str,
    timestamp: str,
    execution_id: str,
    node_id: str,
    handler: str,
) -> CEREvent:
    """Create a NODE_START event.

    Args:
        event_id: Unique event identifier.
        timestamp: ISO 8601 UTC timestamp.
        execution_id: Execution run identifier.
        node_id: The node being started.
        handler: The handler name being invoked.

    Returns:
        A CEREvent with type NODE_START.
    """
    return CEREvent(
        event_id=event_id,
        timestamp=timestamp,
        execution_id=execution_id,
        node_id=node_id,
        event_type="NODE_START",
        payload={"handler": handler},
    )


def make_node_complete(
    event_id: str,
    timestamp: str,
    execution_id: str,
    node_id: str,
    result: dict,
) -> CEREvent:
    """Create a NODE_COMPLETE event.

    Args:
        event_id: Unique event identifier.
        timestamp: ISO 8601 UTC timestamp.
        execution_id: Execution run identifier.
        node_id: The node that completed.
        result: The handler's result dict (becomes the event payload).

    Returns:
        A CEREvent with type NODE_COMPLETE.
    """
    return CEREvent(
        event_id=event_id,
        timestamp=timestamp,
        execution_id=execution_id,
        node_id=node_id,
        event_type="NODE_COMPLETE",
        payload=result,
    )
