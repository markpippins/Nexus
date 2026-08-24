"""Conformance tests for tools/authority/check_graph.py.

Exercises the four failure classes (invalid-node, duplicate-id, dangling-ref,
graph-cycle) against synthetic registries plus the green real-registry case.

Run with:
    python3 -m pytest tools/authority/test_check_graph.py -v
"""

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import check_graph as cg  # noqa: E402


def _node(nid, ntype="deterministic", **extra):
    base = {"id": nid, "type": ntype, "input_schema": {"type": "object"},
            "output_schema": {"type": "object"}}
    base.update(extra)
    return base


def _tmp_dir(monkeypatch):
    """Create a throwaway dir under the repo root (the checker resolves paths
    relative to REPO_ROOT) and point CAPABILITY_DIR / WORKFLOW_DIR at it."""
    d = Path(tempfile.mkdtemp(dir=str(cg.REPO_ROOT), prefix=".graph-test-"))
    monkeypatch.setattr(cg, "CAPABILITY_DIR", d / "cap")
    monkeypatch.setattr(cg, "WORKFLOW_DIR", d / "wf")
    (d / "cap").mkdir()
    (d / "wf").mkdir()
    return d


# ─── invalid-node ────────────────────────────────────────────────────────────

def test_invalid_type_flagged(monkeypatch):
    d = _tmp_dir(monkeypatch)
    try:
        (cg.CAPABILITY_DIR / "a.json").write_text(json.dumps([_node("x", ntype="wat")]))
        v = cg.run_checks()
        assert any(x["failure_class"] == "invalid-node" and "invalid type" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


def test_missing_required_field_flagged(monkeypatch):
    d = _tmp_dir(monkeypatch)
    try:
        # external_tool requires `interface`
        (cg.CAPABILITY_DIR / "a.json").write_text(json.dumps([_node("x", ntype="external_tool")]))
        v = cg.run_checks()
        assert any(x["failure_class"] == "invalid-node" and "interface" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


# ─── duplicate-id ────────────────────────────────────────────────────────────

def test_duplicate_capability_id_flagged(monkeypatch):
    d = _tmp_dir(monkeypatch)
    try:
        (cg.CAPABILITY_DIR / "a.json").write_text(json.dumps([_node("dup"), _node("dup")]))
        v = cg.run_checks()
        assert any(x["failure_class"] == "duplicate-id" for x in v)
    finally:
        shutil.rmtree(d)


# ─── dangling-ref / graph-cycle (workflow) ───────────────────────────────────

def _workflow(nodes, edges, **extra):
    wf = {"id": "wf", "nodes": nodes, "edges": edges}
    wf.update(extra)
    return wf


def test_dangling_edge_ref_flagged(monkeypatch):
    d = _tmp_dir(monkeypatch)
    try:
        (cg.CAPABILITY_DIR / "a.json").write_text(json.dumps([_node("a")]))
        wf = _workflow([], [{"source": "a", "target": "ghost"}])
        (cg.WORKFLOW_DIR / "w.json").write_text(json.dumps(wf))
        v = cg.run_checks()
        assert any(x["failure_class"] == "dangling-ref" and "ghost" in x["detail"] for x in v)
    finally:
        shutil.rmtree(d)


def test_graph_cycle_flagged(monkeypatch):
    d = _tmp_dir(monkeypatch)
    try:
        (cg.CAPABILITY_DIR / "a.json").write_text(json.dumps([_node("a"), _node("b")]))
        wf = _workflow([], [{"source": "a", "target": "b"}, {"source": "b", "target": "a"}])
        (cg.WORKFLOW_DIR / "w.json").write_text(json.dumps(wf))
        v = cg.run_checks()
        assert any(x["failure_class"] == "graph-cycle" for x in v)
    finally:
        shutil.rmtree(d)


# ─── green: the committed registries must conform ────────────────────────────

def test_real_registries_pass():
    v = cg.run_checks()
    assert v == []
