"""
KernelSnapshot — versioned state checkpoints for the WRP kernel.

This module re-exports KernelSnapshot from nexus_core.wrp.kernel (the canonical
definition). The SnapshotStore (in-memory store with nearest-ancestor lookup)
is conduit-specific and remains here.

Snapshots are checkpoints of KernelState at a specific version. They
accelerate reconstruction by allowing the system to start from the
closest previous checkpoint and replay only intervening deltas.

Design:
  - Snapshots are immutable once written (version is the PK)
  - Reconstruction: Snapshot(K) + Replay(deltas K+1 → N)
  - K = closest valid snapshot ≤ target_version
  - Snapshots are an acceleration layer, NOT the source of truth
  - The source of truth is the kernel_delta_log

Design reference: kernel-projection-answers.md §7 (snapshot.py + KSRA)
"""

from typing import Dict, List, Optional

from nexus_core.wrp.kernel import KernelSnapshot


class SnapshotStore:
    """In-memory snapshot store with nearest-ancestor lookup.

    Supports the Kernel Snapshot Reconstruction Algorithm (KSRA):
      KernelState(N) = Snapshot(K) + Replay(deltas K+1 → N)
      where K = closest valid snapshot ≤ N
    """

    def __init__(self) -> None:
        self._snapshots: Dict[int, KernelSnapshot] = {}

    def put(self, snapshot: KernelSnapshot) -> None:
        """Store a snapshot indexed by version."""
        self._snapshots[snapshot.version] = snapshot

    def get(self, version: int) -> Optional[KernelSnapshot]:
        """Get a snapshot at exactly this version."""
        return self._snapshots.get(version)

    def find_nearest(self, target_version: int) -> Optional[KernelSnapshot]:
        """Find the closest snapshot with version ≤ target_version.

        This is the core KSRA selection algorithm:
          K = max(version in snapshots where version ≤ target_version)

        Args:
            target_version: The target version to reconstruct to.

        Returns:
            The closest valid snapshot, or None if no snapshot exists.
        """
        candidates = [
            s for s in self._snapshots.values()
            if s.version <= target_version
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda s: s.version)

    def latest(self) -> Optional[KernelSnapshot]:
        """Get the snapshot with the highest version number."""
        if not self._snapshots:
            return None
        max_version = max(self._snapshots.keys())
        return self._snapshots[max_version]

    def all_versions(self) -> List[int]:
        """Return all snapshot version numbers, sorted."""
        return sorted(self._snapshots.keys())

    def count(self) -> int:
        return len(self._snapshots)

    def reset(self) -> None:
        """Clear all snapshots. Used for test isolation."""
        self._snapshots.clear()


__all__ = ["KernelSnapshot", "SnapshotStore"]
