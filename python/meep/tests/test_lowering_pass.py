"""Tests for the Lowering Pass / Freeze Boundary (Station 4)."""

import json

from meep.models import (
    WorkRequestGraph, WorkNode, WorkEdge,
    ExecutionGraph, ExecNode,
    FrozenGraphError,
)
from meep.spec_compiler import compile_selection
from meep.ir_resolver import resolve
from meep.irl_classifier import classify
from meep.lowering_pass import lower, lower_with_timestamp, _topological_sort


SAMPLE_TIMESTAMP = "2026-06-20T12:00:00Z"


# ── Acceptance criteria ──────────────────────────────────────────────


def test_lowering_produces_valid_execution_graph():
    """Lowering produces ExecutionGraph with same node count as input."""
    raw = compile_selection(
        resolve(classify("fix the bug")),
        "fix the bug",
    )
    exec_g = lower(raw)
    assert isinstance(exec_g, ExecutionGraph)
    assert len(exec_g.nodes) == len(raw.nodes)
    assert exec_g.frozen_at != ""


def test_all_handlers_resolved():
    """Each ExecNode has a handler set (not empty)."""
    raw = compile_selection(
        resolve(classify("build a service")),
        "build a service",
    )
    exec_g = lower(raw)
    for node in exec_g.nodes:
        assert node.handler != "", f"Empty handler for node {node.id}"
        assert node.handler.endswith("_handler"), f"Unexpected handler {node.handler}"


def test_frozen_graph_rejects_modification():
    """After _freeze(), field reassignment raises FrozenGraphError.

    In-place list mutations also fail because list fields are converted
    to tuples at freeze time.
    """
    raw = compile_selection(
        resolve(classify("audit")),
        "audit",
    )
    exec_g = lower(raw)

    # Field reassignment → FrozenGraphError (via __setattr__)
    with pytest.raises(FrozenGraphError):
        exec_g.nodes = []
    with pytest.raises(FrozenGraphError):
        exec_g.schema_version = "v2"
    with pytest.raises(FrozenGraphError):
        exec_g.frozen_at = ""  # noqa

    # In-place mutation → AttributeError (tuples don't support it)
    with pytest.raises(AttributeError):
        exec_g.edges.append(("n1", "n2"))
    with pytest.raises(AttributeError):
        exec_g.topological_order.clear()


def test_frozen_graph_hash_changes_on_modification():
    """Content hash is stable but changes if a field is modified."""
    raw = compile_selection(
        resolve(classify("fix the bug")),
        "fix the bug",
    )
    exec_g = lower(raw)
    h1 = exec_g.content_hash()

    # Can't actually modify a frozen graph to test hash change
    # (it raises FrozenGraphError).  Instead, create two graphs with
    # different frozen_at timestamps and verify hashes differ.
    raw2 = compile_selection(
        resolve(classify("fix the bug")),
        "fix the bug",
    )
    exec_g2 = lower_with_timestamp(raw2, "2026-06-20T13:00:00Z")
    h2 = exec_g2.content_hash()
    assert h1 != h2, "Hashes should differ when frozen_at differs"


def test_topological_order_respects_edges():
    """Topological order guarantees source before target."""
    raw = compile_selection(
        resolve(classify("refactor the module")),
        "refactor",
    )
    exec_g = lower(raw)
    topo = exec_g.topological_order
    positions = {nid: i for i, nid in enumerate(topo)}
    for source, target in exec_g.edges:
        assert positions[source] < positions[target], (
            f"Edge {source} → {target} violates topological order"
        )


def test_empty_graph_lowering():
    """Empty WorkRequestGraph → empty ExecutionGraph."""
    raw = WorkRequestGraph()
    exec_g = lower(raw)
    assert len(exec_g.nodes) == 0
    assert len(exec_g.edges) == 0
    assert len(exec_g.topological_order) == 0
    assert exec_g.frozen_at == ""  # no timestamp for empty


# ── Serialization round-trip ─────────────────────────────────────────


def test_serialize_roundtrip():
    """ExecutionGraph survives JSON serialize/deserialize round-trip."""
    raw = compile_selection(
        resolve(classify("merge the branches")),
        "merge",
    )
    exec_g = lower(raw)

    data = {
        "nodes": [
            {"id": n.id, "label": n.label, "handler": n.handler, "config": n.config}
            for n in exec_g.nodes
        ],
        "edges": list(exec_g.edges),
        "topological_order": list(exec_g.topological_order),
        "schema_version": exec_g.schema_version,
        "frozen_at": exec_g.frozen_at,
    }
    serialized = json.dumps(data, sort_keys=True)

    restored_data = json.loads(serialized)
    restored = ExecutionGraph(
        nodes=[ExecNode(**n) for n in restored_data["nodes"]],
        edges=[tuple(e) for e in restored_data["edges"]],
        topological_order=restored_data["topological_order"],
        schema_version=restored_data["schema_version"],
        frozen_at=restored_data["frozen_at"],
    )

    assert len(restored.nodes) == len(exec_g.nodes)
    # Frozen graphs use tuples; deserialized graphs use lists — compare values
    assert list(restored.edges) == list(exec_g.edges)
    assert list(restored.topological_order) == list(exec_g.topological_order)
    assert restored.schema_version == exec_g.schema_version
    # Note: restored graph is NOT frozen (lower() wasn't called on it)
    # which is expected — it's a deserialized copy.


# ── Lowering pass edge cases ─────────────────────────────────────────


def test_cycle_detection():
    """Kahn's algorithm raises ValueError on cyclic graph."""
    nodes = [
        ExecNode(id="a", label="A", handler="h"),
        ExecNode(id="b", label="B", handler="h"),
        ExecNode(id="c", label="C", handler="h"),
    ]
    edges = [("a", "b"), ("b", "c"), ("c", "a")]  # cycle!
    import pytest
    with pytest.raises(ValueError, match="cycle"):
        _topological_sort(nodes, edges)


def test_single_node_graph():
    """Single node → single entry in topological_order."""
    nodes = [ExecNode(id="only", label="Only node", handler="h")]
    edges: list[tuple[str, str]] = []
    order = _topological_sort(nodes, edges)
    assert order == ["only"]


def test_disconnected_graph():
    """Two disconnected chains → both appear in topological order."""
    nodes = [
        ExecNode(id="a1", label="A1", handler="h"),
        ExecNode(id="a2", label="A2", handler="h"),
        ExecNode(id="b1", label="B1", handler="h"),
        ExecNode(id="b2", label="B2", handler="h"),
    ]
    edges = [("a1", "a2"), ("b1", "b2")]
    order = _topological_sort(nodes, edges)
    # Both chains present, a1 before a2, b1 before b2
    assert order.index("a1") < order.index("a2")
    assert order.index("b1") < order.index("b2")
    assert len(order) == 4


def test_resolve_handler_falls_back_to_generic():
    """Unknown archetype/node gets the generic handler."""
    from meep.lowering_pass import _resolve_handler
    assert _resolve_handler("NONEXISTENT", "foo-bar") == "generic_handler"
    assert _resolve_handler("EXECUTION", "unknown-step") == "generic_handler"


def test_deterministic_lowering():
    """Same input + same timestamp → identical ExecutionGraph content hash."""
    raw = compile_selection(
        resolve(classify("test")),
        "test",
    )
    g1 = lower_with_timestamp(raw, SAMPLE_TIMESTAMP)
    g2 = lower_with_timestamp(raw, SAMPLE_TIMESTAMP)
    assert g1.content_hash() == g2.content_hash()


# ── Integration: full Station 1→3→4 path (without scheduler) ────────


def test_full_path_through_freeze_boundary():
    """End-to-end: prompt → IRL → IR → compiler → lowering."""
    prompt = "refactor the database module"
    result = classify(prompt)
    selection = resolve(result)
    wg = compile_selection(selection, prompt)
    eg = lower(wg)

    assert len(eg.nodes) >= 1
    assert eg.frozen_at != ""
    for node in eg.nodes:
        assert node.handler != ""

    # Verify freeze: can't modify
    import pytest
    with pytest.raises(FrozenGraphError):
        eg.nodes = []


import pytest  # noqa: E402 (needed in module scope for fixtures above)
