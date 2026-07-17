"""assembly_subscriber.py — Listens for assessment.completed, creates forum posts.

Subscribes to ``nexus.kernel.v1.transition.assessment.completed`` via NATS,
queries the assessment from ``nebula.assessments`` (projected by trigger),
and translates outcomes into organizational artifacts in Assembly:

  - outcome=informational → creates a forum post (awareness signal)
  - outcome=needs_deliberation → (reserved for Slice 2 — creates an agenda)

This is where the Assessment/Assembly boundary is enforced:

  Assessment Runner (assessment_subscriber.py):
    "I concluded something."

  Assembly Subscriber (this file):
    "I decided how the organization should experience that conclusion."

The assessment runner never touches Assembly. It doesn't know about forums,
posts, or agendas. It only knows what it analyzed and what it concluded.

Key design: queries the DB for assessment data rather than parsing the
event envelope. The event envelope only contains metadata; the assessment
row is projected by the kernel trigger and guaranteed to exist before
the NATS notification is delivered (pg_notify is transaction-aware).

Design:
  - Writes forum posts directly to assembly.posts (cleaner than coupling
    to the harvest-specific assembly_publish_harvest MCP tool)
  - Looks up forum by slug (no hard-coded UUIDs)
  - Posts as "Rover" — the system's communication identity
  - Links back to the observation detail page in the UI

Architecture::

    kernel.sys_transition('assessment.completed', ...)
        │
        ├──→ kernel.transition_event → trigger → nebula.assessments
        │                               + mark observation assessed
        │
        └──→ pg_notify → kernel_subscriber → NATS

    assembly_subscriber.py  (queries assessment from DB)
        │
        ├──→ INSERT into assembly.posts  (forum post)
        └──→ UPDATE nebula.assessments.forum_post_id  (link back)

Usage::

    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \\
        NATS_URL=nats://localhost:4222 \\
        OBSERVATIONS_FORUM_SLUG=harvest-candidates \\
        python3 assembly_subscriber.py
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
import uuid
from typing import Any

# ── Path setup ──────────────────────────────────────────────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from rover.agenda_matcher import match_text_to_agenda


# ── Configuration ───────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://pguser:pgpass@localhost:5432/nexus",
)
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
NATS_SUBJECT = "nexus.kernel.v1.transition.assessment.completed"
FORUM_SLUG = os.getenv("OBSERVATIONS_FORUM_SLUG", "harvest-candidates")
ROVER_ALIAS = "Rover"
UI_BASE_URL = os.getenv("UI_BASE_URL", "http://localhost:9003")

# ── Logging ─────────────────────────────────────────────────────────

def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [assembly-sub] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()

def _signal_handler() -> None:
    _log("Shutdown signal received — draining...")
    _shutdown.set()


# ═══════════════════════════════════════════════════════════════════════
#  Forum post creation
# ═══════════════════════════════════════════════════════════════════════

def _build_forum_post(
    assessment: dict[str, Any],
    observation_id: str,
    rover_id: str,
    forum_id: str,
) -> dict[str, Any]:
    """Build a forum post dict from an assessment result.

    Returns a dict ready for INSERT into assembly.posts.
    """
    outcome = assessment.get("outcome", "unknown")
    confidence = assessment.get("confidence", 0.0)
    confidence_pct = f"{confidence * 100:.0f}%"
    analysis = assessment.get("analysis_detail", "")
    impact = assessment.get("impact_scope", {})

    trigger_type = impact.get("trigger_type", "unknown") if isinstance(impact, dict) else "unknown"
    candidate_count = impact.get("candidate_count", 0) if isinstance(impact, dict) else 0

    # Build post title
    outcome_label = outcome.replace("_", " ").title()
    title = f"Assessment: {trigger_type} — {outcome_label} ({confidence_pct} confidence)"

    # Build post body (markdown)
    body_parts = [
        "## System Observation",
        "",
        f"**Trigger**: {trigger_type}",
        f"**Outcome**: {outcome_label}",
        f"**Confidence**: {confidence_pct}",
        "",
        "---",
        "",
    ]

    if candidate_count > 0:
        body_parts.append(f"**Candidates extracted**: {candidate_count}")
        body_parts.append("")

    body_parts.append(analysis)
    body_parts.append("")
    body_parts.append("---")
    body_parts.append("")

    # Links
    obs_link = f"{UI_BASE_URL}/observations/{observation_id}"
    body_parts.append(f"- [View Observation]({obs_link})")
    body_parts.append("")

    body = "\n".join(body_parts)

    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "text": body,
        "posted_by_id": rover_id,
        "forum_uuid": forum_id,
    }


def _link_assessment_to_post(
    pg_conn: Any,
    assessment_id: str,
    post_id: str,
) -> bool:
    """Update nebula.assessments.forum_post_id after creating the post."""
    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                "UPDATE nebula.assessments SET forum_post_id = %s WHERE id = %s",
                (post_id, assessment_id),
            )
        _log("Linked assessment %s → forum post %s", assessment_id[:8], post_id[:8])
        return True
    except Exception as e:
        _log("Failed to link assessment to forum post: %s", e)
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Agenda creation (Slice 2 — DELIBERATION_REQUIRED)
# ═══════════════════════════════════════════════════════════════════════

def _find_or_create_agenda(
    pg_conn: Any,
    assessment_id: str,
    assessment_data: dict[str, Any],
    observation_id: str,
    rover_id: str,
    forum_id: str,
) -> None:
    """Try to match the assessment to an existing agenda using embeddings.

    If a match is found (cosine similarity >= 0.60), the assessment is
    added as an agenda_item to the existing agenda with included=NULL
    (pending human review). Otherwise, a new agenda is created with the
    assessment as its first item (included=true, since the first item
    defines the agenda).
    """
    import uuid as _uuid

    trigger_type = assessment_data.get("impact_scope", {}).get("trigger_type", "unknown")
    candidate_count = assessment_data.get("impact_scope", {}).get("candidate_count", 0)
    confidence_pct = f"{assessment_data.get('confidence', 0.0) * 100:.0f}%"

    # ── Build item text (shared with _create_agenda) ──
    title = f"Deliberation: {trigger_type} — {candidate_count} candidate(s) ({confidence_pct} confidence)"
    analysis = assessment_data.get("analysis_detail", "")
    item_body = (
        f"## {title}\n\n"
        f"{analysis}\n\n"
        "---\n\n"
        f"- [View Observation]({UI_BASE_URL}/observations/{observation_id})\n"
        f"- Assessment: `{assessment_id}`\n"
    )
    match_text = f"{title}\n{analysis}"

    # ── Try to match against existing agendas ──
    _log("Attempting to match assessment %s to existing agendas...", assessment_id[:8])
    match = match_text_to_agenda(match_text, threshold=0.60)

    if match.agenda_id and not match.is_new:
        # ✓ Matched — add to existing agenda
        agenda_id = match.agenda_id
        agenda_item_id = str(_uuid.uuid4())
        _log("Matched to agenda %s (score=%.3f) — adding item",
             agenda_id[:8], match.score)

        try:
            with pg_conn.cursor() as cur:
                # Add agenda item (included=NULL — pending human review,
                # unlike first-item auto-include in _create_agenda)
                cur.execute(
                    """INSERT INTO nebula.agenda_items
                       (id, agenda_id, source_type, source_id, title, body,
                        supporting_refs, open_questions, included)
                       VALUES (%s, %s, 'assessment', %s, %s, %s,
                               %s::jsonb, %s::jsonb, NULL)""",
                    (agenda_item_id, agenda_id, assessment_id, title, item_body,
                     json.dumps([{"observation_id": observation_id}]),
                     json.dumps(assessment_data.get("open_questions", []))),
                )
                _log("Added agenda item %s to existing agenda %s",
                     agenda_item_id[:8], agenda_id[:8])

                # Refresh source_count
                cur.execute(
                    """UPDATE nebula.agendas
                       SET source_count = (
                           SELECT COUNT(*) FROM nebula.agenda_items
                           WHERE agenda_id = %s
                       ),
                       updated_at = CURRENT_TIMESTAMP
                       WHERE id = %s""",
                    (agenda_id, agenda_id),
                )

                # Link agenda to forum (if not already)
                cur.execute(
                    """INSERT INTO assembly.forum_agendas
                       (forum_id, agenda_id, label)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (forum_id, agenda_id) DO NOTHING""",
                    (forum_id, agenda_id, trigger_type),
                )

                # Link assessment back to agenda
                # NOTE: with autocommit, each statement is its own txn.
                # If this UPDATE fails after the INSERT above succeeded,
                # the fallback _create_agenda path runs — but the orphan
                # item in the matched agenda is harmless (idempotency
                # check will skip re-processing since agenda_id is unset).
                cur.execute(
                    "UPDATE nebula.assessments SET agenda_id = %s WHERE id = %s",
                    (agenda_id, assessment_id),
                )
                _log("Linked assessment %s → agenda %s", assessment_id[:8], agenda_id[:8])

        except Exception as e:
            _log("Failed to add item to existing agenda: %s", e)
            # Fall back to creating a new agenda
            _log("Falling back to new agenda creation...")
            _create_agenda(
                pg_conn, assessment_id, assessment_data,
                observation_id, rover_id, forum_id,
            )
    else:
        # No match — create new agenda (original behavior)
        _log("No matching agenda found (best=%.3f) — creating new agenda",
             match.score)
        _create_agenda(
            pg_conn, assessment_id, assessment_data,
            observation_id, rover_id, forum_id,
        )


def _create_agenda(
    pg_conn: Any,
    assessment_id: str,
    assessment_data: dict[str, Any],
    observation_id: str,
    rover_id: str,
    forum_id: str,
) -> None:
    """Create a new agenda + agenda_item + forum link from a deliberation assessment.

    This is the fallback path when no matching agenda exists. The assessment
    becomes the agenda's first item.
    """
    import uuid as _uuid

    agenda_id = str(_uuid.uuid4())
    agenda_item_id = str(_uuid.uuid4())

    trigger_type = assessment_data.get("impact_scope", {}).get("trigger_type", "unknown")
    candidate_count = assessment_data.get("impact_scope", {}).get("candidate_count", 0)
    confidence_pct = f"{assessment_data.get('confidence', 0.0) * 100:.0f}%"

    # ── Agenda title ──
    title = f"Deliberation: {trigger_type} — {candidate_count} candidate(s) ({confidence_pct} confidence)"

    # ── Item body ──
    analysis = assessment_data.get("analysis_detail", "")
    item_body = (
        f"## {title}\n\n"
        f"{analysis}\n\n"
        "---\n\n"
        f"- [View Observation]({UI_BASE_URL}/observations/{observation_id})\n"
        f"- Assessment: `{assessment_id}`\n"
    )

    try:
        with pg_conn.cursor() as cur:
            # 1. Create agenda
            cur.execute(
                """INSERT INTO nebula.agendas
                   (id, title, scope, status, source_count, metadata)
                   VALUES (%s, %s, %s, 'draft', %s,
                           %s::jsonb)""",
                (agenda_id, title, trigger_type, candidate_count,
                 json.dumps({"assessment_id": assessment_id, "observation_id": observation_id})),
            )
            _log("Created agenda %s: %s", agenda_id[:8], title[:80])

            # 2. Create agenda item (the assessment becomes the first item)
            cur.execute(
                """INSERT INTO nebula.agenda_items
                   (id, agenda_id, source_type, source_id, title, body,
                    supporting_refs, open_questions, included)
                   VALUES (%s, %s, 'assessment', %s, %s, %s,
                           %s::jsonb, %s::jsonb, true)""",
                (agenda_item_id, agenda_id, assessment_id, title, item_body,
                 json.dumps([{"observation_id": observation_id}]),
                 json.dumps(assessment_data.get("open_questions", []))),
            )
            _log("Created agenda item %s for agenda %s", agenda_item_id[:8], agenda_id[:8])

            # 3. Link agenda to Assembly forum
            cur.execute(
                """INSERT INTO assembly.forum_agendas
                   (forum_id, agenda_id, label)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (forum_id, agenda_id) DO NOTHING""",
                (forum_id, agenda_id, trigger_type),
            )
            _log("Linked agenda %s to forum %s", agenda_id[:8], forum_id[:8])

            # 4. Link assessment back to agenda
            cur.execute(
                "UPDATE nebula.assessments SET agenda_id = %s WHERE id = %s",
                (agenda_id, assessment_id),
            )
            _log("Linked assessment %s → agenda %s", assessment_id[:8], agenda_id[:8])

    except Exception as e:
        _log("Failed to create agenda: %s", e)


# ═══════════════════════════════════════════════════════════════════════
#  Event handling
# ═══════════════════════════════════════════════════════════════════════

async def handle_assessment_completed(
    pg_conn: Any,
    event_envelope: dict[str, Any],
) -> None:
    """Process a single assessment.completed event.

    Extracts the assessment_id from the event envelope, queries the
    projected assessment row from nebula.assessments, and creates
    organizational artifacts based on outcome.
    """
    # Extract aggregate_id (which IS the assessment UUID) from the envelope
    envelope_payload = event_envelope.get("payload", {}) or {}
    inner = envelope_payload.get("payload", envelope_payload) if isinstance(envelope_payload, dict) else envelope_payload

    if isinstance(inner, dict):
        assessment_id = inner.get("aggregate_id", "")
        actor = inner.get("actor", "")
    else:
        assessment_id = ""
        actor = ""

    if not assessment_id:
        _log("Missing assessment_id in event — skipping")
        return

    _log("Processing assessment.completed for assessment %s (actor=%s)",
         assessment_id[:8], actor)

    # ── Query the assessment from the projected table ──
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT outcome, confidence, observation_id, analysis_detail,
                   impact_scope, open_questions
            FROM nebula.assessments
            WHERE id = %s
            """,
            (assessment_id,),
        )
        row = cur.fetchone()
        if not row:
            _log("Assessment %s not found in nebula.assessments — skipping",
                 assessment_id[:8])
            return

        outcome = row[0]
        confidence = float(row[1]) if row[1] is not None else 0.0
        observation_id = str(row[2]) if row[2] else ""
        analysis_detail = row[3] or ""
        impact_scope = row[4] if row[4] else {}
        open_questions = row[5] if row[5] else []

    # ══ Idempotency check: skip if forum_post OR agenda already created ══
    with pg_conn.cursor() as cur:
        cur.execute(
            "SELECT forum_post_id, agenda_id FROM nebula.assessments WHERE id = %s",
            (assessment_id,),
        )
        existing = cur.fetchone()
        if existing:
            has_forum_post = existing[0] is not None
            has_agenda = existing[1] is not None
            if has_forum_post or has_agenda:
                artifact = "forum post" if has_forum_post else "agenda"
                ref = existing[0] if has_forum_post else existing[1]
                _log("%s %s already exists for assessment %s — skipping (dedup)",
                     artifact.capitalize(), ref[:8], assessment_id[:8])
                return

        assessment_data = {
            "outcome": outcome,
            "confidence": confidence,
            "observation_id": observation_id,
            "analysis_detail": analysis_detail,
            "impact_scope": impact_scope,
            "open_questions": open_questions,
        }

    if not observation_id:
        _log("Assessment %s has no observation_id — skipping", assessment_id[:8])
        return

    # ── Route by outcome ──
    if outcome in ("INFORMATIONAL", "informational", "RECOMMENDATION", "recommendation"):
        # Resolve Assembly identities
        cur = pg_conn.cursor()
        try:
            cur.execute(
                "SELECT id FROM assembly.users WHERE alias = %s LIMIT 1",
                (ROVER_ALIAS,),
            )
            rover_row = cur.fetchone()
            if not rover_row:
                _log("ERROR: Rover user not found — skipping")
                return
            rover_id = rover_row[0]

            cur.execute(
                "SELECT id FROM assembly.forums WHERE slug = %s LIMIT 1",
                (FORUM_SLUG,),
            )
            forum_row = cur.fetchone()
            if not forum_row:
                _log("ERROR: Forum '%s' not found — skipping", FORUM_SLUG)
                return
            forum_id = forum_row[0]
        finally:
            cur.close()

        # Build and insert the forum post
        post = _build_forum_post(
            assessment_data, observation_id,
            str(rover_id), str(forum_id),
        )

        try:
            with pg_conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO assembly.posts
                       (id, title, text, posted_by_id, forum_uuid, created)
                       VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP)""",
                    (post["id"], post["title"], post["text"],
                     post["posted_by_id"], post["forum_uuid"]),
                )
            _log("Created forum post %s: %s", post["id"][:8], post["title"][:80])

            # Link back to assessment
            _link_assessment_to_post(pg_conn, assessment_id, post["id"])
        except Exception as e:
            _log("Failed to create forum post: %s", e)

    elif outcome == "DELIBERATION_REQUIRED" or outcome == "needs_deliberation":
        # Create an agenda (Slice 2)
        _log("DELIBERATION_REQUIRED — creating agenda for assessment %s",
             assessment_id[:8])

        # Resolve Assembly user/forum identities
        cur = pg_conn.cursor()
        try:
            cur.execute(
                "SELECT id FROM assembly.users WHERE alias = %s LIMIT 1",
                (ROVER_ALIAS,),
            )
            rover_row = cur.fetchone()
            if not rover_row:
                _log("ERROR: Rover user not found — skipping")
                return
            rover_id = str(rover_row[0])

            cur.execute(
                "SELECT id FROM assembly.forums WHERE slug = %s LIMIT 1",
                (FORUM_SLUG,),
            )
            forum_row = cur.fetchone()
            if not forum_row:
                _log("ERROR: Forum '%s' not found — skipping", FORUM_SLUG)
                return
            forum_id = str(forum_row[0])
        finally:
            cur.close()

        _find_or_create_agenda(
            pg_conn=pg_conn,
            assessment_id=assessment_id,
            assessment_data=assessment_data,
            observation_id=observation_id,
            rover_id=rover_id,
            forum_id=forum_id,
        )

    else:
        _log("Outcome '%s' — no Assembly action required", outcome)


# ═══════════════════════════════════════════════════════════════════════
#  NATS subscriber
# ═══════════════════════════════════════════════════════════════════════

async def run_assembly_subscriber() -> None:
    """Main loop: connect NATS + DB, subscribe, process assessments."""
    # ── Imports (with helpful error messages) ──
    try:
        import psycopg2
    except ImportError as e:
        _log("FATAL: %s — install with: pip install psycopg2-binary", e)
        sys.exit(1)

    try:
        import nats
    except ImportError as e:
        _log("FATAL: %s — install with: pip install nats-py", e)
        sys.exit(1)

    # ── Connect to PostgreSQL ──
    _log("Connecting to PostgreSQL...")
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_conn.autocommit = True
    _log("PostgreSQL connected")

    # ── Connect to NATS ──
    _log("Connecting to NATS at %s...", NATS_URL)
    nc = await nats.connect(NATS_URL, name="assembly_subscriber")
    _log("NATS connected")

    processed_count = 0

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        nonlocal processed_count

        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
            _log("Received event on %s", msg.subject)

            await handle_assessment_completed(pg_conn, data)
            processed_count += 1

        except json.JSONDecodeError as e:
            _log("Invalid JSON: %s", e)
        except Exception as e:
            _log("Error processing message: %s", e)
            import traceback
            _log(traceback.format_exc())

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for assessment.completed events...", NATS_SUBJECT)
    _log("Forum: %s | Poster: %s", FORUM_SLUG, ROVER_ALIAS)

    # ── Wait for shutdown signal ──
    try:
        await _shutdown.wait()
    except asyncio.CancelledError:
        pass
    finally:
        _log("Shutting down — %d events processed", processed_count)
        await sub.unsubscribe()
        await nc.drain()
        pg_conn.close()
        _log("Connections closed")


# ── Entry point ─────────────────────────────────────────────────────

def main() -> None:
    """Entry point — installs signal handlers and runs the async loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            pass

    _log("Starting Assembly Subscriber (Slice 1)...")
    _log("NATS: %s | Subject: %s", NATS_URL, NATS_SUBJECT)
    _log("Forum: %s | UI: %s", FORUM_SLUG, UI_BASE_URL)
    try:
        loop.run_until_complete(run_assembly_subscriber())
    except KeyboardInterrupt:
        _log("Interrupted")
    finally:
        loop.close()
        _log("Assembly Subscriber stopped")


if __name__ == "__main__":
    main()
