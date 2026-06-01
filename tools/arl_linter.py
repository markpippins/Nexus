#!/usr/bin/env python3
"""
CIR v2 Anti-Recursion Linter (ARL)

Shared verifier module callable from both Makefile and pre-commit hook.
Enforces strict separation of concerns across schema, config, ledger,
and state machine artifacts. Only scans git-tracked files.

Usage:
    python tools/arl_linter.py                    # scan repo root (cwd)
    python tools/arl_linter.py /path/to/repo      # scan specific path
    python tools/arl_linter.py --json             # structured JSON output

Exit codes:
    0 — all clear (PASS)
    1 — violations found (FAIL)
"""

import json
import os
import subprocess
import sys
from pathlib import Path


ARL_SELF = Path(__file__).resolve()


ARTIFACT_ROLES = {
    "work_request.schema.json":     "SCHEMA",
    "pipeline-mode.json":           "CONFIG",
    "transition_ledger.json":       "LEDGER",
    "pgv.state_machine.json":       "STATE_MACHINE",
    "pgv.phase":                    "STATE_MACHINE",
}


violations = []


def fail(vtype, path, desc):
    violations.append({
        "violation_type": vtype,
        "location": str(path),
        "description": desc,
        "severity": "CRITICAL",
    })


# ─── I1: No recursive state representation ────────────────────────────────────

def check_no_recursive_wrappers(path):
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, Exception):
        return

    raw = path.read_text()

    # Check for recursive wrapper: "original" with an object value (not a simple string)
    if _has_recursive_original(data):
        fail("RECURSIVE_WRAPPER", path,
             "Contains 'original' with nested object value (indicates recursive state wrapping)")

    # Check for nested quarantine chains (CIR4-style cascading)
    count = raw.count("quarantined_")
    if count > 1:
        fail("NESTED_QUARANTINE", path,
             f"Multiple quarantine markers ({count}) suggest recursive nesting")


def _has_recursive_original(obj, depth=0):
    if depth > 10:
        return False
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "original" and isinstance(v, dict):
                return True
            if _has_recursive_original(v, depth + 1):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if _has_recursive_original(item, depth + 1):
                return True
    return False


# ─── I2: Single authority for state ──────────────────────────────────────────

def check_no_state_in_schema(path):
    data = json.loads(path.read_text())
    raw = path.read_text()
    if "execution_state" in raw and path.name == "work_request.schema.json":
        fail("STATE_IN_SCHEMA", path,
             "Schema defines execution_state — runtime state must not live in schema layer")


def check_no_state_inference(path):
    if path.resolve() == ARL_SELF:
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if "canonical_state" in stripped and not stripped.startswith("#"):
            fail("STATE_INFERENCE", path,
                 f"Code computes canonical_state directly: {stripped[:80]}")


# ─── I3: No cross-layer semantics ────────────────────────────────────────────

LAYER_DEFINITIONS = {
    "SCHEMA":         {"keywords": [], "forbidden": ["states", "transitions", "entropy_cost"]},
    "CONFIG":         {"keywords": [], "forbidden": ["states", "transitions", "invariants", "events"]},
    "LEDGER":         {"keywords": ["events"], "forbidden": ["states", "transitions", "invariants", "entropy_scale", "guards"]},
    "STATE_MACHINE":  {"keywords": ["states", "transitions", "guards", "invariants"], "forbidden": ["events"]},
}


def check_layer_violations(path):
    role = ARTIFACT_ROLES.get(path.name)
    if role is None:
        return
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, Exception):
        return
    raw = path.read_text()
    layer = LAYER_DEFINITIONS[role]
    for forbidden in layer["forbidden"]:
        if f'"{forbidden}"' in raw:
            fail("CROSS_LAYER_LEAK", path,
                 f"Artifact role={role} contains forbidden key '{forbidden}'")


# ─── Scan ─────────────────────────────────────────────────────────────────────

def scan(paths):
    for p in paths:
        if not p.is_file() or p.suffix not in (".json", ".py", ".sh"):
            continue
        if p.suffix == ".json":
            check_no_recursive_wrappers(p)
        if p.name == "work_request.schema.json":
            check_no_state_in_schema(p)
        if p.suffix == ".py":
            check_no_state_inference(p)
        if p.name in ARTIFACT_ROLES:
            check_layer_violations(p)


# ─── Main ─────────────────────────────────────────────────────────────────────

def get_tracked_files(repo_root):
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--modified", "--others", "--exclude-standard"],
        capture_output=True, text=True, cwd=repo_root,
    )
    if result.returncode != 0:
        return []
    return [repo_root / f for f in result.stdout.strip().splitlines() if f]


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path.cwd()
    output_json = "--json" in sys.argv

    paths = get_tracked_files(root)
    if not paths:
        exclude_dirs = {".git", "node_modules", "__pycache__", "target", "build"}
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
            for f in filenames:
                paths.append(Path(dirpath) / f)

    scan(paths)

    if output_json:
        report = {
            "status": "PASS" if not violations else "FAIL",
            "violations": violations,
            "total_violations": len(violations),
        }
        print(json.dumps(report, indent=2))
    else:
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
