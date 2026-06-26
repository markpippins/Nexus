"""Tests for the Spec Compiler (Station 3)."""

from meep.models import IRSelection
from meep.spec_compiler import compile_selection, _TEMPLATES


# ── Acceptance criteria ──────────────────────────────────────────────


def test_revision_produces_nodes():
    """REVISION selection produces at least one WorkNode."""
    sel = IRSelection(archetype="REVISION", confidence=0.7)
    graph = compile_selection(sel, "fix the bug")
    assert len(graph.nodes) >= 1


def test_all_edges_connect_existing_nodes():
    """Every edge references valid source and target node IDs."""
    for archetype in _TEMPLATES:
        if archetype == "DEFAULT":
            continue  # DEFAULT has 1 node, 0 edges — skip here, tested below
        sel = IRSelection(archetype=archetype, confidence=0.7)
        graph = compile_selection(sel, "")
        node_ids = {n.id for n in graph.nodes}
        for edge in graph.edges:
            assert edge.source_id in node_ids, (
                f"Edge source {edge.source_id!r} not in nodes"
            )
            assert edge.target_id in node_ids, (
                f"Edge target {edge.target_id!r} not in nodes"
            )


def test_graph_is_acyclic():
    """All archetype templates produce acyclic graphs (linear chains are acyclic)."""
    for archetype in _TEMPLATES:
        sel = IRSelection(archetype=archetype, confidence=0.7)
        graph = compile_selection(sel, "")
        _assert_acyclic(graph.nodes, graph.edges)


def test_graph_is_connected():
    """Graph has a single entry and exit (linear chain)."""
    for archetype in _TEMPLATES:
        sel = IRSelection(archetype=archetype, confidence=0.7)
        graph = compile_selection(sel, "")
        if not graph.nodes:
            continue  # skip REJECT (tested separately)
        in_degree = {n.id: 0 for n in graph.nodes}
        out_degree = {n.id: 0 for n in graph.nodes}
        for edge in graph.edges:
            out_degree[edge.source_id] += 1
            in_degree[edge.target_id] += 1
        entries = [nid for nid, d in in_degree.items() if d == 0]
        exits = [nid for nid, d in out_degree.items() if d == 0]
        assert len(entries) == 1, f"{archetype}: expected 1 entry, got {len(entries)}"
        assert len(exits) == 1, f"{archetype}: expected 1 exit, got {len(exits)}"


def test_reject_returns_empty_graph():
    """REJECT archetype produces a graph with no nodes and no edges."""
    sel = IRSelection(archetype="REJECT", confidence=0.2)
    graph = compile_selection(sel, "anything")
    assert len(graph.nodes) == 0
    assert len(graph.edges) == 0


def test_default_has_one_node():
    """DEFAULT archetype produces exactly one node."""
    sel = IRSelection(archetype="DEFAULT", confidence=0.9)
    graph = compile_selection(sel, "hello")
    assert len(graph.nodes) == 1
    assert len(graph.edges) == 0


def test_unknown_archetype_falls_back_to_default():
    """An archetype not in the template map falls back to DEFAULT template."""
    sel = IRSelection(archetype="NONEXISTENT", confidence=0.9)
    graph = compile_selection(sel, "test")
    assert len(graph.nodes) == 1
    assert graph.nodes[0].id == "nonexistent-clarify"


# ── Template structure ───────────────────────────────────────────────


def test_each_archetype_has_expected_node_count():
    """Each archetype template produces the expected number of nodes."""
    expected = {
        "CONSTRUCTION": 3,
        "EXECUTION": 3,
        "REFLECTION": 3,
        "RECONCILIATION": 3,
        "REVISION": 4,
        "COUNTERFACTUAL": 3,
        "AUDIT": 3,
        "COMPRESSION": 3,
        "CONSTRAINT_INJECTION": 3,
        "DEFAULT": 1,
    }
    for archetype, count in expected.items():
        sel = IRSelection(archetype=archetype, confidence=0.8)
        graph = compile_selection(sel, "")
        assert len(graph.nodes) == count, (
            f"{archetype}: expected {count} nodes, got {len(graph.nodes)}"
        )


def test_each_archetype_has_expected_edge_count():
    """Linear chain of N nodes → N-1 edges."""
    expected = {
        "CONSTRUCTION": 2,
        "EXECUTION": 2,
        "REFLECTION": 2,
        "RECONCILIATION": 2,
        "REVISION": 3,
        "COUNTERFACTUAL": 2,
        "AUDIT": 2,
        "COMPRESSION": 2,
        "CONSTRAINT_INJECTION": 2,
        "DEFAULT": 0,
    }
    for archetype, count in expected.items():
        sel = IRSelection(archetype=archetype, confidence=0.8)
        graph = compile_selection(sel, "")
        assert len(graph.edges) == count, (
            f"{archetype}: expected {count} edges, got {len(graph.edges)}"
        )


def test_nodes_have_archetype_field():
    """Every WorkNode has its archetype field set."""
    sel = IRSelection(archetype="REVISION", confidence=0.9)
    graph = compile_selection(sel, "fix")
    for node in graph.nodes:
        assert node.archetype == "REVISION"


def test_metadata_contains_archetype_and_prompt():
    """Graph metadata stores the archetype and original prompt."""
    sel = IRSelection(archetype="AUDIT", confidence=0.8)
    graph = compile_selection(sel, "check compliance")
    assert graph.metadata["archetype"] == "AUDIT"
    assert graph.metadata["prompt"] == "check compliance"


def test_metadata_reject():
    """REJECT metadata records archetype."""
    sel = IRSelection(archetype="REJECT", confidence=0.2)
    graph = compile_selection(sel, "vague")
    assert graph.metadata["archetype"] == "REJECT"


# ── Helpers ──────────────────────────────────────────────────────────


def _assert_acyclic(nodes, edges) -> None:
    """Simple cycle detection via DFS."""
    adj = {n.id: [] for n in nodes}
    for e in edges:
        adj[e.source_id].append(e.target_id)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n.id: WHITE for n in nodes}

    def dfs(nid: str) -> bool:
        color[nid] = GRAY
        for neighbor in adj[nid]:
            if color[neighbor] == GRAY:
                return False  # back edge → cycle
            if color[neighbor] == WHITE:
                if not dfs(neighbor):
                    return False
        color[nid] = BLACK
        return True

    for nid in list(color.keys()):
        if color[nid] == WHITE:
            assert dfs(nid), f"Cycle detected in graph"
