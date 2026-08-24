"""
CIR-SDM enforcement CLI (T23 Step 8 dispatch wiring) — subprocess bridge.

conduit-mcp (TypeScript) invokes this module at WR-transition admission to run
the per-family enforcement caller over the WR's ordered event stream plus the
proposed transition. Reads events JSON on stdin, prints a JSON decision on
stdout. The ONLY environment read is ``CIR_SDM_ENFORCE`` (read here, by the
enforcement caller — never inside the pure ``evaluate()``).

Input (stdin JSON)::

    {
      "events":   [ <normalize_event Kind-1 or Kind-2 dicts> ],
      "proposed": { "type": "WR_CLAIMED", "wrId": "...", "timestamp": "..." }
    }

Output (stdout JSON)::

    {
      "state":      "shadow" | "enforced",
      "enforced":   true | false,
      "rules":      ["cir-sdm.one-way-gate"],
      "violations": [ {rule_id, rule_version, severity, event_id, cer_id,
                       description, blocking, violation_id}, ... ],
      "decisions":  [ ...blocking violations only... ],
      "reject":     true | false
    }

``--state-only`` prints ``render_enforcement_state(env)`` and exits 0 — the
startup audit line the dispatch service logs once at boot (ruling 4a57c089).

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

from nexus_core.wrp.cir_sdm import CIRViolation
from nexus_core.wrp.enforcement import (
    ENFORCED_RULES_KEY,
    enforce,
    governed_decisions,
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
) -> Dict[str, Any]:
    """Run enforcement over the stream (+ proposed transition) and return the
    JSON decision dict. Pure — the env value is passed in explicitly."""
    stream: List[Any] = list(events)
    if proposed:
        stream.append(proposed)

    violations = enforce(stream, env_value=env_value)
    decisions = governed_decisions(violations)
    rules = sorted(resolve_enforced_rules(env_value))

    return {
        "state": "shadow" if not rules else "enforced",
        "enforced": bool(rules),
        "rules": rules,
        "violations": [violation_to_dict(v) for v in violations],
        "decisions": [violation_to_dict(v) for v in decisions],
        "reject": bool(decisions),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CIR-SDM enforcement CLI (conduit-mcp dispatch bridge)")
    parser.add_argument("--state-only", action="store_true",
                        help="print the startup enforcement state line and exit")
    args = parser.parse_args(argv)

    env_value = os.environ.get(ENFORCED_RULES_KEY)

    if args.state_only:
        print(render_enforcement_state(env_value))
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

    events = payload.get("events") or []
    proposed = payload.get("proposed")
    result = enforce_stream(events, proposed, env_value=env_value)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
