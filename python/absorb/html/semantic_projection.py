"""
SemanticProjection + SemanticProjectionBuilder

Design invariants:
- Deterministic: same envelopes -> same projection
- No dependency on GraphState
- No dependency on ReconstructedClosureSet
- Replay-safe (pure function of envelopes)
"""

from dataclasses import dataclass, field
from typing import List, Set, Tuple


@dataclass
class SemanticProjection:
    """Pure semantic projection derived from IR_EventEnvelope stream.

    This replaces ReconstructedClosureSet as the output artifact
    for the semantic projection layer. It is deterministic, replay-safe,
    and has no dependency on GraphState or canonical replay.
    """
    resolved_concepts: Set[str] = field(default_factory=set)
    resolves_edges: List[Tuple[str, str]] = field(default_factory=list)


class SemanticProjectionBuilder:
    """Builds a SemanticProjection from a stream of IR_EventEnvelope.

    Pure function. Deterministic. No external dependencies.
    Call as: SemanticProjectionBuilder.from_envelopes(envelopes)
    """

    @staticmethod
    def from_envelopes(envelopes) -> SemanticProjection:
        resolved = set()
        edges = []

        for e in envelopes:
            # Concept resolution lifecycle
            for c in getattr(e, "added_nodes", []):
                resolved.add(c)
            for c in getattr(e, "removed_nodes", []):
                resolved.discard(c)
            for c in getattr(e, "reintroduced_nodes", []):
                resolved.add(c)
            for c in getattr(e, "modified_nodes", []):
                resolved.add(c)

            # Edge semantics
            if hasattr(e, "emitted_edges"):
                edges.extend(e.emitted_edges)

        return SemanticProjection(
            resolved_concepts=resolved,
            resolves_edges=edges
        )
