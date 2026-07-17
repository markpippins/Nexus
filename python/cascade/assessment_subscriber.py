"""assessment_subscriber.py — Listens for observation.captured, runs assessment.

Subscribes to ``nexus.kernel.v1.transition.observation.captured`` via NATS,
queries the observation from ``nebula.observations`` (projected by trigger),
runs assessment via composable evaluators + coordinator, and emits
``assessment.completed`` via kernel.sys_transition().

Architecture::

    kernel.sys_transition('observation.captured', ...)
        │
        ├──→ kernel.transition_event
        │       └──→ trigger → nebula.observations  (projection)
        │       └──→ pg_notify → kernel_subscriber → NATS
        │
    assessment_subscriber.py
        │
        ├──→ TrivialEvaluator          (candidate count heuristic)
        ├──→ KGArtifactImpactEvaluator (KG traversal — artifact counts)
        │
        └──→ AssessmentCoordinator     (merges dimensions, applies doctrine)
                │
                └──→ SELECT kernel.sys_transition('assessment.completed', ...)
                        │
                        ├──→ kernel.transition_event
                        └──→ trigger → nebula.assessments + mark obs assessed

Usage::

    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \\
        NATS_URL=nats://localhost:4222 \\
        python3 assessment_subscriber.py
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


# ── Configuration ───────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgres://pguser:pgpass@localhost:5432/nexus",
)
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
NATS_SUBJECT = "nexus.kernel.v1.transition.observation.captured"

# ── Logging ─────────────────────────────────────────────────────────

def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [assessment-sub] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()

def _signal_handler() -> None:
    _log("Shutdown signal received — draining...")
    _shutdown.set()


# ═══════════════════════════════════════════════════════════════════════
#  Assessment logic — coordinator-based evaluator architecture
# ═══════════════════════════════════════════════════════════════════════

def _get_assessment_text(
    outcome: str,
    trigger_type: str,
    candidate_count: int,
    total_artifacts: int,
    rationale: list[str],
) -> str:
    """Build analysis_detail text from outcome and dimensions."""
    lines = ["## Assessment (Coordinator)", "", f"**Trigger**: {trigger_type}"]
    lines.append(f"**Outcome**: {outcome}")
    lines.append(f"**Candidates**: {candidate_count}")
    lines.append(f"**Connected KG artifacts**: {total_artifacts}")
    lines.append("")
    lines.append("### Rationale")
    for r in rationale:
        lines.append(f"- {r}")
    lines.append("")
    if outcome == "INFORMATIONAL":
        lines.append(
            "No downstream impact detected. This observation is filed "
            "for awareness only."
        )
    elif outcome == "RECOMMENDATION":
        lines.append(
            "No direct candidates, but connected KG artifacts exist. "
            "This warrants a recommendation for human or automated review."
        )
    elif outcome in ("DELIBERATION_REQUIRED",):
        lines.append(
            "Downstream artifacts detected. Routing to agenda for "
            "group deliberation."
        )
    return "\n".join(lines)


def run_coordinated_assessment(
    cur: Any,
    observation_id: str,
) -> dict[str, Any] | None:
    """Run assessment via evaluators + coordinator (doctrine-based).

    Queries the observation from ``nebula.observations``, runs all
    registered evaluators, and applies the coordinator to resolve
    the outcome from merged dimensions.

    Args:
        cur: psycopg2 cursor for DB queries.
        observation_id: UUID of the observation to assess.

    Returns:
        Assessment result dict matching the assessment.completed payload schema,
        or None if the observation was not found.
    """
    # Query the observation from the projected table
    cur.execute(
        "SELECT trigger_type, payload FROM nebula.observations WHERE id = %s",
        (observation_id,),
    )
    row = cur.fetchone()
    if not row:
        _log("Observation %s not found in nebula.observations — skipping", observation_id[:8])
        return None

    trigger_type = row[0]
    payload = row[1] if row[1] else {}

    # ── Build evaluators ──
    from cascade.evaluators import TrivialEvaluator, KGArtifactImpactEvaluator
    from cascade.coordinator import resolve_outcome

    evaluators = [
        TrivialEvaluator(),
        KGArtifactImpactEvaluator(),
    ]

    # ── Collect dimensions ──
    dimensions = []
    for evaluator in evaluators:
        _log("Running evaluator '%s' for observation %s", evaluator.name, observation_id[:8])
        dim = evaluator.evaluate(cur, observation_id, payload)
        dimensions.append(dim)
        _log(
            "Evaluator '%s' → confidence=%.2f findings=%s",
            evaluator.name, dim.confidence, dim.findings,
        )

    # ── Resolve outcome via coordinator ──
    result = resolve_outcome(dimensions)

    candidate_count: int = 0
    total_artifacts: int = 0
    for dim in dimensions:
        if "candidate_count" in dim.findings:
            candidate_count = dim.findings["candidate_count"]
        if "artifact_counts" in dim.findings:
            total_artifacts = dim.findings["artifact_counts"].get("total", 0)

    analysis_detail = _get_assessment_text(
        outcome=result.outcome,
        trigger_type=trigger_type,
        candidate_count=candidate_count,
        total_artifacts=total_artifacts,
        rationale=result.rationale,
    )

    return {
        "observation_id": observation_id,
        "outcome": result.outcome,
        "confidence": result.confidence,
        "impact_scope": {
            "trigger_type": trigger_type,
            "candidate_count": candidate_count,
            "affected_systems": [],
            "affected_specs": [],
            "affected_policies": [],
            "kg_artifacts": total_artifacts,
        },
        "open_questions": [],
        "analysis_detail": analysis_detail,
    }


# ═══════════════════════════════════════════════════════════════════════
#  Event emission
# ═══════════════════════════════════════════════════════════════════════

def emit_assessment(
    pg_conn: Any,
    assessment_result: dict[str, Any],
    causation_id: str,
) -> bool:
    """Emit an assessment.completed event via kernel.sys_transition().

    The projection trigger on kernel.transition_event handles writing
    the row to nebula.assessments and marking the observation as assessed.

    Returns True on success, False on failure.
    """
    assessment_id = str(uuid.uuid4())

    payload = {
        "observation_id": assessment_result["observation_id"],
        "outcome": assessment_result["outcome"],
        "confidence": assessment_result["confidence"],
        "impact_scope": assessment_result["impact_scope"],
        "open_questions": assessment_result["open_questions"],
        "analysis_detail": assessment_result["analysis_detail"],
    }

    # psycopg2 can't auto-adapt dicts to jsonb — serialize explicitly
    payload_json = json.dumps(payload)

    try:
        with pg_conn.cursor() as cur:
            cur.execute(
                """
                SELECT kernel.sys_transition(
                    'assessment.completed'::kernel.event_type,
                    'assessment',
                    %s,
                    'cascade',
                    %s::jsonb,
                    p_authority := 'cascade',
                    p_causation_id := %s::uuid
                )
                """,
                (assessment_id, payload_json, causation_id),
            )
        _log("Emitted assessment.completed (%s) outcome=%s conf=%.2f",
             assessment_id[:8], assessment_result["outcome"],
             assessment_result["confidence"])
        return True
    except Exception as e:
        _log("Failed to emit assessment.completed: %s", e)
        return False


# ═══════════════════════════════════════════════════════════════════════
#  Event handling
# ═══════════════════════════════════════════════════════════════════════

async def handle_observation_captured(
    pg_conn: Any,
    event_envelope: dict[str, Any],
    causation_id: str,
) -> None:
    """Process a single observation.captured event.

    The event envelope contains metadata (aggregate_type, aggregate_id).
    The observation_id is the aggregate_id. We query the projected
    nebula.observations row for the full observation data.
    """
    # The kernel_subscriber publishes CanonicalEnvelopes. The aggregate_id
    # (which IS the observation UUID) is inside the inner payload.
    envelope_payload = event_envelope.get("payload", {}) or {}
    inner = envelope_payload.get("payload", envelope_payload) if isinstance(envelope_payload, dict) else envelope_payload
    raw = inner.get("raw", inner) if isinstance(inner, dict) else inner

    # Fallback chain to locate the aggregate_id (= observation UUID)
    if isinstance(raw, dict):
        observation_id = raw.get("aggregate_id", "")
    elif isinstance(inner, dict):
        observation_id = inner.get("aggregate_id", "")
    else:
        observation_id = ""

    if not observation_id:
        _log("Missing observation_id in event — skipping")
        return

    _log("Processing observation.captured for observation %s", observation_id[:8])

    # ══ Idempotency check: skip if assessment already exists ══
    with pg_conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM nebula.assessments WHERE observation_id = %s LIMIT 1",
            (observation_id,),
        )
        if cur.fetchone():
            _log("Assessment already exists for observation %s — skipping (dedup)", observation_id[:8])
            return

    # Run assessment via coordinator (evaluators + doctrine)
    with pg_conn.cursor() as cur:
        assessment_result = run_coordinated_assessment(cur, observation_id)

    if assessment_result is None:
        return

    # Emit assessment.completed
    emit_assessment(pg_conn, assessment_result, causation_id)


# ═══════════════════════════════════════════════════════════════════════
#  NATS subscriber
# ═══════════════════════════════════════════════════════════════════════

async def run_assessment_subscriber() -> None:
    """Main loop: connect NATS + DB, subscribe, process observations."""
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
    nc = await nats.connect(NATS_URL, name="assessment_subscriber")
    _log("NATS connected")

    processed_count = 0

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        nonlocal processed_count

        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
            # causation_id from the kernel event's event_id
            # CanonicalEnvelope: event_id is at the top level
            causation_id = data.get("event_id", "")

            _log("Received event on %s (causation=%s)", msg.subject, causation_id[:8])

            await handle_observation_captured(pg_conn, data, causation_id)
            processed_count += 1

        except json.JSONDecodeError as e:
            _log("Invalid JSON: %s", e)
        except Exception as e:
            _log("Error processing message: %s", e)
            import traceback
            _log(traceback.format_exc())

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for observation.captured events...", NATS_SUBJECT)

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

    _log("Starting Assessment Subscriber (Coordinator + Evaluators)...")
    _log("NATS: %s | Subject: %s", NATS_URL, NATS_SUBJECT)
    try:
        loop.run_until_complete(run_assessment_subscriber())
    except KeyboardInterrupt:
        _log("Interrupted")
    finally:
        loop.close()
        _log("Assessment Subscriber stopped")


if __name__ == "__main__":
    main()
