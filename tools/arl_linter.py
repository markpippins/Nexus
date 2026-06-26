"""
CIR v2 Anti-Recursion Linter (ARL) - Orchestrator.

Single verifier, multiple rule modules, single execution pipeline.
CIR-SDM classification + authority + lattice enforcement.

Usage:
    python tools/arl_linter.py                    # scan repo root (cwd)
    python tools/arl_linter.py /path/to/repo      # scan specific path
    python tools/arl_linter.py --json             # structured JSON output

Exit codes:
    0 - all clear (PASS)
    1 - violations found (FAIL)
"""

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(REPO_ROOT / "tools"))

from arl import classification, authority, lattice, invariants, graph


violations = []


def get_tracked_files(repo_root):
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--modified", "--others", "--exclude-standard"],
        capture_output=True, text=True, cwd=repo_root,
    )
    if result.returncode != 0:
        return []
    return [repo_root / f for f in result.stdout.strip().splitlines() if f]


def fallback_walk(root):
    exclude_dirs = {".git", "node_modules", "__pycache__", "target", "build"}
    paths = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for f in filenames:
            paths.append(Path(dirpath) / f)
    return paths


def scan(paths):
    # 1. Classification pass
    classified = classification.run(paths, violations)

    # 2. Authority pass (I7)
    authority.run(paths, classified, violations)

    # 3. Lattice pass (I8)
    lattice.run(paths, classified, violations)

    # 4. Invariants pass (I1-I3)
    invariants.run(paths, violations)

    # 5. Graph pass (Phase B2 — governance dependency graph)
    return graph.run(paths, classified, violations)


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path.cwd()
    output_json = "--json" in sys.argv

    paths = get_tracked_files(root)
    if not paths:
        paths = fallback_walk(root)

    graph_report = scan(paths)

    if output_json:
        report = {
            "status": "PASS" if not violations else "FAIL",
            "violations": violations,
            "total_violations": len(violations),
        }
        if graph_report:
            report["graph"] = graph_report
        print(json.dumps(report, indent=2))
    else:
        if graph_report:
            gr = graph_report
            print(f"[CIR-GRAPH] {gr['graph']['nodes']} nodes, {gr['graph']['edges']} edges"
                  f"  |  {gr['cycles']['count']} cycle(s)"
                  f"  |  {gr['forbidden_edges']} forbidden edge(s)"
                  f"  |  intra={gr['edge_classes']['INTRA_DOMAIN']}"
                  f"  cross={gr['edge_classes']['ALLOWED_CROSS']}")
        if not violations:
            print("[CIR-ARL] PASS — No CIR v2 violations detected")
        else:
            print("[CIR-ARL] FAIL — CIR v2 invariants violated:")
            for v in violations:
                print(f"  [{v['violation_type']}] {v['location']}")
                print(f"    {v['description']}")
            print(f"\n  Total: {len(violations)} violation(s)")

    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
