"""
Authority uniqueness pass (I7).
Detects duplicate lifecycle definitions, transition declarations,
invariants, and alternate canonical mappings outside pgv.state_machine.json.
"""

import json
from pathlib import Path


STATE_MACHINE_FILENAME = "pgv.state_machine.json"


def _load_state_machine_state_names(paths: list[Path]) -> set[str]:
    for p in paths:
        if p.name == STATE_MACHINE_FILENAME:
            try:
                data = json.loads(p.read_text())
                return set(data.get("states", {}).keys())
            except (json.JSONDecodeError, Exception):
                return set()
    return set()


TRANSITION_PATTERNS = ["transitions", "from", "to", "entropy_cost", "guard"]
INVARIANT_PATTERNS = ["invariants", "invariant_id", "scope", "enforcement"]


def run(paths: list[Path], classified: dict[str, str], violations: list[dict]):
    state_names = _load_state_machine_state_names(paths)
    if not state_names:
        return

    state_machine_path = None
    for p in paths:
        if p.name == STATE_MACHINE_FILENAME:
            state_machine_path = p
            break

    for p in sorted(paths):
        if not p.is_file() or p.suffix not in (".json", ".py", ".sh", ".yaml", ".yml"):
            continue

        if p == state_machine_path:
            continue

        pp = str(p)
        domain = classified.get(pp, "UNKNOWN")

        # DATA files are exempt — they contain golden state names as values
        if domain == "DATA":
            continue

        try:
            raw = p.read_text()
        except Exception:
            continue

        # Check for state name duplication
        for state in state_names:
            if f'"{state}"' in raw:
                violations.append({
                    "violation_type": "AUTHORITY_DRIFT",
                    "location": pp,
                    "description": f"State '{state}' appears outside authoritative state machine (pgv.state_machine.json)",
                    "severity": "CRITICAL",
                })

        # Check for transition pattern duplication
        has_transition_def = False
        for pattern in ["\"transitions\"", "\"from\"", "\"to\""]:
            if f'{pattern}:' in raw or f'{pattern} :' in raw:
                has_transition_def = True
                break
        if has_transition_def:
            violations.append({
                "violation_type": "AUTHORITY_DRIFT",
                "location": pp,
                "description": f"Transition definition pattern found outside authoritative state machine — 'from'/'to' pairs should only exist in pgv.state_machine.json",
                "severity": "CRITICAL",
            })

        # Check for invariant definition duplication
        has_invariant_def = False
        for pattern in ["\"invariants\"", "\"invariant_id\""]:
            if f'{pattern}:' in raw or f'{pattern} :' in raw:
                has_invariant_def = True
                break
        if has_invariant_def and domain not in ("STATE_MACHINE", "DATA"):
            violations.append({
                "violation_type": "AUTHORITY_DRIFT",
                "location": pp,
                "description": f"Invariant definition found outside authoritative state machine — invariants should only be defined in pgv.state_machine.json",
                "severity": "CRITICAL",
            })

        # Check for alternate canonical mapping patterns (PHASE_MAP-class)
        if "PHASE_MAP" in raw or "phase_map" in raw.lower():
            violations.append({
                "violation_type": "AUTHORITY_DRIFT",
                "location": pp,
                "description": "Alternate canonical mapping (PHASE_MAP-style) detected outside state machine — lifecycle state mappings must derive from pgv.state_machine.json only",
                "severity": "CRITICAL",
            })
