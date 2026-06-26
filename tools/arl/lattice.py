"""
Enforcement matrix pass (I8).
Checks forbidden cross-role relationships per CIR-SDM lattice rules.
"""

import json
from pathlib import Path

ENFORCEMENT_MATRIX = {
    "SCHEMA": {
        "forbidden_keys": ["states", "transitions", "events", "invariants", "entropy_scale", "guards", "execution_state"],
        "description": "Schema layer must not define state machine concepts or runtime state",
    },
    "CONFIG": {
        "forbidden_keys": ["states", "transitions", "events", "invariants", "execution_state", "canonical_state"],
        "description": "Config layer must not define state, lifecycle, or runtime state",
    },
    "LEDGER": {
        "forbidden_keys": ["states", "transitions", "invariants", "entropy_scale", "guards", "execution_state"],
        "description": "Ledger layer must not define state machine structure or runtime state",
    },
    "STATE_MACHINE": {
        "forbidden_keys": ["events", "execution_state", "canonical_state"],
        "description": "State machine must not define ledger events or runtime state",
    },
    "CODE": {
        "forbidden_keys": ["canonical_state", "execution_state"],
        "description": "Code must not directly reference or compute canonical state — that is the state compiler's sole authority",
    },
    "METADATA": {
        "forbidden_keys": ["states", "transitions", "events", "invariants"],
        "description": "Metadata must not define lifecycle concepts",
    },
    "DATA": {
        "forbidden_keys": [],
        "description": "Data layer is exempt from lattice enforcement",
    },
    "BUILD": {
        "forbidden_keys": [],
        "description": "Build layer is exempt from lattice enforcement",
    },
}


# Restrict to the 5 known governance artifacts (same scope as old I3),
# plus any file explicitly classified into a governance domain.
GOVERNANCE_ARTIFACT_NAMES = {
    "work_request.schema.json",
    "pipeline-mode.json",
    "transition_ledger.json",
    "pgv.state_machine.json",
    "pgv.phase",
}


def run(paths: list[Path], classified: dict[str, str], violations: list[dict]):
    for p in sorted(paths):
        if not p.is_file():
            continue
        pp = str(p)
        domain = classified.get(pp)

        # Only enforce lattice on known governance artifacts or classified files
        if p.name not in GOVERNANCE_ARTIFACT_NAMES and domain not in (
            "SCHEMA", "CONFIG", "LEDGER", "STATE_MACHINE",
        ):
            continue

        rules = ENFORCEMENT_MATRIX.get(domain) if domain else None
        if rules is None:
            continue
        if not rules["forbidden_keys"]:
            continue

        try:
            raw = p.read_text()
        except Exception:
            continue

        for key in rules["forbidden_keys"]:
            pattern = f'"{key}"'
            if pattern in raw:
                violations.append({
                    "violation_type": "LATTICE_VIOLATION",
                    "location": pp,
                    "description": f"{rules['description']}: found forbidden key '{key}' in {domain} artifact",
                    "severity": "CRITICAL",
                })
