"""projector.py — Raw events → TransitionRequest / TransitionResult.

This is the first semantic layer. It asks:

    "Given only what happened, what transition occurred?"

It does NOT ask:

    "What should have happened?"

The first version may be ugly. Ugly but accurate beats elegant but invented.

Usage:

    # Project a saved evidence bundle:
    python3 -m cascade.conformance.projector artifacts/capture_*.json

    # Or import:
    from cascade.conformance.projector import project_bundle
    from cascade.conformance.probe import load_bundle
    bundle = load_bundle("artifacts/capture_abc123.json")
    request, result = project_bundle(bundle)
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field, asdict
from typing import Any

# ── Path setup ──────────────────────────────────────────────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)


# ── Semantic data model ─────────────────────────────────────────────
# These are the first-pass LOSM semantic primitives, discovered from
# observing real cascade events. They will evolve.

@dataclass
class TransitionRequest:
    """What the system attempted."""
    source_state: str
    target_state: str
    subject_id: str | None
    subject_type: str | None
    actor: str | None
    evidence_refs: list[dict[str, Any]] = field(default_factory=list)
    policy_context: dict[str, Any] = field(default_factory=dict)

    # Raw envelope references for traceability
    source_event_id: str | None = None
    source_event_ids: list[str] = field(default_factory=list)


@dataclass
class ArtifactRef:
    """A materialized artifact produced by a transition."""
    artifact_type: str      # e.g. "assessment", "forum_post", "agenda"
    artifact_id: str
    summary: str | None = None


@dataclass
class TransitionResult:
    """What the system actually produced."""
    outcome: str
    target_state: str
    subject_id: str | None
    artifacts: list[ArtifactRef] = field(default_factory=list)
    receipts: list[dict[str, Any]] = field(default_factory=list)
    lineage: list[dict[str, Any]] = field(default_factory=list)
    has_receipt: bool = False
    has_lineage: bool = False
    has_outcome: bool = False


# ── Helpers ─────────────────────────────────────────────────────────

def _find_pg_aggregate_id(raw_envelope: dict[str, Any]) -> str | None:
    """Navigate the CanonicalEnvelope nesting to find aggregate_id.

    CanonicalEnvelope.payload contains the inner event dict:
        {
            "id": ...,
            "type": ...,
            "payload": {
                "aggregate_id": "...",
                "aggregate_type": "...",
                "actor": "...",
                "raw": { full transition_event row }
            }
        }
    """
    payload = raw_envelope.get("payload") or {}
    inner_payload = payload.get("payload") if isinstance(payload, dict) else payload

    if isinstance(inner_payload, dict):
        agg_id = inner_payload.get("aggregate_id")
        if agg_id:
            return str(agg_id)

    # Fallback: try raw
    if isinstance(inner_payload, dict):
        raw = inner_payload.get("raw") or {}
        agg_id = raw.get("aggregate_id") if isinstance(raw, dict) else None
        if agg_id:
            return str(agg_id)

    return None


def _find_actor(raw_envelope: dict[str, Any]) -> str | None:
    """Extract the actor from the CanonicalEnvelope."""
    payload = raw_envelope.get("payload") or {}
    inner_payload = payload.get("payload") if isinstance(payload, dict) else payload
    if isinstance(inner_payload, dict):
        actor = inner_payload.get("actor")
        if actor:
            return str(actor)
        raw = inner_payload.get("raw") or {}
        if isinstance(raw, dict):
            actor = raw.get("actor")
            if actor:
                return str(actor)
    return raw_envelope.get("actor") or None


def _extract_outcome(
    raw_envelope: dict[str, Any],
    pg_conn: Any = None,
) -> str | None:
    """Extract the outcome from an assessment.completed event.

    The PG NOTIFY trigger only sends metadata columns (no payload), so
    the outcome is typically NOT in the NATS envelope. When envelope
    extraction fails, optionally query PG for the full row data.
    """
    # First try the envelope path
    payload = raw_envelope.get("payload") or {}
    inner_payload = payload.get("payload") if isinstance(payload, dict) else payload
    if isinstance(inner_payload, dict):
        raw = inner_payload.get("raw") or {}
        if isinstance(raw, dict):
            raw_payload = raw.get("payload") or {}
            if isinstance(raw_payload, dict):
                outcome = raw_payload.get("outcome")
                if outcome:
                    return outcome

    # Fallback: query PG for the full transition_event row
    if pg_conn is not None:
        event_id = raw_envelope.get("event_id")
        if event_id:
            try:
                cur = pg_conn.cursor()
                cur.execute(
                    """SELECT payload->>'outcome' FROM kernel.transition_event
                       WHERE event_id = %s::uuid""",
                    (event_id,),
                )
                row = cur.fetchone()
                if row and row[0]:
                    return row[0]
            except Exception:
                pass

    return None


# ── Projection ──────────────────────────────────────────────────────

def project_bundle(
    bundle: Any,
    pg_receipts: list[dict[str, Any]] | None = None,
    pg_conn: Any = None,
) -> tuple[TransitionRequest | None, TransitionResult | None]:
    """Project a raw evidence bundle into semantic primitives.

    Returns (request, result) or (None, None) if the bundle doesn't
    contain enough events to project.

    This is deliberately simple in v0.1. It looks for the first
    observation.captured and the first assessment.completed and
    projects those.
    """
    # Separate events by subject
    obs_events = [e for e in bundle.events if e.subject.endswith("observation.captured")]
    asm_events = [e for e in bundle.events if e.subject.endswith("assessment.completed")]

    if not obs_events:
        print("[projector] No observation.captured events in bundle — cannot project")
        return None, None

    # Use the first of each
    obs = obs_events[0]
    asm = asm_events[0] if asm_events else None

    # ── Build TransitionRequest from observation.captured ──
    obs_id = _find_pg_aggregate_id(obs.envelope)
    actor = _find_actor(obs.envelope)
    obs_event_id = obs.envelope.get("event_id")

    request = TransitionRequest(
        source_state="OBSERVATION_CAPTURED",
        target_state="ASSESSMENT_COMPLETED",
        subject_id=obs_id,
        subject_type="observation",
        actor=actor,
        source_event_id=obs_event_id,
        source_event_ids=[obs_event_id] if obs_event_id else [],
    )

    # ── Build TransitionResult from assessment.completed ──
    if not asm:
        # Only observed the request, not the result
        return request, None

    outcome = _extract_outcome(asm.envelope, pg_conn=pg_conn)
    asm_event_id = asm.envelope.get("event_id")

    artifacts: list[ArtifactRef] = []

    # The assessment itself is an artifact
    asm_id = _find_pg_aggregate_id(asm.envelope)
    if asm_id:
        artifacts.append(ArtifactRef(
            artifact_type="assessment",
            artifact_id=asm_id,
            summary=f"outcome={outcome}" if outcome else None,
        ))

    # Check for PG receipt data
    receipts = pg_receipts or bundle.pg_receipts or []

    # If we have a PG connection but no receipts yet, query them
    if pg_conn is not None and not receipts and obs_id:
        try:
            cur = pg_conn.cursor()
            cur.execute(
                """SELECT event_id::text, event_type, authority, timestamp,
                          payload->>'outcome' as outcome
                   FROM kernel.transition_event
                   WHERE aggregate_id = %s
                   ORDER BY id DESC LIMIT 10""",
                (obs_id,),
            )
            for row in cur.fetchall():
                receipts.append({
                    "event_id": row[0],
                    "event_type": row[1],
                    "authority": row[2],
                    "timestamp": str(row[3]),
                    "outcome": row[4],
                })
        except Exception:
            pass

    result = TransitionResult(
        outcome=outcome or "unknown",
        target_state="ASSESSMENT_COMPLETED",
        subject_id=obs_id,
        artifacts=artifacts,
        receipts=receipts,
        lineage=[{"event_id": obs_event_id, "type": "source"},
                 {"event_id": asm_event_id, "type": "result"}] if obs_event_id or asm_event_id else [],
        has_receipt=len(receipts) > 0,
        has_lineage=True,
        has_outcome=outcome is not None,
    )

    print(f"\n[projector] Projected transition:")
    print(f"  Source: {request.source_state} → {request.target_state}")
    print(f"  Subject: {request.subject_id[:12] if request.subject_id else '?'}...")
    print(f"  Actor: {request.actor}")
    print(f"  Outcome: {result.outcome}")
    print(f"  Artifacts: {len(result.artifacts)}")
    print(f"  Receipts: {len(result.receipts)}")
    print(f"  Lineage: {len(result.lineage)} edge(s)")

    return request, result


def project_file(filepath: str) -> tuple[TransitionRequest | None, TransitionResult | None]:
    """Load an evidence bundle from file and project it."""
    from cascade.conformance.probe import load_bundle
    bundle = load_bundle(filepath)
    return project_bundle(bundle)


# ── Entry point ─────────────────────────────────────────────────────

def main() -> None:
    """Project one or more evidence bundle files."""
    import sys
    files = sys.argv[1:] if len(sys.argv) > 1 else []

    if not files:
        from cascade.conformance.probe import list_bundles
        files = list_bundles()[-2:]  # Default: last 2 bundles
        if not files:
            print("[projector] No evidence bundles found. Run probe.py first.")
            sys.exit(1)
        print(f"[projector] Using latest bundles: {[os.path.basename(f) for f in files]}")

    for f in files:
        print(f"\n{'='*60}")
        print(f"[projector] Projecting: {f}")
        req, res = project_file(f)
        if req:
            print(f"[projector] OK — {req.source_state} → {res.target_state if res else '?'}")


if __name__ == "__main__":
    main()
