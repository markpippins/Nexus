"""
CIR-SDM shadow measurement (T23 Step 6) — FP/FN baseline over live/replay data.

This is the *measurement* side of the shadow-mode doctrine: run
:func:`nexus_core.wrp.cir_sdm.evaluate` over a real ordered event stream in
shadow mode (nothing blocks) and report the false-positive / false-negative
baseline. It is the reproducible harness the architect re-runs over a defined
measurement window before Step 7 (per-family enforcement gate) may proceed.

Design (mirrors the zero-dependency rule of ``cir_sdm.py``):

* ``measure`` / ``inject_*`` / ``render_report`` are pure functions — no DB,
  no network, no wall clock. The *only* I/O is the CLI's read of an event
  dump produced externally (see below), so the DB dependency stays outside
  the cross-kernel-safe module.
* The event dump is the conduit runtime event log
  (``conduit.work_request_events``) exported as a TSV via psql:

    SELECT event_id, work_request_id, event_type,
           coalesce(causation_id::text,''), actor_type,
           extract(epoch from occurred_at)::bigint
    FROM conduit.work_request_events ORDER BY sequence_number;

  Columns (tab-separated): event_id, work_request_id, event_type,
  causation_id, actor_type, occurred_at_epoch.

* FP measurement = shadow-evaluate the clean stream → count violations. A
  violation on a genuinely-clean stream is a candidate false positive to
  classify (rule bug vs data-provenance gap).
* FN measurement = inject a *labeled* corruption (a known-illegal reverse
  transition) into the stream → confirm the rule catches exactly it. A missed
  injection is a false negative.

Usage::

    # export the live log, then measure
    python -m nexus_core.wrp.shadow_measure /tmp/wr_events.tsv
    # FN self-check: also inject a labeled reverse transition
    python -m nexus_core.wrp.shadow_measure --inject /tmp/wr_events.tsv
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from nexus_core.wrp.cir_sdm import (
    CIRViolation,
    evaluate,
)

__all__ = [
    "ShadowMeasurement",
    "measure",
    "inject_reverse_transition",
    "parse_tsv",
    "render_report",
    "main",
]

# A deliberately-labeled corruption id — deterministic so the FN self-check
# can assert the injected event is the one that gets caught.
INJECTED_EVENT_ID = "shadow-measure-injected-reverse-transition"


@dataclass(frozen=True)
class ShadowMeasurement:
    """One shadow FP/FN measurement result (T23 Step 6 report shape)."""

    total_events: int
    wr_events: int
    cer_events: int
    total_violations: int
    by_rule: Dict[str, int]
    by_severity: Dict[str, int]
    violations: List[CIRViolation] = field(default_factory=list)
    injected: bool = False
    injected_caught: Optional[bool] = None


def measure(
    events: Sequence[Any],
    *,
    injected: bool = False,
    injected_caught: Optional[bool] = None,
) -> ShadowMeasurement:
    """Shadow-evaluate an ordered stream and summarize the violation baseline.

    ``injected``/``injected_caught`` record the FN self-check outcome; pass
    them when the stream includes an injected corruption so the report can
    state whether it was detected.
    """
    from nexus_core.wrp.cir_sdm import normalize_event

    violations = evaluate(events)  # shadow mode: nothing blocks
    normalized = [normalize_event(e) for e in events]
    by_rule = Counter(v.rule_id for v in violations)
    by_severity = Counter(v.severity for v in violations)
    return ShadowMeasurement(
        total_events=len(normalized),
        wr_events=sum(1 for e in normalized if e.is_wr_event),
        cer_events=sum(1 for e in normalized if e.is_cer),
        total_violations=len(violations),
        by_rule=dict(sorted(by_rule.items())),
        by_severity=dict(sorted(by_severity.items())),
        violations=violations,
        injected=injected,
        injected_caught=injected_caught,
    )


def inject_reverse_transition(events: Sequence[Any]) -> List[Any]:
    """FN self-check: append a known-illegal reverse transition to a copy.

    Picks the first WR that has already reached a terminal/near-terminal state
    and appends a ``WR_CLAIMED`` event (illegal from that WR's current state).
    Returns a NEW list; the input is never mutated (CIRS-4 / AC11).
    """
    from nexus_core.wrp.cir_sdm import normalize_event

    materialized = [dict(e) if isinstance(e, dict) else e for e in events]
    # Find the WR that has advanced farthest (a WR_CLAIMED/ACKED event).
    advanced_wr: Optional[str] = None
    for e in reversed(materialized):
        if not isinstance(e, dict):
            continue
        etype = e.get("type") or e.get("event_type")
        if etype in ("WR_ACKED", "WR_CLAIMED", "WR_SETTLED", "WR_FAILED"):
            advanced_wr = e.get("wrId") or e.get("wr_id") or e.get("work_request_id")
            if advanced_wr:
                break
    if advanced_wr is None:
        # No advanced WR in the stream — inject against a synthetic WR whose
        # single illegal first event is WR_CLAIMED (still caught, from DRAFT).
        advanced_wr = "shadow-measure-fn-wr"

    materialized.append({
        "event_id": INJECTED_EVENT_ID,
        "type": "WR_CLAIMED",
        "wrId": advanced_wr,
        "timestamp": None,
    })
    return materialized


def _parse_epoch(value: str) -> Optional[int]:
    value = value.strip()
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def parse_tsv(text: str) -> List[Dict[str, Any]]:
    """Parse a psql TSV dump of ``conduit.work_request_events`` into DB-row
    shaped dicts (the ``normalize_event`` Kind-2 form)."""
    rows: List[Dict[str, Any]] = []
    for line in text.splitlines():
        line = line.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        event_id, work_request_id, event_type = parts[0], parts[1], parts[2]
        causation, actor_type, occurred_at = parts[3], parts[4], parts[5]
        rows.append({
            "event_id": event_id,
            "work_request_id": work_request_id,
            "event_type": event_type,
            "causation_id": causation or None,
            "actor_type": actor_type,
            "occurred_at": _parse_epoch(occurred_at),
        })
    return rows


def render_report(m: ShadowMeasurement) -> str:
    """Render a human-readable (markdown) shadow measurement report."""
    lines: List[str] = [
        "## Shadow measurement (T23 Step 6)",
        f"- events: {m.total_events} (WR: {m.wr_events}, CER: {m.cer_events})",
        f"- violations (shadow, nothing blocks): {m.total_violations}",
        f"- by rule: {m.by_rule or {}}",
        f"- by severity: {m.by_severity or {}}",
    ]
    if m.injected:
        verdict = "CAUGHT" if m.injected_caught else "MISSED (false negative)"
        lines.append(f"- FN self-check (injected {INJECTED_EVENT_ID!r}): {verdict}")
    if m.violations:
        lines.append("")
        lines.append("### Violations")
        for v in m.violations:
            lines.append(
                f"- [{v.rule_id} v{v.rule_version}] {v.severity} "
                f"`{v.event_id}` — {v.description}")
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CIR-SDM shadow FP/FN measurement (T23 Step 6)")
    parser.add_argument("tsv", help="psql TSV dump of conduit.work_request_events")
    parser.add_argument("--inject", action="store_true",
                        help="also run the FN self-check (inject reverse transition)")
    args = parser.parse_args(argv)

    with open(args.tsv, "r", encoding="utf-8") as fh:
        rows = parse_tsv(fh.read())

    m = measure(rows)
    print(render_report(m))

    if args.inject:
        injected = inject_reverse_transition(rows)
        m_injected = measure(injected, injected=True)
        caught = any(v.event_id == INJECTED_EVENT_ID for v in m_injected.violations)
        m_injected = measure(injected, injected=True, injected_caught=caught)
        print("\n## FN self-check (injected stream)")
        print(render_report(m_injected))
        return 0 if caught else 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
