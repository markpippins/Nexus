"""
KernelDelta — the sole input type to the WRP kernel Reduce function.

A KernelDelta represents one batch of state-changing events. It is the
smallest unit of work the kernel processes atomically.

Design invariants:
  - Every KernelDelta is idempotent (applying it twice yields same state)
  - Deltas are ordered by version (monotonic, no gaps)
  - Same batch_id + same receipts = identical delta (replay consistency)
"""

from dataclasses import dataclass, field
from typing import List, Set, Optional


@dataclass(frozen=True)
class KernelDelta:
    """A single atomic batch of state change for the WRP kernel.

    Fields:
        delta_id: Globally unique identifier for this delta.
        batch_id: Logical batch grouping (may span multiple deltas).
        receipts: List of raw Conduit receipt dicts to process.
        affected_plans: Set of plan IDs touched by this delta.
        invalidated_plans: Set of plan IDs whose cached state is invalidated.
        version: Monotonic version number assigned at commit time.
    """
    delta_id: str
    batch_id: str
    receipts: List[dict] = field(default_factory=list)
    affected_plans: Set[str] = field(default_factory=set)
    invalidated_plans: Set[str] = field(default_factory=set)
    version: int = 0

    def __post_init__(self):
        if not self.delta_id:
            raise ValueError("delta_id is required")
        if self.version < 0:
            raise ValueError(f"version must be >= 0, got {self.version}")


@dataclass(frozen=True)
class KernelDeltaBatch:
    """A sequenced list of KernelDeltas ready for replay.

    Fields:
        batch_id: Logical batch identifier.
        deltas: Ordered list of KernelDelta instances.
        source_hash: Optional provenance hash linking back to harvest.
    """
    batch_id: str
    deltas: List[KernelDelta] = field(default_factory=list)
    source_hash: Optional[str] = None

    def total_receipts(self) -> int:
        return sum(len(d.receipts) for d in self.deltas)
