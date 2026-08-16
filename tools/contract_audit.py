#!/usr/bin/env python3
"""
Contract Audit — one CI entrypoint for the whole contract stack.

Runs every contract gate and emits ONE machine-readable JSON report with the
assessment's edge categories (unresolved / duplicate / stale / unauthorized):

    unresolved    — references that point at nothing (CIR-1 phantom refs,
                    authority domains with no resolvable canonical)
    duplicate     — more than one authority for the same semantic class
                    (CIR-5 DUAL_AUTHORITY, matrix duplicate-class/domain)
    stale         — committed artifacts that drifted from source (projection
                    digest drift, api-docs route drift, inactive codegen)
    unauthorized  — artifacts that cross declared authority/role boundaries
                    (CIR-2 cross-layer leaks, ARL violations, manifest
                    sourcing from projections/superseded, graph dangling refs)

Gates run (each with a stable exit code + JSON surface where available):

    1. arl_linter        — CIR v2 Anti-Recursion Linter (I1-I3, lattice, graph)
    2. cir1 --all        — full CIR-1..5 ontology lint (strict)
    3. authority-check   — authority matrix validator (check_authority.py)
    4. projection-ir     — ProjectionIR envelope adapter validation
    5. graph-conformance — capability/workflow registries vs node-types.json
    6. apidocs-drift     — committed *-srv openapi.yaml vs source routes

Usage:
    python tools/contract_audit.py               # text + JSON report, exit 1 on violation
    python tools/contract_audit.py --json        # JSON only (machine-readable)
    python tools/contract_audit.py --skip <gate> # skip a gate (repeatable)

Exit codes:
    0 — all gates pass
    1 — one or more gates failed
"""

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS = REPO_ROOT / "tools"

GATES = {
    "arl": ["python3", "tools/arl_linter.py", "--json"],
    "cir1": ["python3", "tools/cir1/lint.py", "--all", "--strict", "--json"],
    "authority": ["python3", "tools/authority/check_authority.py", "--json"],
    "projection-ir": ["python3", "tools/authority/projection_ir.py", "--json", "--validate"],
    "graph": ["python3", "tools/authority/check_graph.py", "--json"],
    "apidocs": ["python3", "tools/api-docs/check_drift.py", "--json", "--quiet"],
}


def run_gate(name, cmd):
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=600)
    parsed = None
    if proc.stdout.strip():
        try:
            parsed = json.loads(proc.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "gate": name,
        "exit_code": proc.returncode,
        "passed": proc.returncode == 0,
        "skipped": False,
        "report": parsed,
        "stdout_tail": "\n".join(proc.stdout.strip().splitlines()[-8:]),
        "stderr_tail": "\n".join(proc.stderr.strip().splitlines()[-4:]),
    }


# ─── Category mapping: violation → assessment edge category ─────────────────

CIR1_CATEGORY = {
    "CIR-1": "unresolved",
    "CIR-2": "unauthorized",
    "CIR-3": "unresolved",    # implicit execution semantics = missing contract
    "CIR-4": "stale",         # static derived state = stale projection
    "CIR-5": "duplicate",
}

AUTHORITY_CATEGORY = {
    "no-authority": "unresolved",
    "duplicate-class": "duplicate",
    "unlisted-projection": "unauthorized",
    "projection-drift": "stale",
}

ARL_CATEGORY = "unauthorized"

GRAPH_CATEGORY = {
    "invalid-node": "unauthorized",
    "duplicate-id": "duplicate",
    "dangling-ref": "unresolved",
    "graph-cycle": "unauthorized",
}


def collect(gate_name, result, categorized):
    report = result.get("report")
    if not isinstance(report, dict):
        return
    violations = report.get("violations") or []
    if gate_name == "cir1":
        for v in violations:
            categorized[CIR1_CATEGORY.get(v.get("rule"), "unauthorized")].append({
                "gate": gate_name, "rule": v.get("rule"), "code": v.get("code"),
                "path": v.get("path"), "detail": v.get("detail"),
            })
    elif gate_name == "authority":
        for v in violations:
            categorized[AUTHORITY_CATEGORY.get(v.get("failure_class"), "unauthorized")].append({
                "gate": gate_name, "failure_class": v.get("failure_class"),
                "domain": v.get("domain"), "detail": v.get("detail"),
            })
    elif gate_name == "arl":
        for v in violations:
            categorized[ARL_CATEGORY].append({
                "gate": gate_name, "violation_type": v.get("violation_type"),
                "location": v.get("location"), "description": v.get("description"),
            })
    elif gate_name == "graph":
        for v in violations:
            categorized[GRAPH_CATEGORY.get(v.get("failure_class"), "unauthorized")].append({
                "gate": gate_name, "failure_class": v.get("failure_class"),
                "domain": v.get("domain"), "detail": v.get("detail"),
            })
    elif gate_name == "projection-ir":
        for domain, reason in report.get("failures") or []:
            categorized["stale"].append({
                "gate": gate_name, "domain": domain, "detail": reason,
            })
    elif gate_name == "apidocs":
        for key, v in (report or {}).items():
            if v.get("status") != "ok":
                categorized["stale"].append({
                    "gate": gate_name, "domain": key,
                    "detail": v.get("detail") or f"status={v.get('status')}",
                })


def main():
    only_json = "--json" in sys.argv
    skip = set()
    args = sys.argv[1:]
    while "--skip" in args:
        i = args.index("--skip")
        if i + 1 < len(args):
            skip.add(args[i + 1])
        args = args[:i] + args[i + 2:]

    results = []
    for name, cmd in GATES.items():
        if name in skip:
            results.append({"gate": name, "passed": True, "skipped": True,
                            "exit_code": 0, "report": None})
            continue
        results.append(run_gate(name, cmd))

    categorized = {"unresolved": [], "duplicate": [], "stale": [], "unauthorized": []}
    for r in results:
        if not r.get("skipped"):
            collect(r["gate"], r, categorized)

    failed = [r for r in results if not r.get("passed")]
    total = sum(len(v) for v in categorized.values())

    report = {
        "status": "PASS" if not failed and not total else "FAIL",
        "categories": {k: {"count": len(v), "items": v} for k, v in categorized.items()},
        "total_violations": total,
        "gates": [{k: r[k] for k in ("gate", "passed", "exit_code", "skipped")} for r in results],
        "failed_gates": [r["gate"] for r in failed],
    }

    if only_json:
        print(json.dumps(report, indent=2))
    else:
        print(f"[CONTRACT-AUDIT] {'PASS' if report['status'] == 'PASS' else 'FAIL'}")
        for name, cmd in GATES.items():
            r = next(x for x in results if x["gate"] == name)
            mark = "SKIP" if r.get("skipped") else ("PASS" if r["passed"] else "FAIL")
            print(f"  [{mark}] {name}")
        for cat, v in categorized.items():
            if v:
                print(f"\n  [{cat}] ({len(v)} violation(s))")
                for item in v[:6]:
                    loc = item.get("path") or item.get("location") or item.get("domain") or ""
                    det = item.get("detail") or item.get("description") or item.get("code") or ""
                    print(f"    {loc}: {det}")
                if len(v) > 6:
                    print(f"    ... and {len(v) - 6} more")
        if failed:
            print(f"\n  Failed gates: {[r['gate'] for r in failed]}")

    return 1 if report["status"] == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main())
