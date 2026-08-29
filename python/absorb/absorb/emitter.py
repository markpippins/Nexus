"""NATS cascade-bus emitter for absorb (plan 0003).

Publishes absorb lifecycle events onto the cascade NATS bus under
``nexus.absorb.v1.<event_type>`` subjects using the shared
``CanonicalEnvelope`` (python/nats_envelope), per the stage-3 event catalog
(``docs/events/stage3-canonical-event-types.md``).

Emission is best-effort and failure-isolated (AC4):

- NATS unavailability or a publish error never fails an ingest run.
- ``emit_*`` returns the new ``event_id`` on success, else ``None``.
- Module-level counters (``COUNTERS.sent`` / ``COUNTERS.dropped``) let the
  caller surface both totals in the run-summary warnings (AC4).

This replaces the earlier events.py which inserted directly into
``cascade.events`` (DB). Events now go to NATS (single-writer); a mirror
subscriber (``bus_mirror.py``) projects them into ``cascade.events`` so the
existing ``cascade.events -> cascade-pg-bridge -> Redis -> SSE`` path keeps
working (user decision 2026-08-29: "NATS-only + mirror bridge").

The four canonical event types (AC1):

    nexus.absorb.v1.run.started        {profile_id, version, planned_count}
    nexus.absorb.v1.source.completed   {run_id, source_hash, watermark}
    nexus.absorb.v1.step.failed        {run_id, step, error_code, retryable}
    nexus.absorb.v1.run.completed      {counts, warnings, policy_skips}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import threading

log = logging.getLogger("absorb.emitter")

# ── Path setup so the shared nats_envelope package resolves when this module
#    is imported from a process whose cwd/sys.path is python/absorb only
#    (e.g. `python3 -u -m absorb run ...` from python/absorb). The shave
#    package lives at python/nats_envelope. ────────────────────────────────
_ABSORB_PKG = os.path.dirname(os.path.abspath(__file__))          # .../absorb/absorb
_PYTHON_ROOT = os.path.dirname(_ABSORB_PKG)                        # .../absorb
_PYTHON_DIR = os.path.dirname(_PYTHON_ROOT)                        # .../python
for _p in (_PYTHON_DIR, _PYTHON_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from nats_envelope import CanonicalEnvelope, Classification  # noqa: E402

NATS_URL = os.environ.get("ABSORB_NATS_URL", "nats://localhost:4222")
DOMAIN = "nexus.absorb.v1"                       # subject prefix
ORIGIN_COMPONENT = "absorb"
_SUBJECT_TIMEOUT_SECONDS = 10                    # publish/future wait bound


class EmitCounters:
    """Sent/dropped counters for AC4 (surfaced in the run-summary warnings)."""

    def __init__(self) -> None:
        self.sent: int = 0
        self.dropped: int = 0

    def snapshot(self) -> dict:
        return {"sent": self.sent, "dropped": self.dropped}

    def total(self) -> int:
        return self.sent + self.dropped


# Note: absorb commands are short-lived processes (hourly oneshot), so a
# module-level singleton is the right scope — resetting per-process.
COUNTERS = EmitCounters()

# ── Background asyncio loop + persistent NATS connection ──────────────
# emit_* is synchronous (the ingest runner is synchronous); we service the
# async NATS client on a daemon thread that owns an asyncio loop for the
# process lifetime, reusing one connection across all events in the run.
_loop: asyncio.AbstractEventLoop | None = None
_conn: "object | None" = None                   # the NATS client (lazy)
_lock = threading.Lock()


def _event_loop() -> asyncio.AbstractEventLoop:
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
        threading.Thread(target=_loop.run_forever,
                         name="absorb-nats-emitter", daemon=True).start()
    return _loop


async def _connect() -> "object":
    import nats
    return await nats.connect(NATS_URL)


def _connection() -> "object | None":
    """Return a live NATS connection, establishing it lazily. Resilient:
    a failed connect returns None (caller must count the drop)."""
    global _conn
    if _conn is not None:
        try:
            if getattr(_conn, "is_closed", False):
                _conn = None
            else:
                return _conn
        except Exception:                                   # noqa: BLE001
            _conn = None
    with _lock:
        if _conn is not None:
            return _conn
        try:
            fut = asyncio.run_coroutine_threadsafe(_connect(), _event_loop())
            _conn = fut.result(timeout=_SUBJECT_TIMEOUT_SECONDS)
        except Exception as err:                            # noqa: BLE001
            log.warning("NATS unavailable (%s) — emission counts as dropped", err)
            _conn = None
    return _conn


async def _publish(conn: "object", subject: str, data: bytes) -> None:
    await conn.publish(subject, data)
    await conn.flush()


def _emit(subject: str, envelope: CanonicalEnvelope) -> str | None:
    """Publish one envelope onto the NATS cascade bus (best-effort).

    Returns the new event_id on success, else None. Counters are updated so
    AC4 totals reflect exactly what went onto the bus.
    """
    conn = _connection()
    if conn is None:
        COUNTERS.dropped += 1
        return None
    try:
        fut = asyncio.run_coroutine_threadsafe(
            _publish(conn, subject, json.dumps(envelope.to_dict()).encode()),
            _event_loop(),
        )
        fut.result(timeout=_SUBJECT_TIMEOUT_SECONDS)
        COUNTERS.sent += 1
        return envelope.event_id
    except Exception as err:                                # noqa: BLE001
        log.warning("absorb publish %s → %s failed: %s", subject, envelope.event_id, err)
        global _conn
        _conn = None                                        # force reconnect
        COUNTERS.dropped += 1
        return None


# ── The four canonical lifecycle events (AC1) ─────────────────────────

def _base_event(event: str, *, aggregate_type: str, aggregate_id: str,
                correlation_id: str | None, payload: dict,
                causation_id: str | None = None,
                caused_by_event_type: str | None = None) -> CanonicalEnvelope:
    subject = f"{DOMAIN}.{event}"
    body = dict(payload)
    # Envelope carries the cascade.events envelope projection fields so the
    # bus_mirror can reproduce cascade.events exactly (AC1 aggregate/causation).
    body["aggregate_type"] = aggregate_type
    body["aggregate_id"] = aggregate_id
    if caused_by_event_type:
        body["caused_by_event_type"] = caused_by_event_type
    return CanonicalEnvelope(
        event_type=event,
        origin_component=ORIGIN_COMPONENT,
        correlation_id=correlation_id or "",
        subject=subject,
        payload=body,
        causation_id=causation_id,
        classification=Classification.INTERNAL,
        domain="absorb",
    )


def emit_run_started(batch_id: str, profile_id: str, version: int,
                     planned_count: int) -> str | None:
    return _emit(f"{DOMAIN}.run.started", _base_event(
        "run.started", aggregate_type="profile", aggregate_id=profile_id,
        correlation_id=batch_id,
        payload={"profile_id": profile_id, "version": version,
                 "planned_count": planned_count}))


def emit_source_completed(batch_id: str, run_id: str, content_hash: str,
                          watermark: str,
                          causation_id: str | None = None) -> str | None:
    return _emit(f"{DOMAIN}.source.completed", _base_event(
        "source.completed", aggregate_type="source", aggregate_id=content_hash,
        correlation_id=batch_id, causation_id=causation_id,
        caused_by_event_type=f"{DOMAIN}.run.started" if causation_id else None,
        payload={"run_id": run_id, "source_hash": content_hash,
                 "watermark": watermark}))


def emit_step_failed(batch_id: str, run_id: str, step: str, error_code: str,
                     retryable: bool) -> str | None:
    return _emit(f"{DOMAIN}.step.failed", _base_event(
        "step.failed", aggregate_type="source", aggregate_id=run_id,
        correlation_id=batch_id,
        payload={"run_id": run_id, "step": step,
                 "error_code": error_code, "retryable": bool(retryable)}))


def emit_run_completed(batch_id: str, counts: dict, warnings: list,
                       policy_skips: list,
                       causation_id: str | None = None) -> str | None:
    return _emit(f"{DOMAIN}.run.completed", _base_event(
        "run.completed", aggregate_type="profile", aggregate_id="batch",
        correlation_id=batch_id, causation_id=causation_id,
        payload={"counts": counts, "warnings": warnings,
                 "policy_skips": policy_skips}))


# Backward-compatible alias for the generic single-publish entrypoint that the
# old events.py exposed.
def emit_event(event_type: str, *, aggregate_type: str, aggregate_id: str,
               payload: dict, correlation_id: str | None = None,
               causation_id: str | None = None,
               caused_by_event_type: str | None = None,
               source: str = "absorb.runner") -> str | None:
    # `source` retained for signature parity; envelope origin_component is fixed.
    return _emit(f"{DOMAIN}.{event_type}", _base_event(
        event_type, aggregate_type=aggregate_type, aggregate_id=aggregate_id,
        correlation_id=correlation_id, causation_id=causation_id,
        caused_by_event_type=caused_by_event_type, payload=payload))