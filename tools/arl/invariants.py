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

# ─── Quarantine-envelope contract (reconciled with tools/cir1/patch.py) ─────
# patch.py writes a SINGLE sanctioned envelope shape when quarantining a
# violating value:
#
#     {"status": "quarantined_CIRn" | "blocked_by_CIRn",
#      "reason":  "<machine-readable reason>",
#      "original": <the wrapped value — may be a nested object>}
#
# The `status` prefix marks the envelope as sanctioned. ARL must NOT treat the
# envelope's object-valued `original` payload as RECURSIVE_WRAPPER (that is the
# wrapped value, not recursion), and must NOT count two SIBLING envelopes in one
# file as NESTED_QUARANTINE. Recursion is only envelope-inside-envelope-payload.
QUARANTINE_STATUS_PREFIXES = ("quarantined_CIR", "blocked_by_CIR")


def _is_quarantine_envelope(obj):
    """True if `obj` is a sanctioned patch.py quarantine envelope."""
    if not isinstance(obj, dict):
        return False
    s = obj.get("status")
    if not (isinstance(s, str) and s.startswith(QUARANTINE_STATUS_PREFIXES)):
        return False
    return isinstance(obj.get("reason"), str) and "original" in obj


def _contains_envelope(obj, depth=0):
    """True if a sanctioned quarantine envelope appears anywhere in `obj`."""
    if depth > 10:
        return False
    if isinstance(obj, dict):
        if _is_quarantine_envelope(obj):
            return True
        for v in obj.values():
            if _contains_envelope(v, depth + 1):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if _contains_envelope(item, depth + 1):
                return True
    return False


def _has_unsanctioned_original(obj, depth=0):
    """RECURSIVE_WRAPPER: an object-valued `original` key OUTSIDE a sanctioned
    envelope. Sanctioned envelopes are exempt; their payload is the wrapped
    value, not recursion."""
    if depth > 10:
        return False
    if isinstance(obj, dict):
        if _is_quarantine_envelope(obj):
            return False  # sanctioned envelope — payload is exempt
        for k, v in obj.items():
            if k == "original" and isinstance(v, dict):
                return True
            if _has_unsanctioned_original(v, depth + 1):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if _has_unsanctioned_original(item, depth + 1):
                return True
    return False


def _has_nested_envelope(obj, depth=0):
    """NESTED_QUARANTINE: a sanctioned envelope inside another envelope's
    payload (envelope-in-envelope = true recursion). Sibling envelopes at the
    same level are fine."""
    if depth > 10:
        return False
    if isinstance(obj, dict):
        if _is_quarantine_envelope(obj):
            if _contains_envelope(obj.get("original"), depth + 1):
                return True
        for v in obj.values():
            if _has_nested_envelope(v, depth + 1):
                return True
    elif isinstance(obj, list):
        for item in obj:
            if _has_nested_envelope(item, depth + 1):
                return True
    return False

LAYER_DEFINITIONS = {
    "SCHEMA":         {"keywords": [], "forbidden": ["states", "transitions", "entropy_cost"]},
    "CONFIG":         {"keywords": [], "forbidden": ["states", "transitions", "invariants", "events"]},
    "LEDGER":         {"keywords": ["events"], "forbidden": ["states", "transitions", "invariants", "entropy_scale", "guards"]},
    "STATE_MACHINE":  {"keywords": ["states", "transitions", "guards", "invariants"], "forbidden": ["events"]},
}


def i1_no_recursive_wrappers(paths: list[Path], violations: list[dict]):
    for p in paths:
        if not p.is_file() or p.suffix != ".json":
            continue
        try:
            data = json.loads(p.read_text())
        except (json.JSONDecodeError, Exception):
            continue

        if _has_unsanctioned_original(data):
            violations.append({
                "violation_type": "RECURSIVE_WRAPPER",
                "location": str(p),
                "description": "Contains 'original' with nested object value outside a sanctioned quarantine envelope (indicates recursive state wrapping)",
                "severity": "CRITICAL",
            })

        if _has_nested_envelope(data):
            violations.append({
                "violation_type": "NESTED_QUARANTINE",
                "location": str(p),
                "description": "A quarantine envelope is nested inside another envelope's payload (recursive quarantine)",
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
