"""CausalEdge and CausalGraph — typed causal relationships between events/leases/state versions.

Imports ``CausalEdgeType`` from SM-IR (``state_dag.py``) — the canonical
enum definition.  TEM-IR enriches NBK's untyped ``Edge`` into typed
``CausalEdge`` through promotion factories that emit ``PromotionReceipt``
objects.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

from .state_dag import CausalEdgeType, StateVersion
from .promotion_receipt import PromotionReceipt


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── CausalEdge ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CausalEdge:
    """A typed causal relationship between two nodes.

    Attributes:
        from_id: Source node ID (event, lease, or state version).
        to_id: Target node ID.
        edge_type: The semantic relationship (causes, enables, etc.).
        timestamp: When the edge was created.
        metadata: Arbitrary context.
        promotion_receipt: How this edge was promoted from a raw NBK Edge.
    """

    from_id: str
    to_id: str
    edge_type: CausalEdgeType = CausalEdgeType.CAUSED_BY
    timestamp: datetime = field(default_factory=_utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)
    promotion_receipt: PromotionReceipt | None = None

    @classmethod
    def from_nbk_edge(
        cls,
        edge: Any,  # duck-typed NBK Edge (has from_id, to_id)
        edge_type: CausalEdgeType,
        metadata: dict[str, Any] | None = None,
    ) -> "CausalEdge":
        """Promote a raw NBK Edge into a typed CausalEdge."""
        return cls(
            from_id=getattr(edge, "from_id", str(edge)),
            to_id=getattr(edge, "to_id", ""),
            edge_type=edge_type,
            metadata=metadata or {},
            promotion_receipt=PromotionReceipt(
                from_type="Edge",
                from_id=f"{getattr(edge, 'from_id', '?')}→{getattr(edge, 'to_id', '?')}",
                to_type="CausalEdge",
                to_id="",
                stage="causality_inference",
                metadata={
                    "inferred_type": edge_type.value,
                    **(metadata or {}),
                },
            ),
        )

    @classmethod
    def from_state_versions(cls, parent: StateVersion, child: StateVersion) -> "CausalEdge":
        """Promote two StateVersions into a typed CausalEdge.

        Uses the child's ``edge_type`` to determine the causal relationship.
        """
        ce = cls(
            from_id=parent.version_id,
            to_id=child.version_id,
            edge_type=child.edge_type,
            metadata={
                "parent_source_event": parent.source_event_id,
                "child_source_event": child.source_event_id,
            },
            promotion_receipt=PromotionReceipt(
                from_type="StateVersion",
                from_id=parent.version_id,
                to_type="CausalEdge",
                to_id="",
                stage="temporal_annotation",
                metadata={
                    "edge_type": child.edge_type.value,
                    "parent_event": parent.source_event_id,
                    "child_event": child.source_event_id,
                },
            ),
        )
        # Update receipt with the edge's identity
        object.__setattr__(ce, "promotion_receipt", PromotionReceipt(
            receipt_id=ce.promotion_receipt.receipt_id,
            from_type=ce.promotion_receipt.from_type,
            from_id=ce.promotion_receipt.from_id,
            to_type=ce.promotion_receipt.to_type,
            to_id=f"{parent.version_id}→{child.version_id}",
            stage=ce.promotion_receipt.stage,
            metadata=ce.promotion_receipt.metadata,
            timestamp=ce.promotion_receipt.timestamp,
            compiler_version=ce.promotion_receipt.compiler_version,
        ))
        return ce

    def to_dict(self) -> dict:
        d = asdict(self)
        d["edge_type"] = self.edge_type.value
        d["timestamp"] = self.timestamp.isoformat()
        if self.promotion_receipt:
            d["promotion_receipt"] = self.promotion_receipt.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "CausalEdge":
        data = dict(d)
        if "edge_type" in data and isinstance(data["edge_type"], str):
            data["edge_type"] = CausalEdgeType(data["edge_type"])
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        if data.get("promotion_receipt") and isinstance(data["promotion_receipt"], dict):
            data["promotion_receipt"] = PromotionReceipt.from_dict(data["promotion_receipt"])
        return cls(**data)


# ── CausalGraph ───────────────────────────────────────────────────────


@dataclass
class CausalGraph:
    """A directed acyclic graph of typed causal edges.

    Supports traversal, ancestry queries, path finding, and cycle detection.
    """

    _edges: list[CausalEdge] = field(default_factory=list)
    _outgoing: dict[str, list[CausalEdge]] = field(default_factory=dict)
    _incoming: dict[str, list[CausalEdge]] = field(default_factory=dict)

    # ── Mutation ──────────────────────────────────────────────────────

    def add_edge(self, edge: CausalEdge) -> None:
        """Add a causal edge to the graph."""
        self._edges.append(edge)
        self._outgoing.setdefault(edge.from_id, []).append(edge)
        self._incoming.setdefault(edge.to_id, []).append(edge)

    # ── Query ─────────────────────────────────────────────────────────

    @property
    def edges(self) -> tuple[CausalEdge, ...]:
        return tuple(self._edges)

    @property
    def nodes(self) -> set[str]:
        """All unique node IDs in the graph.  O(n) — computed on each access."""
        nodes: set[str] = set()
        for e in self._edges:
            nodes.add(e.from_id)
            nodes.add(e.to_id)
        return nodes

    def outgoing(self, node_id: str) -> list[CausalEdge]:
        """Edges where this node is the source."""
        return self._outgoing.get(node_id, [])

    def incoming(self, node_id: str) -> list[CausalEdge]:
        """Edges where this node is the target."""
        return self._incoming.get(node_id, [])

    def ancestors(self, node_id: str) -> set[str]:
        """All nodes that (transitively) caused/enabled this node (BFS backwards)."""
        result: set[str] = set()
        queue: deque[str] = deque([node_id])
        while queue:
            nid = queue.popleft()
            if nid in result:
                continue
            if nid != node_id:
                result.add(nid)
            for edge in self._incoming.get(nid, []):
                if edge.from_id not in result:
                    queue.append(edge.from_id)
        return result

    def descendants(self, node_id: str) -> set[str]:
        """All nodes that this node (transitively) caused/enabled (BFS forwards)."""
        result: set[str] = set()
        queue: deque[str] = deque([node_id])
        while queue:
            nid = queue.popleft()
            if nid in result:
                continue
            if nid != node_id:
                result.add(nid)
            for edge in self._outgoing.get(nid, []):
                if edge.to_id not in result:
                    queue.append(edge.to_id)
        return result

    def is_ancestor(self, a: str, b: str) -> bool:
        """True if ``a`` is a causal ancestor of ``b``."""
        return a in self.ancestors(b)

    def is_descendant(self, a: str, b: str) -> bool:
        """True if ``a`` is a causal descendant of ``b``."""
        return a in self.descendants(b)

    def find_path(self, from_id: str, to_id: str) -> list[CausalEdge] | None:
        """Shortest causal path between two nodes, or None (BFS)."""
        if from_id == to_id:
            return []

        queue: deque[tuple[str, list[CausalEdge]]] = deque([(from_id, [])])
        visited: set[str] = set()

        while queue:
            nid, path = queue.popleft()
            if nid in visited:
                continue
            visited.add(nid)

            for edge in self._outgoing.get(nid, []):
                new_path = list(path) + [edge]
                if edge.to_id == to_id:
                    return new_path
                queue.append((edge.to_id, new_path))

        return None

    def is_dag(self) -> bool:
        """True if the graph has no cycles (topological sort succeeds)."""
        indegree: dict[str, int] = {}
        for node in self.nodes:
            indegree[node] = len(self.incoming(node))

        queue: deque[str] = deque(n for n, d in indegree.items() if d == 0)
        visited = 0

        while queue:
            nid = queue.popleft()
            visited += 1
            for edge in self.outgoing(nid):
                indegree[edge.to_id] -= 1
                if indegree[edge.to_id] == 0:
                    queue.append(edge.to_id)

        return visited == len(indegree)

    # ── Serialization ─────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "edges": [e.to_dict() for e in self._edges],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CausalGraph":
        graph = cls()
        for ed in d.get("edges", []):
            graph.add_edge(CausalEdge.from_dict(ed))
        return graph
