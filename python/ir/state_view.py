"""StateView — time-bounded, causality-filtered projection of a StateDAG.

Each lease (future) operates on a StateView: a filtered snapshot of the
DAG that respects the lease's role, capabilities, and temporal boundary.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .state_dag import StateDAG, StateVersion


@dataclass(frozen=True)
class StateView:
    """A filtered projection of a StateDAG for a specific lease context.

    Attributes:
        visible_state: The merged state data visible to this lease.
        version_ids: Which versions were included in this projection.
        causal_boundary: Version IDs at the edge of reachability.
        temporal_slice: Time range of included versions (start, end).
        lease_spec: The lease context used for filtering.
    """

    visible_state: dict[str, Any] = field(default_factory=dict)
    version_ids: list[str] = field(default_factory=list)
    causal_boundary: set[str] = field(default_factory=set)
    temporal_slice: tuple[datetime | None, datetime | None] = (None, None)
    lease_spec: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def project(
        dag: StateDAG,
        lease_spec: dict[str, Any],
        time_range: tuple[datetime, datetime] | None = None,
        causal_depth: int | None = None,
    ) -> StateView:
        """Project a filtered StateView from a StateDAG.

        Args:
            dag: The StateDAG to project from.
            lease_spec: Lease context — ``{"role": "builder", "capabilities": {...}}``.
                        v1: used for filtering; v2: will integrate GP-IR policies.
            time_range: Optional (start, end) to bound included versions by time.
            causal_depth: Optional max number of causal steps back from head.

        Returns:
            A StateView with the filtered snapshot.
        """
        head_ids = set(dag.heads)
        if not head_ids:
            return StateView(lease_spec=lease_spec)

        # Walk backward from heads.  Heads start at depth 1 so that
        # causal_depth=1 means "only the heads", causal_depth=2 means
        # "heads + parents", etc.
        included: set[str] = set()
        boundary: set[str] = set()
        queue: list[tuple[str, int]] = [(hid, 1) for hid in head_ids]
        time_start, time_end = time_range if time_range else (None, None)

        while queue:
            vid, depth = queue.pop(0)
            if vid in included:
                continue

            # Depth limit
            if causal_depth is not None and depth > causal_depth:
                boundary.add(vid)
                continue

            version = dag.get_version(vid)
            if not version:
                continue

            # Time range filter
            if time_start and version.timestamp < time_start:
                boundary.add(vid)
                continue
            if time_end and version.timestamp > time_end:
                boundary.add(vid)
                continue

            included.add(vid)

            # Enqueue parents
            for pid in version.causal_parents:
                if pid not in included:
                    queue.append((pid, depth + 1))

        # Merge state from included versions ordered by timestamp (oldest first
        # so newer data overwrites older).  Use timestamp for reliable merge
        # ordering — NOT lexicographic UUID sort.
        visible: dict[str, Any] = {}
        versions = [dag.get_version(vid) for vid in included]
        sorted_versions = sorted(
            [v for v in versions if v is not None],
            key=lambda v: v.timestamp,
        )
        for v in sorted_versions:
            visible.update(v.data)

        return StateView(
            visible_state=visible,
            version_ids=sorted(included),
            causal_boundary=boundary,
            temporal_slice=(time_start, time_end),
            lease_spec=lease_spec,
        )

    def to_dict(self) -> dict:
        return {
            "visible_state": self.visible_state,
            "version_ids": self.version_ids,
            "causal_boundary": list(self.causal_boundary),
            "temporal_slice": [
                self.temporal_slice[0].isoformat() if self.temporal_slice[0] else None,
                self.temporal_slice[1].isoformat() if self.temporal_slice[1] else None,
            ],
            "lease_spec": self.lease_spec,
        }
