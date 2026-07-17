"""
GraphIndex — identity-based typed edge graph for the WRP kernel.

The GraphIndex is an adjacency list that maps source identity IDs to
their outgoing edges. Edges are typed using the crossref_taxonomy
relation types (wrp:depends_on, wrp:supersedes, etc.).

Design:
  - Identity-based: edges connect identity_ids, not raw node_ids
  - Typed: each edge has a relation from crossref_taxonomy
  - Append-only: edges are added, never silently removed
  - Replayable: same deltas → same graph state

Design reference: kernel-projection-answers.md §5 (graph.py)
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set


@dataclass(frozen=True)
class GraphEdge:
    """A typed edge between two identity nodes.

    Fields:
        source: Source identity_id.
        target: Target identity_id.
        relation: Relation type from crossref_taxonomy
                  (e.g., "wrp:depends_on", "wrp:supersedes").
        metadata: Optional dict with additional context.
    """
    source: str
    target: str
    relation: str
    metadata: Optional[dict] = None


class GraphIndex:
    """Identity-based adjacency list graph.

    Maps source identity IDs to their outgoing typed edges.
    Supports forward traversal and k-hop expansion.
    """

    def __init__(self) -> None:
        # source_id → list of outgoing GraphEdge
        self._adjacency: Dict[str, List[GraphEdge]] = {}
        # target_id → list of incoming GraphEdge (for reverse traversal)
        self._incoming: Dict[str, List[GraphEdge]] = {}

    def add(self, edge: GraphEdge) -> None:
        """Add an edge to the graph.

        Edges are deduplicated by (source, target, relation).
        """
        existing = self._adjacency.setdefault(edge.source, [])
        # Deduplicate
        for e in existing:
            if e.source == edge.source and e.target == edge.target and e.relation == edge.relation:
                return
        existing.append(edge)

        incoming = self._incoming.setdefault(edge.target, [])
        incoming.append(edge)

    def remove(self, edge: GraphEdge) -> None:
        """Remove a specific edge from the graph."""
        self._adjacency[edge.source] = [
            e for e in self._adjacency.get(edge.source, [])
            if not (e.source == edge.source and e.target == edge.target and e.relation == edge.relation)
        ]
        self._incoming[edge.target] = [
            e for e in self._incoming.get(edge.target, [])
            if not (e.source == edge.source and e.target == edge.target and e.relation == edge.relation)
        ]

    def edges_from(self, source_id: str) -> List[GraphEdge]:
        """Get all outgoing edges from a source identity."""
        return list(self._adjacency.get(source_id, []))

    def edges_to(self, target_id: str) -> List[GraphEdge]:
        """Get all incoming edges to a target identity."""
        return list(self._incoming.get(target_id, []))

    def traverse(self, start_id: str, relation: Optional[str] = None, depth: int = 1) -> List[GraphEdge]:
        """Traverse the graph k-hop from start_id.

        Args:
            start_id: Starting identity_id.
            relation: Optional relation type filter.
            depth: Maximum hop depth (1 = direct neighbors only).

        Returns:
            List of all edges reachable within `depth` hops.
        """
        visited: Set[str] = set()
        results: List[GraphEdge] = []
        current_layer = {start_id}

        for _ in range(depth):
            next_layer: Set[str] = set()
            for node_id in current_layer:
                if node_id in visited:
                    continue
                visited.add(node_id)
                for edge in self._adjacency.get(node_id, []):
                    if relation is None or edge.relation == relation:
                        results.append(edge)
                        next_layer.add(edge.target)
            current_layer = next_layer
            if not current_layer:
                break

        return results

    def all_edges(self) -> List[GraphEdge]:
        """Return all edges in the graph."""
        seen: Set[tuple] = set()
        result: List[GraphEdge] = []
        for edges in self._adjacency.values():
            for e in edges:
                key = (e.source, e.target, e.relation)
                if key not in seen:
                    seen.add(key)
                    result.append(e)
        return result

    def node_count(self) -> int:
        """Return the number of unique source nodes."""
        return len(self._adjacency)

    def edge_count(self) -> int:
        """Return the number of unique edges."""
        return len(self.all_edges())

    def remove_node(self, node_id: str) -> None:
        """Remove a node and all its edges from the graph.

        Args:
            node_id: The identity_id of the node to remove.
        """
        # Remove outgoing edges
        self._adjacency.pop(node_id, None)
        # Remove incoming edges (scan all adjacency lists)
        for source in list(self._adjacency.keys()):
            self._adjacency[source] = [
                e for e in self._adjacency[source]
                if e.target != node_id
            ]

    def reset(self) -> None:
        """Clear all graph state. Used for test isolation."""
        self._adjacency.clear()
        self._incoming.clear()
