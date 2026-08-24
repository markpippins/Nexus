"""Cascade event emission for absorb (architect decision, plan 0003).

Stage-3 conformant: events land in `cascade.events` using the
`nexus.<domain>.v1.<event_type>` catalog convention; the DB is the source of
truth (bus at-least-once downstream). Emission is best-effort — a bus failure
must never fail an ingest run that already committed.

Minimal event set (per decision):
    absorb.run.started       {profile_id, version, planned_count}
    absorb.source.completed  {run_id, source_hash, watermark}
    absorb.step.failed       {run_id, step, error_code, retryable}
    absorb.run.completed     {counts, warnings[], policy_skips[]}

Envelope mapping: correlation_id = invocation run_id; aggregate_type =
source|profile; aggregate_id = content hash / profile id; causation chains
events within one invocation. No step-level completion events (deferred —
~7k events for the full corpus was ruled excessive).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from .core import pg

DOMAIN = "nexus.absorb.v1"


def _uuid_or_none(value: str | None) -> str | None:
    """Envelope columns correlation_id/causation_id are UUID-typed. Non-UUID
    ids must coerce to NULL rather than fail the insert (hardened after the
    probe caught exactly this). Real batches use uuid4(), but robustness here
    keeps emission best-effort under all inputs."""
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError):
        return None


def emit_event(event_type: str, *, aggregate_type: str, aggregate_id: str,
               payload: dict, correlation_id: str | None = None,
               causation_id: str | None = None,
               caused_by_event_type: str | None = None,
               source: str = "absorb.runner") -> str | None:
    """Insert one conformant event into cascade.events.

    Best-effort by design: returns the new event_id, or None if the bus is
    unavailable (ingest state is already committed; the decision makes the
    DB canonical and the bus at-least-once).
    """
    full_type = f"{DOMAIN}.{event_type}"          # e.g. nexus.absorb.v1.run.started
    payload = dict(payload)
    payload["subject"] = full_type                # catalog subject travels in-payload
    now = datetime.now(timezone.utc).isoformat()
    eid = str(uuid.uuid4())
    try:
        with pg() as conn:
            with conn.cursor() as cur:
                # keep raw ids visible in payload even when envelope coerces to NULL
                payload["correlation_id"] = correlation_id
                cur.execute(
                    """INSERT INTO cascade.events (
                           event_id, event_type, source, event_timestamp,
                           payload, aggregate_type, aggregate_id,
                           actor_type, actor_id,
                           correlation_id, causation_id, caused_by_event_type)
                       VALUES (%s::uuid,%s,%s,%s,%s::jsonb,%s,%s,'system','absorb',
                               %s::uuid,%s::uuid,%s)""",
                    (eid, full_type, source, now, json.dumps(payload),
                     aggregate_type, aggregate_id,
                     _uuid_or_none(correlation_id), _uuid_or_none(causation_id),
                     caused_by_event_type))
        return eid
    except Exception as err:                       # noqa: BLE001 — never break ingest
        print(f"  [events] WARN E_TRANSIENT_EVENT_BUS: {err}")
        return None


# ── Lifecycle helpers (the four-event minimal set) ───────────────────

def emit_run_started(batch_id: str, profile_id: str, version: int, planned_count: int) -> str | None:
    return emit_event(
        "run.started",
        aggregate_type="profile", aggregate_id=profile_id,
        correlation_id=batch_id,
        payload={"profile_id": profile_id, "version": version,
                 "planned_count": planned_count},
    )


def emit_source_completed(batch_id: str, run_id: str, content_hash: str,
                          watermark: str, causation_id: str | None = None) -> str | None:
    return emit_event(
        "source.completed",
        aggregate_type="source", aggregate_id=content_hash,
        correlation_id=batch_id, causation_id=causation_id,
        caused_by_event_type=f"{DOMAIN}.run.started" if causation_id else None,
        payload={"run_id": run_id, "source_hash": content_hash, "watermark": watermark},
    )


def emit_step_failed(batch_id: str, run_id: str, step: str, error_code: str,
                     retryable: bool) -> str | None:
    return emit_event(
        "step.failed",
        aggregate_type="source", aggregate_id=run_id,
        correlation_id=batch_id,
        payload={"run_id": run_id, "step": step,
                 "error_code": error_code, "retryable": retryable},
    )


def emit_run_completed(batch_id: str, counts: dict, warnings: list,
                       policy_skips: list, causation_id: str | None = None) -> str | None:
    return emit_event(
        "run.completed",
        aggregate_type="profile", aggregate_id="batch",
        correlation_id=batch_id, causation_id=causation_id,
        payload={"counts": counts, "warnings": warnings, "policy_skips": policy_skips},
    )
