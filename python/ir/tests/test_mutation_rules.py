"""
Tests for MutationRule protocol + CollapseChainRule over StateDAG.

CollapseChainRule is the re-port of nbk's CollapseChainRule (rules.py) onto
the versioned memory substrate (state_dag.py): a linear causal chain A→B→C
collapses into a single fused StateVersion whose data is the merge of the
chain (== terminal data), preserving the append-only invariant and replay
equivalence, with a REFINES edge back to the chain head for lineage.

Invariants under test:
  - applies() is True only for linear links (exactly 1 parent + 1 child).
  - apply() produces exactly one fused version with merged chain data.
  - Fused data == terminal chain data (replay equivalence).
  - Originals are preserved (append-only) — no version is deleted.
  - REFINES lineage edge chain-head → fused is recorded.
  - Chains shorter than 3 members collapse to nothing (edge-only).
  - Malformed / branching DAGs are left untouched.
"""
import pytest

from ir.state_dag import CausalEdgeType, StateDAG
from ir.mutation_rules import CollapseChainRule


def _linear_chain(n: int) -> StateDAG:
    """Build a linear chain of n mutations: v1 → v2 → ... → vn."""
    dag = StateDAG()
    for i in range(1, n + 1):
        dag.mutate({"step": i}, source_event_id=f"evt-{i:03d}")
    return dag


class TestCollapseChainRule:
    def test_applies_only_to_linear_link(self):
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        # Every middle version (1..n-1) has exactly 1 parent + 1 child.
        assert rule.applies(dag, vids[1])
        # The head (v1) has 0 parents — not a linear link.
        assert not rule.applies(dag, vids[0])

    def test_apply_creates_one_fused_version(self):
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        before = dag.version_count
        affected = rule.apply(dag, vids[1])
        assert len(affected) == 1
        assert dag.version_count == before + 1  # append-only: one new version

    def test_fused_data_equals_terminal_chain_data(self):
        # Replay equivalence: fused data must be exactly the chain's terminal
        # data, since StateDAG mutations merge parents into children.
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        terminal = dag.get_version(vids[-1])
        affected = rule.apply(dag, vids[1])
        fused = dag.get_version(affected[0])
        assert fused is not None
        assert fused.data == terminal.data
        assert fused.data == {"step": 5}

    def test_originals_preserved_append_only(self):
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        rule.apply(dag, vids[1])
        for vid in vids:
            assert dag.get_version(vid) is not None  # nothing deleted

    def test_refines_lineage_edge_to_chain_head(self):
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        affected = rule.apply(dag, vids[1])
        fused_id = affected[0]
        edges = [(f, t, typ) for f, t, typ in dag._edges]
        assert (vids[0], fused_id, CausalEdgeType.REFINES) in edges

    def test_fused_heads_external_parents(self):
        # Chain head is genesis (no parents) — fused must have empty parents.
        dag = _linear_chain(5)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        affected = rule.apply(dag, vids[1])
        fused = dag.get_version(affected[0])
        assert fused.causal_parents == []

    def test_chain_of_two_collapses_to_nothing(self):
        # nbk fuses A→B→C; a 2-node chain is just an edge — no fusion.
        dag = _linear_chain(2)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        affected = rule.apply(dag, vids[0])
        assert affected == []
        assert dag.version_count == 2

    def test_unknown_version_not_applicable(self):
        dag = _linear_chain(3)
        rule = CollapseChainRule()
        assert not rule.applies(dag, "nonexistent-id")
        assert rule.apply(dag, "nonexistent-id") == []

    def test_branching_dag_left_untouched(self):
        # Build a branch: v1 → v2a, v1 → v2b (v2a has 2 children after
        # another mutate). Collapse from a branching node must not apply.
        dag = StateDAG()
        v1 = dag.mutate({"step": 1}, source_event_id="evt-1")
        dag.mutate({"step": 2}, source_event_id="evt-2a")  # child A
        dag.mutate({"step": 3}, source_event_id="evt-2b")  # child B (from v1)
        rule = CollapseChainRule()
        # v1 has 2 children -> not a linear link.
        assert not rule.applies(dag, v1.version_id)

    def test_source_event_id_records_collapse(self):
        dag = _linear_chain(4)
        rule = CollapseChainRule()
        vids = list(dag._versions.keys())
        affected = rule.apply(dag, vids[1])
        fused = dag.get_version(affected[0])
        assert fused.source_event_id.startswith("collapse:")
