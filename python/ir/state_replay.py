"""StateReplayEngine — replays a MEEP CERLog into a StateDAG.

Bridges the existing MEEP event log (CEREvent hash chain) into the
SM-IR StateDAG (versioned, causally-addressable state).  Each CEREvent
maps to a StateVersion via the _event_to_delta() translation layer.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .state_dag import StateDAG, CausalEdgeType
from .state_view import StateView


class StateReplayEngine:
    """Replays a CERLog into a versioned StateDAG.

    Usage::

        engine = StateReplayEngine()
        dag = engine.replay(cer_log)
        view = StateView.project(dag, {"role": "builder", "capabilities": set()})
    """

    def replay(
        self,
        events: list[Any],  # list[CEREvent] — duck-typed to avoid circular import
    ) -> StateDAG:
        """Replay a sequence of CER events into a StateDAG.

        Args:
            events: List of CEREvent-compatible objects (duck-typed:
                    must have event_id, event_type, node_id, payload, timestamp).

        Returns:
            StateDAG with one StateVersion per event, causally chained.
        """
        dag = StateDAG()

        for event in events:
            delta = self._event_to_delta(event)
            edge_type = self._event_to_edge_type(event)
            dag.mutate(
                delta=delta,
                source_event_id=event.event_id,
                edge_type=edge_type,
            )

        return dag

    @staticmethod
    def _event_to_delta(event: Any) -> dict[str, Any]:
        """Translate a MEEP CEREvent into a SM-IR state delta.

        Mapping:
            NODE_START    → node state = RUNNING
            NODE_COMPLETE → node state = COMPLETED, add result to completed list
            NODE_FAIL     → node state = FAILED, add to failed list
            NODE_SKIP     → node state = SKIPPED
        """
        event_type = getattr(event, "event_type", "")
        node_id = getattr(event, "node_id", "")
        payload = getattr(event, "payload", {})

        delta: dict[str, Any] = {}

        if event_type == "NODE_START":
            delta[f"node:{node_id}:state"] = "RUNNING"
            if "handler" in payload:
                delta[f"node:{node_id}:handler"] = payload["handler"]

        elif event_type == "NODE_COMPLETE":
            delta[f"node:{node_id}:state"] = "COMPLETED"
            delta[f"completed_nodes"] = f"+{node_id}"
            if "result" in payload:
                delta[f"node:{node_id}:result"] = payload["result"]

        elif event_type == "NODE_FAIL":
            delta[f"node:{node_id}:state"] = "FAILED"
            delta[f"failed_nodes"] = f"+{node_id}"
            if "error" in payload:
                delta[f"node:{node_id}:error"] = payload["error"]

        elif event_type == "NODE_SKIP":
            delta[f"node:{node_id}:state"] = "SKIPPED"
            if "reason" in payload:
                delta[f"node:{node_id}:skip_reason"] = payload["reason"]

        # Always track event count
        delta["event_count"] = "+1"
        delta[f"last_event:type"] = event_type
        delta[f"last_event:node"] = node_id

        return delta

    @staticmethod
    def _event_to_edge_type(event: Any) -> CausalEdgeType:
        """Map event type to causal edge type."""
        event_type = getattr(event, "event_type", "")
        if event_type == "NODE_FAIL":
            return CausalEdgeType.INVALIDATES
        if event_type == "NODE_SKIP":
            return CausalEdgeType.INVALIDATES
        return CausalEdgeType.CAUSED_BY
