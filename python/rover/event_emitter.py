"""event_emitter.py — Cascade event emitter for Rover scripts.

Writes semantic transition events to cascade.events table. Every Rover
script that performs a state mutation can call emit_event() to record the
transition in the cascade event bus.

The cascade.events table is the canonical event log. Events emitted here
are the causal substrate underneath the UI projections — they describe
what happened, and subscribers decide what to do about it.

Design follows ~/dev/event-ideas.txt:
  - Events live around the arrows (transitions), not the boxes (entities)
  - caused_by_event_type carries semantic lineage (e.g. 'candidate.promoted')
  - causation_id carries the specific triggering event UUID
  - actor_type distinguishes user | agent | system

Usage::

    from event_emitter import emit_event

    event_id = emit_event(
        event_type="candidate.promoted",
        source="rover.candidate_promote",
        aggregate_type="harvest_candidate",
        aggregate_id=candidate_id,
        payload={"from_state": "useful", "to_state": "promoted"},
        actor_type="agent",
    )

    # Downstream events can reference this as their cause:
    emit_event(
        event_type="intent_record.created",
        source="rover.candidate_promote",
        aggregate_type="intent_record",
        aggregate_id=intent_id,
        causation_id=event_id,
        caused_by_event_type="candidate.promoted",
        payload={"source_candidate_id": candidate_id},
    )

Standalone scripts::

    python3 event_emitter.py --test    # insert a test event and print it
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg2

# ── DB config (matches other rover scripts) ──────────────────────────
DB_CONFIG = {
    "host": os.getenv("PG_HOST", "localhost"),
    "port": int(os.getenv("PG_PORT", "5432")),
    "database": os.getenv("PG_DATABASE", "nexus"),
    "user": os.getenv("PG_USER", "pguser"),
    "password": os.getenv("PG_PASSWORD", "pgpass"),
}


def _get_conn():
    """Open a psycopg2 connection to the nexus database."""
    return psycopg2.connect(**DB_CONFIG)


# ── Core emitter ─────────────────────────────────────────────────────

def emit_event(
    event_type: str,
    source: str,
    aggregate_type: str | None = None,
    aggregate_id: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_type: str = "agent",
    actor_id: str = "",
    correlation_id: str | None = None,
    causation_id: str | None = None,
    caused_by_event_type: str | None = None,
    *,
    conn=None,
) -> str:
    """Emit a single event to cascade.events.

    Returns the event_id UUID as a string, so callers can use it as
    causation_id for downstream events in the same chain.
    """
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payload = payload or {}

    close_conn = False
    if conn is None:
        conn = _get_conn()
        close_conn = True

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cascade.events (
                    event_id, event_type, source, event_timestamp,
                    payload, aggregate_type, aggregate_id,
                    actor_type, actor_id,
                    correlation_id, causation_id, caused_by_event_type
                ) VALUES (
                    %s::uuid, %s, %s, %s,
                    %s::jsonb, %s, %s,
                    %s, %s,
                    %s::uuid, %s::uuid, %s
                )
                """,
                (
                    event_id,
                    event_type,
                    source,
                    now,
                    json.dumps(payload),
                    aggregate_type,
                    aggregate_id,
                    actor_type,
                    actor_id,
                    correlation_id,
                    causation_id,
                    caused_by_event_type,
                ),
            )
        if close_conn:
            conn.commit()
    except Exception as e:
        # Don't let event emission break the caller's workflow
        print(f"[event_emitter] WARNING: failed to emit {event_type}: {e}",
              file=sys.stderr)
        if close_conn:
            conn.rollback()
    finally:
        if close_conn:
            conn.close()

    return event_id


def emit_events(
    events: list[dict[str, Any]],
    *,
    conn=None,
) -> list[str]:
    """Emit multiple events in a single transaction.

    Each dict should have the same keys as emit_event()'s parameters.
    Returns a list of event_id UUIDs in the same order.
    """
    close_conn = False
    if conn is None:
        conn = _get_conn()
        close_conn = True

    event_ids: list[str] = []
    try:
        for evt in events:
            eid = emit_event(**evt, conn=conn)
            event_ids.append(eid)
        if close_conn:
            conn.commit()
    except Exception as e:
        print(f"[event_emitter] WARNING: batch emit failed at event {len(event_ids)}: {e}",
              file=sys.stderr)
        if close_conn:
            conn.rollback()
    finally:
        if close_conn:
            conn.close()

    return event_ids


# ── Convenience functions for common pipeline events ─────────────────

def emit_harvest_captured(
    harvest_id: str,
    title: str = "",
    source: str = "rover.ingest",
    **kwargs,
) -> str:
    """Emit: harvest.captured — a new harvest was ingested."""
    return emit_event(
        event_type="harvest.captured",
        source=source,
        aggregate_type="harvest",
        aggregate_id=harvest_id,
        payload={"title": title},
        **kwargs,
    )


def emit_candidate_discovered(
    candidate_id: str,
    harvest_id: str | None = None,
    title: str = "",
    cpf: float | None = None,
    source: str = "rover.batch_file_candidates",
    **kwargs,
) -> str:
    """Emit: candidate.discovered — Rover found a candidate-worthy concept."""
    return emit_event(
        event_type="candidate.discovered",
        source=source,
        aggregate_type="harvest_candidate",
        aggregate_id=candidate_id,
        payload={"harvest_id": harvest_id, "title": title, "cpf": cpf},
        **kwargs,
    )


def emit_candidate_classified(
    candidate_id: str,
    system_id: str | None = None,
    subsystem_id: str | None = None,
    source: str = "rover.batch_classify_unmapped",
    **kwargs,
) -> str:
    """Emit: candidate.classified — candidate mapped to hierarchy."""
    return emit_event(
        event_type="candidate.classified",
        source=source,
        aggregate_type="harvest_candidate",
        aggregate_id=candidate_id,
        payload={"system_id": system_id, "subsystem_id": subsystem_id},
        **kwargs,
    )


def emit_candidate_completed(
    candidate_id: str,
    matched_via: str = "",
    source: str = "rover.reconcile",
    **kwargs,
) -> str:
    """Emit: candidate.completed — candidate marked as done."""
    return emit_event(
        event_type="candidate.completed",
        source=source,
        aggregate_type="harvest_candidate",
        aggregate_id=candidate_id,
        payload={"matched_via": matched_via},
        **kwargs,
    )


def emit_candidate_promoted(
    candidate_id: str,
    intent_record_id: str | None = None,
    from_state: str = "useful",
    cpf: float | None = None,
    source: str = "rover.candidate_promote",
    **kwargs,
) -> str:
    """Emit: candidate.promoted — candidate promoted into the pipeline.

    Returns the event_id so callers can use it as causation_id for
    the intent_record.created event that follows.
    """
    return emit_event(
        event_type="candidate.promoted",
        source=source,
        aggregate_type="harvest_candidate",
        aggregate_id=candidate_id,
        payload={
            "from_state": from_state,
            "to_state": "promoted",
            "intent_record_id": intent_record_id,
            "cpf": cpf,
        },
        **kwargs,
    )


def emit_intent_record_created(
    intent_id: str,
    source_candidate_id: str | None = None,
    cpf: float | None = None,
    source: str = "rover.candidate_promote",
    causation_id: str | None = None,
    **kwargs,
) -> str:
    """Emit: intent_record.created — an intent record was created from a candidate."""
    return emit_event(
        event_type="intent_record.created",
        source=source,
        aggregate_type="intent_record",
        aggregate_id=intent_id,
        payload={"source_candidate_id": source_candidate_id, "cpf": cpf},
        caused_by_event_type="candidate.promoted",
        causation_id=causation_id,
        **kwargs,
    )


def emit_agenda_created(
    agenda_id: str,
    title: str = "",
    source_count: int = 0,
    source: str = "rover.agenda_matcher",
    **kwargs,
) -> str:
    """Emit: agenda.created — a new agenda was created."""
    return emit_event(
        event_type="agenda.created",
        source=source,
        aggregate_type="agenda",
        aggregate_id=agenda_id,
        payload={"title": title, "source_count": source_count},
        **kwargs,
    )


def emit_agenda_item_added(
    agenda_id: str,
    item_id: str,
    source_type: str = "",
    source_id: str | None = None,
    source: str = "rover.agenda_matcher",
    **kwargs,
) -> str:
    """Emit: agenda.item_added — an item was added to an agenda."""
    return emit_event(
        event_type="agenda.item_added",
        source=source,
        aggregate_type="agenda_item",
        aggregate_id=item_id,
        payload={
            "agenda_id": agenda_id,
            "source_type": source_type,
            "source_id": source_id,
        },
        **kwargs,
    )


def emit_embedding_created(
    entity_type: str,
    entity_id: str,
    model: str = "",
    dimensions: int = 0,
    source: str = "rover.embed",
    **kwargs,
) -> str:
    """Emit: embedding.created — an embedding was computed for an entity."""
    return emit_event(
        event_type="embedding.created",
        source=source,
        aggregate_type=entity_type,
        aggregate_id=entity_id,
        payload={"model": model, "dimensions": dimensions},
        **kwargs,
    )


def emit_cross_reference_created(
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
    relationship: str,
    source: str = "rover",
    **kwargs,
) -> str:
    """Emit: cross_reference.created — a cross-reference edge was created."""
    return emit_event(
        event_type="cross_reference.created",
        source=source,
        aggregate_type="cross_reference",
        aggregate_id=None,
        payload={
            "source_type": source_type,
            "source_id": source_id,
            "target_type": target_type,
            "target_id": target_id,
            "relationship": relationship,
        },
        **kwargs,
    )


def emit_requirement_promoted_to_plan(
    requirement_id: str,
    plan_id: str | None = None,
    source: str = "rover.req_compiler",
    **kwargs,
) -> str:
    """Emit: requirement.promoted_to_plan — requirement compiled into a plan."""
    return emit_event(
        event_type="requirement.promoted_to_plan",
        source=source,
        aggregate_type="requirement",
        aggregate_id=requirement_id,
        payload={"plan_id": plan_id},
        **kwargs,
    )


# ── CLI test ─────────────────────────────────────────────────────────

def _test_emit():
    """Insert a test event and print it."""
    print("Emitting test event to cascade.events...")
    eid = emit_event(
        event_type="test.event",
        source="rover.event_emitter.cli",
        aggregate_type="test",
        aggregate_id="00000000-0000-0000-0000-000000000000",
        payload={"hello": "world", "test": True},
        actor_type="system",
        actor_id="event_emitter_test",
    )
    print(f"Event emitted: {eid}")

    # Read it back
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT event_type, source, payload FROM cascade.events WHERE event_id = %s::uuid",
                (eid,),
            )
            row = cur.fetchone()
            if row:
                print(f"  event_type: {row[0]}")
                print(f"  source: {row[1]}")
                print(f"  payload: {row[2]}")
            else:
                print("  (not found)")
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        _test_emit()
    else:
        print("Usage: python3 event_emitter.py --test")
