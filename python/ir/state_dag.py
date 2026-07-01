"""StateDAG — versioned, causally-addressable state with no in-place mutation.

Every mutation creates a new StateVersion linked to its causal parents.
State is a directed acyclic graph, not a flat value.  This is the SM-IR
memory substrate — the foundation for all downstream IR layers.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any
import hashlib
import json
import uuid

from .promotion_receipt import PromotionReceipt


# ── Causal Edge Types ─────────────────────────────────────────────────


class CausalEdgeType(str, Enum):
    """Typed causal relationship between state versions.

    Defined here for SM-IR self-containment.  TEM-IR will import and
    extend this enum with time-layer semantics.
    """

    CAUSED_BY = "caused_by"       # Standard event → state derivation
    ENABLES = "enables"           # This version makes another possible
    INVALIDATES = "invalidates"   # This version renders a prior version obsolete
    REFINES = "refines"           # This version is a more-detailed version


# ── StateVersionId ────────────────────────────────────────────────────


StateVersionId = str  # UUID string


# ── StateVersion ──────────────────────────────────────────────────────


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class StateVersion:
    """An immutable snapshot of state at a point in causal time.

    Once created, a StateVersion is never modified.  Every mutation
    produces a *new* StateVersion linked to its causal parents.
    """

    version_id: StateVersionId = field(default_factory=lambda: str(uuid.uuid4()))
    data: dict[str, Any] = field(default_factory=dict)
    causal_parents: list[StateVersionId] = field(default_factory=list)
    source_event_id: str = ""
    edge_type: CausalEdgeType = CausalEdgeType.CAUSED_BY
    timestamp: datetime = field(default_factory=_utc_now)
    hash: str = ""  # content-addressable — set by StateDAG.mutate()
    promotion_receipt: PromotionReceipt | None = None

    def __post_init__(self):
        if not self.hash:
            object.__setattr__(self, "hash", self._compute_hash())

    def _compute_hash(self) -> str:
        """Content-addressable integrity hash.

        Pure function of data, parents, and provenance — NOT identity.
        Two versions with identical content + parents will have the same hash.
        """
        content = json.dumps({
            "data": self.data,
            "causal_parents": sorted(self.causal_parents),
            "source_event_id": self.source_event_id,
            "edge_type": self.edge_type.value,
        }, sort_keys=True)
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        d = asdict(self)
        d["edge_type"] = self.edge_type.value
        d["timestamp"] = self.timestamp.isoformat()
        if self.promotion_receipt:
            d["promotion_receipt"] = self.promotion_receipt.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "StateVersion":
        data = dict(d)
        if "edge_type" in data and isinstance(data["edge_type"], str):
            data["edge_type"] = CausalEdgeType(data["edge_type"])
        if "timestamp" in data and isinstance(data["timestamp"], str):
            data["timestamp"] = datetime.fromisoformat(data["timestamp"])
        if data.get("promotion_receipt") and isinstance(data["promotion_receipt"], dict):
            data["promotion_receipt"] = PromotionReceipt.from_dict(data["promotion_receipt"])
        return cls(**data)


# ── StateDAG ──────────────────────────────────────────────────────────


@dataclass
class StateDAG:
    """A versioned, causally-addressable state DAG.

    Supports branching (multiple heads) from day one.  Every mutation
    creates a new StateVersion via version expansion — never in-place.
    """

    _versions: dict[StateVersionId, StateVersion] = field(default_factory=dict)
    _heads: set[StateVersionId] = field(default_factory=set)
    _edges: list[tuple[StateVersionId, StateVersionId, CausalEdgeType]] = field(default_factory=list)

    # ── Query ─────────────────────────────────────────────────────────

    @property
    def heads(self) -> tuple[StateVersionId, ...]:
        """The latest version(s).  Multiple heads = branching."""
        return tuple(self._heads)

    @property
    def version_count(self) -> int:
        return len(self._versions)

    def get_version(self, version_id: StateVersionId) -> StateVersion | None:
        """Retrieve a specific version by ID."""
        return self._versions.get(version_id)

    def get_head(self) -> StateVersion | None:
        """The single head if no branching, or the first head otherwise."""
        if self._heads:
            return self._versions[next(iter(self._heads))]
        return None

    def parents_of(self, version_id: StateVersionId) -> list[StateVersion]:
        """Return the causal parents of a version."""
        v = self._versions.get(version_id)
        if not v:
            return []
        return [self._versions[pid] for pid in v.causal_parents if pid in self._versions]

    def children_of(self, version_id: StateVersionId) -> list[StateVersion]:
        """Return all versions that list this one as a causal parent."""
        return [
            sv for sv in self._versions.values()
            if version_id in sv.causal_parents
        ]

    def walk_backward(self, version_id: StateVersionId) -> list[StateVersion]:
        """Return the causal lineage from a version back to genesis (BFS)."""
        result: list[StateVersion] = []
        visited: set[StateVersionId] = set()
        queue: deque[str] = deque([version_id])
        while queue:
            vid = queue.popleft()
            if vid in visited:
                continue
            visited.add(vid)
            v = self._versions.get(vid)
            if v:
                result.append(v)
                queue.extend(v.causal_parents)
        return result

    # ── Mutation (version expansion) ──────────────────────────────────

    def mutate(
        self,
        delta: dict[str, Any],
        source_event_id: str = "",
        edge_type: CausalEdgeType = CausalEdgeType.CAUSED_BY,
        heads: list[StateVersionId] | None = None,
    ) -> StateVersion:
        """Create a new StateVersion as version expansion.

        Args:
            delta: The state change to apply.
            source_event_id: The event that caused this mutation (provenance).
            edge_type: The causal relationship to parent versions.
            heads: Which version(s) to derive from.  Defaults to current heads.

        Returns:
            The newly created StateVersion.

        Raises:
            ValueError: If specified heads don't exist in the DAG.
        """
        parent_ids = heads if heads is not None else list(self._heads)

        # Validate parents exist
        for pid in parent_ids:
            if pid not in self._versions:
                raise ValueError(f"Parent version {pid} not found in DAG")

        # Merge data from all parents, then apply delta
        merged_data: dict[str, Any] = {}
        for pid in parent_ids:
            merged_data.update(self._versions[pid].data)
        merged_data.update(delta)

        version_id = str(uuid.uuid4())

        receipt = PromotionReceipt(
            from_type="ExecutionState|StateVersion",
            from_id=",".join(parent_ids) if parent_ids else "genesis",
            to_type="StateVersion",
            to_id=version_id,
            stage="replay_snapshot",
            metadata={
                "parent_count": len(parent_ids),
                "edge_type": edge_type.value,
            },
        )

        version = StateVersion(
            version_id=version_id,
            data=merged_data,
            causal_parents=list(parent_ids),
            source_event_id=source_event_id,
            edge_type=edge_type,
            promotion_receipt=receipt,
        )

        self._versions[version.version_id] = version
        for pid in parent_ids:
            self._edges.append((pid, version.version_id, edge_type))

        # Update heads: remove parents, add new version
        self._heads.difference_update(parent_ids)
        self._heads.add(version.version_id)

        return version

    # ── Serialization ─────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "versions": {
                vid: v.to_dict() for vid, v in self._versions.items()
            },
            "heads": list(self._heads),
            "edges": [
                {"from": frm, "to": to, "type": typ.value}
                for frm, to, typ in self._edges
            ],
        }

    @classmethod
    def from_dict(cls, d: dict) -> "StateDAG":
        dag = cls()
        dag._versions = {
            vid: StateVersion.from_dict(vd)
            for vid, vd in d.get("versions", {}).items()
        }
        dag._heads = set(d.get("heads", []))
        dag._edges = [
            (e["from"], e["to"], CausalEdgeType(e["type"]))
            for e in d.get("edges", [])
        ]
        return dag
