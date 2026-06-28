"""
IdentityEngine — node_id → identity_id resolution for the WRP kernel.

Identity resolution ensures that the same conceptual entity appearing in
different deltas resolves to the same identity. This is critical for:
  - Graph edge continuity across plan versions
  - Lineage tracking across the full event history
  - Cross-plan reference integrity

Identity is NOT a policy engine. It is a deterministic mapping:
  identity_id = f(node_id, context)
where f is stable across replays.

Design reference: kernel-projection-answers.md §4 (identity.py)
"""

from dataclasses import dataclass, field
from typing import Dict, Set, Optional


@dataclass
class Identity:
    """A resolved identity node.

    Fields:
        id: Canonical identity ID (e.g., "iden::plan_0053").
        aliases: Set of all node_ids that resolve to this identity.
        label: Optional human-readable label.
    """
    id: str
    aliases: Set[str] = field(default_factory=set)
    label: Optional[str] = None

    def add_alias(self, alias: str) -> None:
        self.aliases.add(alias)


class IdentityEngine:
    """Deterministic identity resolution engine.

    Maps node_ids (from receipts, plans, entities) to stable identity IDs.
    The mapping is built incrementally as deltas are processed.

    Invariant: resolve(node_id, plan_id) always returns the same identity_id
    for the same (node_id, plan_id) pair within a single engine instance.
    """

    def __init__(self) -> None:
        # node_id → identity_id
        self._node_map: Dict[str, str] = {}
        # identity_id → Identity
        self._identities: Dict[str, Identity] = {}

    def resolve(self, node_id: str, plan_id: str = "") -> str:
        """Resolve a node_id to a stable identity_id.

        If the node_id has been seen before, returns the existing identity_id.
        Otherwise creates a new identity.

        Args:
            node_id: The raw node identifier (e.g., a plan number or entity ref).
            plan_id: Optional plan context for disambiguation.

        Returns:
            A stable identity_id string.
        """
        if node_id in self._node_map:
            return self._node_map[node_id]

        identity_id = f"iden::{node_id}"
        identity = Identity(
            id=identity_id,
            aliases={node_id},
            label=plan_id or None,
        )
        self._node_map[node_id] = identity_id
        self._identities[identity_id] = identity
        return identity_id

    def get_identity(self, identity_id: str) -> Optional[Identity]:
        """Look up an Identity by its identity_id."""
        return self._identities.get(identity_id)

    def get_identity_for_node(self, node_id: str) -> Optional[Identity]:
        """Look up an Identity by its original node_id."""
        iid = self._node_map.get(node_id)
        if iid is None:
            return None
        return self._identities.get(iid)

    def known_count(self) -> int:
        """Return the number of unique identities tracked."""
        return len(self._identities)

    def reset(self) -> None:
        """Clear all identity state. Used for test isolation."""
        self._node_map.clear()
        self._identities.clear()
