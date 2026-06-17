from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class Node:
    id: str
    type: str
    data: Any = None


@dataclass
class Edge:
    src: str
    dst: str
    relation: str


@dataclass
class Graph:
    nodes: Dict[str, Node] = field(default_factory=dict)
    edges: List[Edge] = field(default_factory=list)

    def _equal(self, other: "Graph") -> bool:
        return (
            set(self.nodes.keys()) == set(other.nodes.keys()) and
            len(self.edges) == len(other.edges)
        )


__all__ = ["Graph", "Node", "Edge"]
