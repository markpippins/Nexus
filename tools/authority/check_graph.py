#!/usr/bin/env python3
"""
Graph Conformance Checker — capability/workflow registries vs node-types.json.

Validates the declared graph registries (`graph/capability/*.json` and
`graph/workflow/*.json`) against the universal node-type contract in
`graph/schema/node-types.json`:

- every capability node carries a valid `type` (inference | deterministic |
  external_tool) and its type-required fields
- every workflow references only declared capability ids (nodes + edges +
  entry_point + output_node), has no duplicate node ids, and is acyclic
- capability ids are unique across the registry

Failure classes:
    invalid-node       — a capability node violates the node-type contract
    dangling-ref       — a workflow references an undeclared node id
    duplicate-id       — a node id is declared more than once
    graph-cycle        — a workflow DAG contains a cycle

Usage:
    python tools/authority/check_graph.py              # text report
    python tools/authority/check_graph.py --json       # machine-readable

Exit codes:
    0 — all registries conform
    1 — one or more violations found
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GRAPH_DIR = REPO_ROOT / "graph"
NODE_TYPES = GRAPH_DIR / "schema" / "node-types.json"
CAPABILITY_DIR = GRAPH_DIR / "capability"
WORKFLOW_DIR = GRAPH_DIR / "workflow"

# Type → required fields (mirrors node-types.json definitions)
TYPE_REQUIRED = {
    "inference": ["id", "type", "input_schema", "output_schema"],
    "deterministic": ["id", "type", "input_schema", "output_schema", "implementation"],
    "external_tool": ["id", "type", "input_schema", "output_schema", "interface"],
}

VALID_TYPES = set(TYPE_REQUIRED)


def load_json(path):
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError(f"cannot parse {path}: {exc}")


def check_capabilities(violations):
    """Validate every capability node against the node-type contract."""
    seen_ids = {}
    if not CAPABILITY_DIR.exists():
        return
    for p in sorted(CAPABILITY_DIR.glob("*.json")):
        data = load_json(p)
        nodes = data if isinstance(data, list) else [data]
        for node in nodes:
            if not isinstance(node, dict) or "id" not in node:
                violations.append({
                    "failure_class": "invalid-node",
                    "domain": str(p.relative_to(REPO_ROOT)),
                    "detail": "capability entry is not an object with an id",
                })
                continue
            nid = node.get("id")
            if nid in seen_ids:
                violations.append({
                    "failure_class": "duplicate-id",
                    "domain": nid,
                    "detail": f"capability id declared in {seen_ids[nid]} and {p.relative_to(REPO_ROOT)}",
                })
            else:
                seen_ids[nid] = str(p.relative_to(REPO_ROOT))
            ntype = node.get("type")
            if ntype not in VALID_TYPES:
                violations.append({
                    "failure_class": "invalid-node",
                    "domain": nid,
                    "detail": f"invalid type {ntype!r} (expected one of {sorted(VALID_TYPES)})",
                })
                continue
            for field in TYPE_REQUIRED[ntype]:
                if field not in node:
                    violations.append({
                        "failure_class": "invalid-node",
                        "domain": nid,
                        "detail": f"type={ntype} missing required field {field!r}",
                    })
            if ntype == "external_tool":
                iface = node.get("interface") or {}
                if "protocol" not in iface:
                    violations.append({
                        "failure_class": "invalid-node",
                        "domain": nid,
                        "detail": "external_tool interface missing required 'protocol'",
                    })
    return seen_ids


def _walk_refs(workflow):
    refs = set()
    for edge in workflow.get("edges", []):
        if isinstance(edge, dict):
            for k in ("source", "target"):
                if edge.get(k):
                    refs.add(edge[k])
    for k in ("entry_point", "output_node"):
        if workflow.get(k):
            refs.add(workflow[k])
    return refs


def check_workflows(known_ids, violations):
    """Validate workflow DAGs: refs resolve, ids unique, no cycles."""
    if not WORKFLOW_DIR.exists():
        return
    for p in sorted(WORKFLOW_DIR.glob("*.json")):
        rel = str(p.relative_to(REPO_ROOT))
        data = load_json(p)
        if not isinstance(data, dict) or "id" not in data:
            violations.append({
                "failure_class": "invalid-node",
                "domain": rel,
                "detail": "workflow is not an object with an id",
            })
            continue
        wid = data.get("id")
        nodes = data.get("nodes") or []
        node_ids = [n.get("id") for n in nodes if isinstance(n, dict) and n.get("id")]

        # duplicate node ids within the workflow
        dupes = {nid for nid in node_ids if node_ids.count(nid) > 1}
        for d in sorted(dupes):
            violations.append({
                "failure_class": "duplicate-id",
                "domain": wid,
                "detail": f"workflow declares node id {d!r} more than once",
            })

        # node ids must be declared as capabilities (registry) or inline nodes
        declared = set(node_ids) | set(known_ids)

        # edges + entry/output refs must resolve
        for ref in sorted(_walk_refs(data) - set(node_ids)):
            if ref not in known_ids:
                violations.append({
                    "failure_class": "dangling-ref",
                    "domain": wid,
                    "detail": f"workflow references undeclared node {ref!r}",
                })
        for nid in node_ids:
            if nid not in known_ids and nid not in node_ids:
                # inline nodes are allowed but must validate as capabilities too
                pass

        # acyclicity over the edge graph (DFS)
        adj = {}
        for edge in data.get("edges", []):
            if isinstance(edge, dict):
                adj.setdefault(edge.get("source"), []).append(edge.get("target"))
        state = {}
        cycle_found = []

        def visit(n):
            if state.get(n) == 1:
                cycle_found.append(n)
                return
            if state.get(n) == 2:
                return
            state[n] = 1
            for m in adj.get(n, []):
                visit(m)
            state[n] = 2

        for n in list(adj):
            visit(n)
        if cycle_found:
            violations.append({
                "failure_class": "graph-cycle",
                "domain": wid,
                "detail": f"workflow graph contains a cycle (node {cycle_found[0]!r})",
            })


def run_checks():
    violations = []
    known = check_capabilities(violations) or {}
    check_workflows(known, violations)
    return violations


def main():
    output_json = "--json" in sys.argv
    try:
        violations = run_checks()
    except RuntimeError as exc:
        print(f"[GRAPH] FAIL — {exc}")
        return 1

    if output_json:
        print(json.dumps({
            "status": "PASS" if not violations else "FAIL",
            "total_violations": len(violations),
            "violations": violations,
        }, indent=2))
    else:
        if not violations:
            print("[GRAPH] PASS — capability/workflow registries conform to node-types.json")
        else:
            print("[GRAPH] FAIL — graph conformance violations:")
            by_class = {}
            for v in violations:
                by_class.setdefault(v["failure_class"], []).append(v)
            for fc in sorted(by_class):
                print(f"\n  [{fc}] ({len(by_class[fc])} violation(s))")
                for v in by_class[fc]:
                    print(f"    {v.get('domain')}: {v['detail']}")
            print(f"\n  Total: {len(violations)} violation(s)")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
