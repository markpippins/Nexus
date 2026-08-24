"""nats_publisher.py — Phase 1 NATS sidecar for cascade.

Thread-safe publish queue + background NATS connection.
Solves the sync-code → async-NATS impedance mismatch while
preserving the subprocess isolation model in main.py.

Pattern follows voyager's fs_crawler_v2/publisher.py: graceful
fallback to logging when NATS is unavailable.

Phase 1.5: Publishes ``CanonicalEnvelope`` objects via JetStream
for persistence and replay. Falls back to core NATS publish if
JetStream is unavailable.

Usage::

    from nats_publisher import start_nats_sidecar, stop_nats_sidecar, try_enqueue_event

    nats_url = os.getenv("NATS_URL")
    if nats_url:
        start_nats_sidecar(nats_url)
    try:
        # ... subprocess loop ...
        try_enqueue_event(event_dict)  # wraps + enqueues
    finally:
        if nats_url:
            stop_nats_sidecar()
"""

import datetime
import json
import os
import queue
import threading
from typing import Any

from nats_envelope.envelope import CanonicalEnvelope, Classification

# ── Shared state ────────────────────────────────────────────────────
_publish_queue: queue.Queue[tuple[str, CanonicalEnvelope]] = queue.Queue(maxsize=10_000)
_nats_thread: threading.Thread | None = None
_nc = None  # nats-py connection (set by worker thread)
_worker_stop = threading.Event()  # signal worker to drain/flush/close


# ── Logging (follows cascade's print/ts convention) ─────────────────

def _log(msg: str, *args) -> None:
    ts = datetime.datetime.now(datetime.UTC).isoformat()
    print(f"[{ts}] [cascade.nats] {msg % args}")


# ── Subject mapping ─────────────────────────────────────────────────
# Maps cascade event types (CamelCase) to NATS subjects (snake_case).

EVENT_TYPE_TO_SUBJECT: dict[str, str] = {
    "IdeaCaptured": "nexus.cascade.v1.workflow.idea_captured",
    "WorkflowPlanned": "nexus.cascade.v1.workflow.workflow_planned",
    "StepRequested": "nexus.cascade.v1.workflow.step_requested",
    "StepApproved": "nexus.cascade.v1.workflow.step_approved",
    "StepRejected": "nexus.cascade.v1.workflow.step_rejected",
    "KernelPanic": "nexus.cascade.v1.workflow.kernel_panic",
}

COMPLETION_STEP_MAP: dict[str, str] = {
    "VocabularyDrafted": "vocabulary",
    "RequirementsFormalized": "requirements",
    "TypeSpecDrafted": "typespec",
    "SpecCompiled": "compile",
    "RefactorDrafted": "refactor",
    "Integrated": "integrate",
}


def event_type_to_subject(event_type: str) -> str:
    """Map a cascade event type to its NATS subject.

    Completion events (VocabularyDrafted, etc.) route to:
        nexus.cascade.v1.workflow.step_completed.{step_name}

    Standard events route to known subjects in EVENT_TYPE_TO_SUBJECT.
    Unknown types fall back to a generic subject.
    """
    if event_type in COMPLETION_STEP_MAP:
        step_name = COMPLETION_STEP_MAP[event_type]
        return f"nexus.cascade.v1.workflow.step_completed.{step_name}"

    return EVENT_TYPE_TO_SUBJECT.get(
        event_type,
        f"nexus.cascade.v1.workflow.{event_type.lower()}",
    )


# ── Worker thread ───────────────────────────────────────────────────

def _nats_worker(nats_url: str) -> None:
    """Background thread: drains queue and publishes to NATS.

    Runs its own asyncio event loop for nats-py async I/O.
    Graceful fallback: logs events when NATS is unavailable.
    """
    import asyncio

    global _nc
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def drain() -> None:
        global _nc
        js = None  # JetStream context (Phase 1.5: persistent publish)
        try:
            import nats
            _nc = await nats.connect(nats_url)
            _log("NATS sidecar connected to %s", nats_url)
            # ── Phase 1.5: JetStream context for persistent events ──
            try:
                js = _nc.jetstream()
                _log("JetStream context acquired — events will be persisted")
            except Exception as e:
                _log("JetStream unavailable (%s) — falling back to core NATS", e)
        except ImportError:
            _log("nats-py not installed. Falling back to logger.")
        except Exception as e:
            _log("NATS unavailable: %s. Queue will buffer.", e)

        while not _worker_stop.is_set():
            try:
                subject, envelope = _publish_queue.get(timeout=0.5)
                payload = json.dumps(envelope.to_dict()).encode()
                if _nc:
                    try:
                        if js is not None:
                            try:
                                ack = await js.publish(subject, payload)
                                _log("JetStream ack: %s seq=%s", subject, ack.seq)
                            except Exception as js_err:
                                _log("JetStream publish failed (%s) — falling back to core NATS", js_err)
                                await _nc.publish(subject, payload)
                                await _nc.flush()
                        else:
                            await _nc.publish(subject, payload)
                            await _nc.flush()  # force buffer → network
                    except Exception as e:
                        _log("NATS publish error: %s", e)
                        _log("[STUB] %s: %s", subject, json.dumps(envelope.to_dict(), indent=2))
                        # D-T19 item 5: bridge-delivery failure is observable
                        # on the canonical channel, not just in logs.
                        publish_failure_event(
                            "bridge_delivery", str(e),
                            correlation_id=envelope.correlation_id,
                        )
                else:
                    _log("[LOGGER] %s: %s", subject, json.dumps(envelope.to_dict(), indent=2))
            except queue.Empty:
                continue
            except Exception:
                break

        # ── Graceful shutdown: drain remaining queue, flush, close ──
        _log("NATS sidecar received stop signal — draining queue...")
        drained = 0
        while True:
            try:
                subject, envelope = _publish_queue.get_nowait()
                payload = json.dumps(envelope.to_dict()).encode()
                if _nc:
                    try:
                        if js is not None:
                            try:
                                await js.publish(subject, payload)
                            except Exception as js_err:
                                _log("JetStream drain publish failed (%s) — falling back to core NATS", js_err)
                                await _nc.publish(subject, payload)
                                await _nc.flush()
                        else:
                            await _nc.publish(subject, payload)
                            await _nc.flush()
                    except Exception as e:
                        _log("NATS drain publish error: %s", e)
                        _log("[DRAIN-STUB] %s: %s", subject, json.dumps(envelope.to_dict()))
                else:
                    _log("[DRAIN] %s: %s", subject, json.dumps(envelope.to_dict()))
                drained += 1
            except queue.Empty:
                break
        if drained:
            _log("Drained %d remaining events", drained)
        if _nc:
            await _nc.close()
            _log("NATS connection closed")

    loop.run_until_complete(drain())


# ── Public API ──────────────────────────────────────────────────────

def start_nats_sidecar(nats_url: str) -> None:
    """Start the NATS sidecar thread.

    Must be called before enqueue_publish().  Safe to call even if
    NATS is unavailable — the sidecar will fall back to logging.
    """
    global _nats_thread
    if _nats_thread is not None:
        _log("NATS sidecar already running")
        return
    _worker_stop.clear()  # reset for potential stop/start cycles
    _nats_thread = threading.Thread(
        target=_nats_worker,
        args=(nats_url,),
        daemon=True,
        name="cascade-nats-sidecar",
    )
    _nats_thread.start()
    _log("NATS sidecar started (url=%s)", nats_url)


def stop_nats_sidecar() -> None:
    """Stop the NATS sidecar thread gracefully.

    Signals the worker to: drain remaining queue → flush → close NATS.
    Joins the thread so messages aren't lost on process exit.
    """
    global _nats_thread
    if _nats_thread is None:
        return
    _log("NATS sidecar stopping — %d events in queue", _publish_queue.qsize())
    _worker_stop.set()
    _nats_thread.join(timeout=10)
    _nats_thread = None
    _log("NATS sidecar stopped")


def try_enqueue_event(
    event_dict: dict[str, Any],
    *,
    causation_id: str | None = None,
    source_event_ids: list[str] | None = None,
    correlation_id: str | None = None,
    policy_version: str | None = None,
) -> None:
    """Wrap a cascade flat event dict into a CanonicalEnvelope and enqueue.

    Uses ``envelope_adapter.cascade_to_envelope`` to build the envelope,
    then enqueues it for NATS publish via the sidecar thread.

    Args:
        event_dict: Cascade's native event format (``id``, ``type``,
            ``timestamp``, ``source``, ``payload``).
        causation_id: The immediate parent event_id (if known).
        source_event_ids: All contributing upstream event_ids.
        correlation_id: Override for the workflow correlation id.
        policy_version: LOSM/PGE governance version (e.g. "v27").
    """
    from envelope_adapter import cascade_to_envelope

    envelope = cascade_to_envelope(
        event_dict,
        causation_id=causation_id,
        source_event_ids=source_event_ids,
        correlation_id=correlation_id,
        policy_version=policy_version,
    )
    enqueue_publish(envelope.subject, envelope)


def enqueue_publish(subject: str, envelope: CanonicalEnvelope) -> None:
    """Thread-safe: enqueue an envelope for NATS publish.

    Called from synchronous handlers via ``try_enqueue_event()``.
    The sidecar thread drains the queue and publishes asynchronously.

    If the queue is full (NATS down for an extended period), the event
    is logged and dropped rather than blocking the caller.

    Args:
        subject: Full NATS subject, e.g. ``nexus.cascade.v1.workflow.step_requested``
        envelope: The CanonicalEnvelope to publish.
    """
    try:
        _publish_queue.put_nowait((subject, envelope))
    except queue.Full:
        _log("[QUEUE_FULL] dropping event — %s: %s [DEAD_LETTER] nexus.kernel.v1.failure.dead_letter",
             subject, json.dumps(envelope.to_dict()))


# ── D-T19 item 5: canonical failure-visibility events ──────────────
# Each failure class emits a canonical-channel failure event
# (<class>.failed / dead-letter) so the spine's failure modes are
# observable on the same NATS namespace as the success path. These are
# published directly via CanonicalEnvelope — the kernel.transition_event
# event_type enum is closed, so failures use their own subject taxonomy.

FAILURE_EVENTS: dict[str, tuple[str, str]] = {
    "admission": ("nexus.kernel.v1.transition.admission.failed", "admission.failed"),
    "bridge_delivery": ("nexus.kernel.v1.transition.bridge_delivery.failed", "bridge_delivery.failed"),
    "receipt": ("nexus.kernel.v1.transition.receipt.failed", "receipt.failed"),
    "watchdog": ("nexus.kernel.v1.transition.watchdog.refused", "watchdog.refused"),
    "queue": ("nexus.kernel.v1.failure.dead_letter", "queue.dropped"),
}


def build_failure_envelope(
    failure_class: str,
    error: str,
    *,
    aggregate_id: str | None = None,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> tuple[str, "CanonicalEnvelope"]:
    """Build the (subject, CanonicalEnvelope) for a failure event. Pure.

    Used by both the sync sidecar path (publish_failure_event) and async
    subscribers that own their own NATS connection (admission_subscriber).
    """
    subject, event_type = FAILURE_EVENTS.get(
        failure_class,
        (f"nexus.kernel.v1.transition.{failure_class}.failed", f"{failure_class}.failed"),
    )
    # NOTE: correlation_id may legitimately be None for a failure event —
    # e.g. a bridge-delivery failure where the failing envelope's own
    # identity was lost. CanonicalEnvelope declares correlation_id required,
    # but for failures it is best-effort (carried when known).
    envelope = CanonicalEnvelope(
        event_type=event_type,
        origin_component="cascade",
        correlation_id=correlation_id,
        subject=subject,
        payload={
            "failure_class": failure_class,
            "error": str(error)[:2000],
            "aggregate_id": aggregate_id,
        },
        domain="kernel",
        causation_id=causation_id,
        classification=Classification.INTERNAL,
    )
    return subject, envelope


def publish_failure_event(
    failure_class: str,
    error: str,
    *,
    aggregate_id: str | None = None,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> None:
    """Enqueue a canonical failure event via the sidecar (sync callers).

    Best-effort: if NATS is unavailable the sidecar already logs the
    envelope, so the failure is never silently dropped.
    """
    try:
        subject, envelope = build_failure_envelope(
            failure_class, error,
            aggregate_id=aggregate_id,
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        enqueue_publish(subject, envelope)
    except Exception as e:
        _log("publish_failure_event(%s) failed: %s", failure_class, e)
