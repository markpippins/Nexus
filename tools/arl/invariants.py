"""
Invariant passes (I1-I3).
Extracted from original arl_linter.py - recursive wrappers, state in schema,
state inference in code, cross-layer role violations.
"""

import json
import subprocess
from pathlib import Path

ARL_ROOT = Path(__file__).resolve().parent  # tools/arl/
ARL_ORCHESTRATOR = ARL_ROOT.parent / "arl_linter.py"  # tools/arl_linter.py


ARTIFACT_ROLES = {
    "work_request.schema.json":     "SCHEMA",
    "pipeline-mode.json":           "CONFIG",
    "transition_ledger.json":       "LEDGER",
    "pgv.state_machine.json":       "STATE_MACHINE",
    "pgv.phase":                    "STATE_MACHINE",
}

LAYER_DEFINITIONS = {
    "SCHEMA":         {"keywords": [], "forbidden": ["states", "transitions", "entropy_cost"]},
    "CONFIG":         {"keywords": [], "forbidden": ["states", "transitions", "invariants", "events"]},
    "LEDGER":         {"keywords": ["events"], "forbidden": ["states", "transitions", "invariants", "entropy_scale", "guards"]},
    "STATE_MACHINE":  {"keywords": ["states", "transitions", "guards", "invariants"], "forbidden": ["events"]},
}


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


def i1_no_recursive_wrappers(paths: list[Path], violations: list[dict]):
    for p in paths:
        if not p.is_file() or p.suffix != ".json":
            continue
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, Exception):
            continue

        raw = p.read_text()

        if _has_recursive_original(data):
            violations.append({
                "violation_type": "RECURSIVE_WRAPPER",
                "location": str(p),
                "description": "Contains 'original' with nested object value (indicates recursive state wrapping)",
                "severity": "CRITICAL",
            })

        count = raw.count("quarantined_")
        if count > 1:
            violations.append({
                "violation_type": "NESTED_QUARANTINE",
                "location": str(p),
                "description": f"Multiple quarantine markers ({count}) suggest recursive nesting",
                "severity": "CRITICAL",
            })


def i2_no_state_in_schema(paths: list[Path], violations: list[dict]):
    for p in paths:
        if not p.is_file() or p.name != "work_request.schema.json":
            continue
        try:
            raw = p.read_text()
        except Exception:
            continue
        if "execution_state" in raw:
            violations.append({
                "violation_type": "STATE_IN_SCHEMA",
                "location": str(p),
                "description": "Schema defines execution_state — runtime state must not live in schema layer",
                "severity": "CRITICAL",
            })


def _is_arl_tool(p: Path) -> bool:
    resolved = p.resolve()
    return ARL_ROOT in resolved.parents or resolved == ARL_ORCHESTRATOR


def i2_no_state_inference(paths: list[Path], violations: list[dict]):
    for p in paths:
        if not p.is_file() or p.suffix != ".py":
            continue
        if _is_arl_tool(p):
            continue
        try:
            for line in p.read_text().splitlines():
                stripped = line.strip()
                if "canonical_state" in stripped and not stripped.startswith("#"):
                    violations.append({
                        "violation_type": "STATE_INFERENCE",
                        "location": str(p),
                        "description": f"Code computes canonical_state directly: {stripped[:80]}",
                        "severity": "CRITICAL",
                    })
        except Exception:
            continue


def i3_no_cross_layer_leak(paths: list[Path], violations: list[dict]):
    for p in paths:
        if not p.is_file() or p.name not in ARTIFACT_ROLES:
            continue
        role = ARTIFACT_ROLES[p.name]
        layer = LAYER_DEFINITIONS[role]
        try:
            raw = p.read_text()
        except Exception:
            continue
        for forbidden in layer["forbidden"]:
            if f'"{forbidden}"' in raw:
                violations.append({
                    "violation_type": "CROSS_LAYER_LEAK",
                    "location": str(p),
                    "description": f"Artifact role={role} contains forbidden key '{forbidden}'",
                    "severity": "CRITICAL",
                })


def run(paths: list[Path], violations: list[dict]):
    i1_no_recursive_wrappers(paths, violations)
    i2_no_state_in_schema(paths, violations)
    i2_no_state_inference(paths, violations)
    i3_no_cross_layer_leak(paths, violations)
