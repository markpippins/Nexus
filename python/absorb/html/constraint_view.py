"""
ConstraintExtractor: Pure constraint extraction from IR_EventEnvelope stream.

Design invariants:
- Deterministic: same envelopes → same constraint list
- No dependency on ReconstructedClosureSet
- No dependency on GraphState
- Replay-safe (pure function of envelopes)
"""

from typing import List, Any
from graph_models import IR_EventEnvelope


class ConstraintExtractor:
    """Extracts constraints directly from IR_EventEnvelope stream.
    Pure function. No closure dependency."""

    @staticmethod
    def from_stream(envelopes: List[IR_EventEnvelope], trajectory_id: str) -> List[Any]:
        """Return accumulated constraints for a trajectory from the envelope stream."""
        constraints = []
        for e in envelopes:
            if e.trajectory_id == trajectory_id:
                constraints.extend(e.emitted_constraints)
        return constraints
