"""
Governance dependency graph pass (Phase B2).

Builds a reference graph from tracked governance files,
detects cycles, classifies forbidden edges by domain,
and emits a structured topology report.

Only tracks references to known governance artifact names --
avoids noise from common filename stems.
"""

from pathlib import Path


GOVERNANCE_NAMES = {
    "pgv.state_machine.json",
    "transition_ledger.json",
    "pipeline-mode.json",
    "work_request.schema.json",
    "pgv.phase",
    "native_domains.json",
    "golden_identity.json",
    "compile-cegla-state.sh",
    "check-cegla.sh",
    "check-adr001.sh",
    "arl_linter.py",
}

GOVERNANCE_STEMS = {n.rsplit(".", 1)[0] for n in GOVERNANCE_NAMES}


def _load_text(path: Path) -> str | None:
    try:
        with open(path, "r", errors="ignore") as f:
            return f.read()
    except Exception:
        return None


def _build_adjacency(paths: list[Path], classified: dict[str, str]) -> dict[str, set[str]]:
    adj: dict[str, set[str]] = {}

    gov_nodes: dict[str, str] = {}
    for p in paths:
        pp = str(p)
        domain = classified.get(pp)
        if domain is None:
            continue
        if domain == "BUILD":
            continue
        gov_nodes[pp] = domain

    name_to_paths: dict[str, list[str]] = {}
    for pp in gov_nodes:
        name = Path(pp).name
        if name in GOVERNANCE_NAMES:
            name_to_paths.setdefault(name, []).append(pp)
            stem = name.rsplit(".", 1)[0]
            name_to_paths.setdefault(stem, []).append(pp)

    for src_pp in sorted(gov_nodes.keys()):
        text = _load_text(Path(src_pp))
        if text is None:
            continue
        adj[src_pp] = set()
        for target_name, target_paths in name_to_paths.items():
            if target_name not in text:
                continue
            for tgt_pp in target_paths:
                if tgt_pp != src_pp:
                    adj[src_pp].add(tgt_pp)

    return adj


def _find_cycles(adj: dict[str, set[str]]) -> list[list[str]]:
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {n: WHITE for n in adj}
    parent: dict[str, str | None] = {n: None for n in adj}
    cycles: list[list[str]] = []

    def _extract_cycle(start: str) -> list[str]:
        cycle = [start]
        n = parent.get(start)
        while n is not None and n != start:
            cycle.append(n)
            n = parent.get(n)
        if n == start:
            cycle.append(start)
        cycle.reverse()
        return cycle

    for start_node in sorted(adj.keys()):
        if color[start_node] != WHITE:
            continue
        stack = [(start_node, 0)]
        while stack:
            node, state = stack.pop()
            if state == 0:
                if color[node] == GRAY:
                    c = _extract_cycle(node)
                    if c:
                        cycles.append(c)
                    continue
                if color[node] == BLACK:
                    continue
                color[node] = GRAY
                stack.append((node, 1))
                for neighbor in sorted(adj.get(node, [])):
                    if color.get(neighbor, WHITE) != BLACK:
                        parent[neighbor] = node
                        stack.append((neighbor, 0))
            else:
                color[node] = BLACK

    seen = set()
    unique = []
    for c in cycles:
        if not c:
            continue
        key = tuple(sorted(c))
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def _classify_edge(src_domain: str, tgt_domain: str) -> str:
    forbidden = {
        ("SCHEMA", "LEDGER"),
        ("SCHEMA", "STATE_MACHINE"),
        ("CONFIG", "SCHEMA"),
        ("CONFIG", "STATE_MACHINE"),
        ("LEDGER", "SCHEMA"),
        ("LEDGER", "STATE_MACHINE"),
        ("STATE_MACHINE", "LEDGER"),
        ("CODE", "STATE_MACHINE"),
    }
    if (src_domain, tgt_domain) in forbidden:
        return "FORBIDDEN"
    if src_domain == tgt_domain:
        return "INTRA_DOMAIN"
    return "ALLOWED_CROSS"


def run(paths: list[Path], classified: dict[str, str], violations: list[dict]) -> dict | None:
    adj = _build_adjacency(paths, classified)
    if not adj:
        return None

    cycles = _find_cycles(adj)

    for cycle_paths in cycles:
        cycle_str = " -> ".join(Path(p).name for p in cycle_paths)
        violations.append({
            "violation_type": "GOVERNANCE_CYCLE",
            "location": cycle_str,
            "description": f"Governance reference cycle detected: {cycle_str}",
            "severity": "CRITICAL",
        })

    edge_classes: dict[str, int] = {"FORBIDDEN": 0, "INTRA_DOMAIN": 0, "ALLOWED_CROSS": 0}
    forbidden_count = 0
    for src in sorted(adj.keys()):
        src_domain = classified.get(src, "UNKNOWN")
        for tgt in sorted(adj[src]):
            tgt_domain = classified.get(tgt, "UNKNOWN")
            classification = _classify_edge(src_domain, tgt_domain)
            edge_classes[classification] += 1
            if classification == "FORBIDDEN":
                forbidden_count += 1
                violations.append({
                    "violation_type": "FORBIDDEN_GOVERNANCE_EDGE",
                    "location": src,
                    "description": f"Forbidden edge: {src_domain}({Path(src).name}) -> {tgt_domain}({Path(tgt).name})",
                    "severity": "CRITICAL",
                })

    report = {
        "graph": {
            "nodes": len(adj),
            "edges": sum(len(v) for v in adj.values()),
        },
        "cycles": {
            "count": len(cycles),
            "found": len(cycles) > 0,
        },
        "edge_classes": edge_classes,
        "forbidden_edges": forbidden_count,
    }

    return report
