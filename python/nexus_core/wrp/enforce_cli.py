"""
CIR-SDM enforcement CLI (T23 Step 8 dispatch wiring) — subprocess bridge.

conduit-mcp (TypeScript) invokes this module at WR-transition admission to run
the per-family enforcement caller over the WR's ordered event stream plus the
proposed transition. Reads events JSON on stdin, prints a JSON decision on
stdout. The ONLY environment read is ``CIR_SDM_ENFORCE`` (read here, by the
enforcement caller — never inside the pure ``evaluate()``); per RULING R-D
(record 2487aef3, 2026-08-25) it is demoted to a *bootstrap default* — once
``resolution.enforcement_posture`` rows exist the database wins.

Decision path (R-D): load posture rows from the DB (``load_posture_rows``),
resolve the enforced set DB-first, run the pure ``evaluate()``, then record
each detected rule failure through the SOL-framed gates
(``cir_sdm_gate.evaluate_cir_sdm_violation`` + ``evaluate_ccnf_version_lock``)
into ``peb.transactions`` (advisory record-then-act — a recording or gate
failure never flips the decision and never raises; genuinely malformed input
that cannot even build a proposition still raises, R-D R4).

Input (stdin JSON)::

    {
      "events":   [ <normalize_event Kind-1 or Kind-2 dicts> ],
      "proposed": { "type": "WR_CLAIMED", "wrId": "...", "timestamp": "..." }
    }

Output (stdout JSON)::

    {
      "state":      "shadow" | "enforced",
      "enforced":   true | false,
      "posture_source": "database" | "bootstrap",
      "rules":      ["cir-sdm.one-way-gate"],
      "violations": [ {rule_id, rule_version, severity, event_id, cer_id,
                       description, blocking, violation_id}, ... ],
      "decisions":  [ ...blocking violations only... ],
      "reject":     true | false
    }

``--state-only`` prints ``render_enforcement_state(env_value, posture)`` and
exits 0 — the startup audit line the dispatch service logs once at boot
(ruling 4a57c089; posture-aware under R-D).

Usage::

    python -m nexus_core.wrp.enforce_cli --state-only
    echo '{"events":[...],"proposed":{...}}' | python -m nexus_core.wrp.enforce_cli
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional, Sequence

from nexus_core.wrp.cir_sdm import CIRViolation, RULE_VERSION_LOCK
from nexus_core.wrp.cir_sdm_gate import (
    evaluate_ccnf_version_lock,
    evaluate_cir_sdm_violation,
)
from nexus_core.wrp.enforcement import (
    ENFORCED_RULES_KEY,
    enforce,
    governed_decisions,
    load_posture_rows,
    render_enforcement_state,
    resolve_enforced_rules,
)

__all__ = [
    "enforce_stream",
    "violation_to_dict",
    "main",
]


def violation_to_dict(v: CIRViolation) -> Dict[str, Any]:
    """Serialize a :class:`CIRViolation` for the CLI JSON decision."""
    return {
        "violation_id": v.violation_id,
        "rule_id": v.rule_id,
        "rule_version": v.rule_version,
        "severity": v.severity,
        "event_id": v.event_id,
        "cer_id": v.cer_id,
        "description": v.description,
        "detected_at": v.detected_at or None,
        "blocking": v.blocking,
    }


def enforce_stream(
    events: Sequence[Any],
    proposed: Optional[Dict[str, Any]] = None,
    *,
    env_value: Optional[str] = None,
    posture_rows: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Run enforcement over the stream (+ proposed transition) and return the
    JSON decision dict. Pure — the env value and posture rows are passed in
    explicitly by the caller (R-D: DB posture wins once rows exist)."""
    stream: List[Any] = list(events)
    if proposed:
        stream.append(proposed)

    violations = enforce(stream, env_value=env_value, posture_rows=posture_rows)
    decisions = governed_decisions(violations)
    rules = sorted(resolve_enforced_rules(env_value, posture_rows))

    return {
        "state": "shadow" if not rules else "enforced",
        "enforced": bool(rules),
        "posture_source": "database" if posture_rows else "bootstrap",
        "rules": rules,
        "violations": [violation_to_dict(v) for v in violations],
        "decisions": [violation_to_dict(v) for v in decisions],
        "reject": bool(decisions),
    }


def _record_gate_outcomes(
    violations: Sequence[Dict[str, Any]],
    posture_rows: Optional[Sequence[Dict[str, Any]]],
) -> None:
    """R-D R4 — record each well-formed rule failure through the SOL gates.

    Advisory only: a gate/recording failure never flips the decision and
    never raises. Version-lock violations additionally route through the #6
    proposition (framed on the offending event's ``ccnf_version``) when the
    offending event is present in the payload. The gates themselves perform
    the ``peb.transactions`` write (record-then-act).
    """
    for v in violations:
        try:
            evaluate_cir_sdm_violation(v, posture_rows)
        except Exception:  # noqa: BLE001 — advisory path must never raise
            pass


def _record_version_lock_outcomes(
    events: Sequence[Any],
    violations: Sequence[Dict[str, Any]],
    posture_rows: Optional[Sequence[Dict[str, Any]]],
) -> None:
    """#6 — route version-lock failures through the CCNF version gate.

    Finds the offending CER in the payload stream (by ``event_id``) and
    evaluates the version-governed proposition against its ``ccnf_version``.
    Advisory: never raises, never flips the decision.
    """
    by_id = {}
    for ev in events:
        if isinstance(ev, dict) and ev.get("event_id"):
            by_id.setdefault(ev["event_id"], ev)
    for v in violations:
        if v.get("rule_id") != RULE_VERSION_LOCK:
            continue
        ev = by_id.get(v.get("event_id", ""))
        if not ev or not isinstance(ev, dict):
            continue
        try:
            evaluate_ccnf_version_lock(ev, posture_rows)
        except ValueError:
            pass  # R4: genuinely malformed → upstream contract error, no record
        except Exception:  # noqa: BLE001 — advisory: never raise the CLI
            pass


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CIR-SDM enforcement CLI (conduit-mcp dispatch bridge)")
    parser.add_argument("--state-only", action="store_true",
                        help="print the startup enforcement state line and exit")
    args = parser.parse_args(argv)

    env_value = os.environ.get(ENFORCED_RULES_KEY)

    if args.state_only:
        # Read posture only for the audit line — the subprocess bridge
        # (docker exec -i) must never touch the payload pipe first.
        posture = load_posture_rows()
        print(render_enforcement_state(env_value, posture))
        return 0

    raw = sys.stdin.read()
    payload: Dict[str, Any] = {}
    if raw.strip():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            print(json.dumps({"error": f"invalid stdin JSON: {e}"}),
                  file=sys.stderr)
            return 2

    # Load posture AFTER consuming stdin — load_posture_rows shells to
    # docker exec -i which would otherwise consume the pipe.
    posture = load_posture_rows()

    events = payload.get("events") or []
    proposed = payload.get("proposed")
    result = enforce_stream(events, proposed, env_value=env_value,
                            posture_rows=posture)
    # R-D advisory record-then-act: SOL-framed gate recording of every
    # detected rule failure (never flips the decision, never raises).
    _record_gate_outcomes(result["violations"], posture)
    _record_version_lock_outcomes(events, result["violations"], posture)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
