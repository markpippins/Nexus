"""
Mutation rules over StateDAG — re-ported from the nbk SOCO layer.

nbk (python/nbk) implemented two self-optimization rules against its
`NexusBootstrapKernel` execution kernel: `CollapseChainRule` (fuse a linear
pipeline segment into a single node) and `MergeIdleLeasesRule` (consolidate
idle leases under one executor). When nbk's fate was decided (dependency-map
thread `1a07a098`, Q2), the rules were split to their natural canonical
homes in python/ir:

  - CollapseChainRule  -> StateDAG mutation rule (this module). StateDAG is
    the versioned, append-only memory substrate, so the port is a
    semantics-preserving *derivation*: a linear chain A→B→C collapses into a
    single fused StateVersion carrying the chain's merged data, linked back
    to the chain head by a REFINES edge. Original versions are preserved
    (append-only invariant) and replay equivalence holds (the fused data is
    exactly the chain's terminal data).
  - MergeIdleLeasesRule -> LeasePool.consolidate_idle() (lease_pool.py), the
    canonical lease home.

Rules implement the `MutationRule` protocol: `applies(dag, version_id)`
predicate + `apply(dag, version_id)` returning affected version ids. Rules
are deterministic and must never violate replay equivalence.
"""

from __future__ import annotations

from typing import Any, List

from .state_dag import CausalEdgeType, StateDAG, StateVersion


class MutationRule:
    """Base protocol for deterministic, semantics-preserving DAG mutations."""

    def applies(self, dag: StateDAG, version_id: str) -> bool:
        """Return True if this rule should be applied to the given version."""
        raise NotImplementedError

    def apply(self, dag: StateDAG, version_id: str) -> List[str]:
        """Apply the rule to the DAG.

        Returns the list of affected version IDs.
        """
        raise NotImplementedError


class CollapseChainRule(MutationRule):
    """Collapse a linear causal chain A→B→C into a single fused version.

    Port of nbk's CollapseChainRule (rules.py) onto the versioned memory
    substrate. nbk fused *executable functions*; StateDAG stores *data*, so
    the equivalent semantics-preserving transformation is:

      - A version with exactly one causal parent and one causal child is a
        linear link in a pure chain.
      - Collapsing walks to the maximal linear chain containing it, then
        creates ONE new fused StateVersion whose data is the merge of every
        chain member's data (== the chain's terminal data, since StateDAG
        mutations merge parents into children).
      - The fused version's causal parents are the chain head's parents
        (external dependencies preserved), and a REFINES edge links the
        chain head → fused so lineage stays traceable.
      - Original versions are untouched — the append-only invariant holds,
        and replay of the chain produces the same terminal data (replay
        equivalence).
      - The fused version is added as a NEW head alongside the intact chain
        (dag.mutate updates the head set), so a collapsed chain ends with
        two heads {tail, fused} — branching is supported by design; callers
        iterating ``dag.heads`` should expect this.

    Usage::

        rule = CollapseChainRule()
        if rule.applies(dag, middle_id):
            affected = rule.apply(dag, middle_id)
    """

    def applies(self, dag: StateDAG, version_id: str) -> bool:
        version = dag.get_version(version_id)
        if version is None:
            return False
        parents = dag.parents_of(version_id)
        children = dag.children_of(version_id)
        # Exactly one input and one output = linear pipeline link.
        return len(parents) == 1 and len(children) == 1

    def apply(self, dag: StateDAG, version_id: str) -> List[str]:
        chain = self._maximal_linear_chain(dag, version_id)
        if len(chain) < 3:
            # A chain of length < 3 has nothing worth fusing (nbk fuses
            # A→B→C; a 2-node segment is just an edge).
            return []

        head_id, fused_data = chain[0], {}
        for vid in chain:
            v = dag.get_version(vid)
            if v is not None:
                fused_data.update(v.data)

        # New fused version: parents = chain head's parents (external deps).
        head_version = dag.get_version(head_id)
        parent_ids = list(head_version.causal_parents) if head_version else []
        for pid in parent_ids:
            if dag.get_version(pid) is None:
                return []  # malformed — don't touch the DAG

        # heads=parent_ids explicitly (NOT None): None means "current DAG
        # heads", which would wrongly re-parent the fused version onto the
        # chain tail. The fused version must hang off the chain head's OWN
        # external parents ([] for a genesis chain) to preserve lineage.
        fused = dag.mutate(
            delta=fused_data,
            source_event_id=f"collapse:{'+'.join(chain)}",
            edge_type=CausalEdgeType.REFINES,
            heads=parent_ids,
        )

        # Lineage: fused REFINES the chain head (the first collapsed member).
        dag._edges.append((head_id, fused.version_id, CausalEdgeType.REFINES))
        return [fused.version_id]

    @staticmethod
    def _maximal_linear_chain(dag: StateDAG, version_id: str) -> List[str]:
        """Walk both directions to the maximal linear chain containing the id."""
        chain: List[str] = []
        # Walk backward to the chain head (first version with != 1 parent).
        cursor = version_id
        seen: set[str] = set()
        while cursor and cursor not in seen:
            seen.add(cursor)
            parents = dag.parents_of(cursor)
            if len(parents) != 1:
                break
            cursor = parents[0].version_id
        head = cursor

        # Walk forward collecting every single-parent/single-child link.
        cursor = head
        seen = set()
        while cursor and cursor not in seen:
            seen.add(cursor)
            chain.append(cursor)
            children = dag.children_of(cursor)
            if len(children) != 1:
                break
            cursor = children[0].version_id
        return chain
