"""bus_mirror.py — absorb NATS → cascade.events mirror.

Subscribes to the absorb lifecycle subjects ``nexus.absorb.v1.>`` on the
cascade NATS bus and projects each ``CanonicalEnvelope`` into the
``cascade.events`` table (idempotently). This restores the DB projection that
pre-dated the NATS emitter (plan 0003) so the existing
``cascade.events -> cascade-pg-bridge -> Redis -> SSE`` display path keeps
working while absorb remains a single-writer to NATS.

Architecture::

    absorb.runner/cli ──(NATS)──> nexus.absorb.v1.<event>
                                      │
                                      └─► bus_mirror.py  (this daemon)
                                              └─► INSERT INTO cascade.events
                                                     ON CONFLICT (event_id) DO NOTHING

Idempotency: cascade.events has PRIMARY KEY (event_id); a replayed NATS
event cannot double-insert. nats-py auto-reconnects; the daemon is meant to
run under systemd with Restart=always (deploy/absorb-bus-mirror.service).

Usage (from python/absorb)::

    ABSORB_NATS_URL=nats://localhost:4222 \\
        ABSORB_PG_DSN='postgresql://pguser:pgpass@localhost:5432/nexus' \\
        python3 -u -m absorb.bus_mirror

Exit: 0 on clean shutdown, non-zero on fatal (unrecoverable) error.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import uuid

log = logging.getLogger("absorb.bus_mirror")

NATS_URL = os.environ.get("ABSORB_NATS_URL", "nats://localhost:4222")
SUBJECT = os.environ.get("ABSORB_MIRROR_SUBJECT", "nexus.absorb.v1.>")

# ── Path setup (same as emitter.py): resolve python/nats_envelope + core ──
_ABSORB_PKG = os.path.dirname(os.path.abspath(__file__))          # .../absorb/absorb
_PYTHON_ROOT = os.path.dirname(_ABSORB_PKG)                        # .../absorb
_PYTHON_DIR = os.path.dirname(_PYTHON_ROOT)                        # .../python
for _p in (_PYTHON_DIR, _PYTHON_ROOT):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from nats_envelope import CanonicalEnvelope  # noqa: E402
from absorb.core import pg                   # noqa: E402


def _uuid_or_none(value) -> str | None:
    """Envelope columns correlation_id/causation_id are UUID-typed. Non-UUID
    ids coerce to NULL rather than fail the insert — keeps mirroring robust
    under any batch id scheme while honoring the schema."""
    if value is None or str(value) == "":
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError):
        return None


def mirror_one(env: CanonicalEnvelope) -> bool:
    """Insert one event into cascade.events. Returns True if mirrored (or
    already present via ON CONFLICT), False on failure."""
    payload = dict(env.payload or {})
    try:
        with pg() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO cascade.events (
                           event_id, event_type, source, event_timestamp,
                           payload, aggregate_type, aggregate_id,
                           actor_type, actor_id,
                           correlation_id, causation_id, caused_by_event_type)
                       VALUES (%s::uuid,%s,%s,%s,%s::jsonb,%s,%s,
                               'system','absorb',
                               %s::uuid,%s::uuid,%s)
                       ON CONFLICT (event_id) DO NOTHING""",
                    (
                        env.event_id,
                        env.subject,
                        env.origin_component,
                        env.occurred_at,
                        json.dumps(payload),
                        payload.get("aggregate_type"),
                        payload.get("aggregate_id"),
                        _uuid_or_none(env.correlation_id),
                        _uuid_or_none(env.causation_id),
                        payload.get("caused_by_event_type"),
                    ),
                )
        return True
    except Exception as err:                        # noqa: BLE001
        log.warning("mirror insert failed for %s: %s", env.event_id, err)
        return False


async def _handle(msg) -> None:
    try:
        data = json.loads(msg.data.decode("utf-8"))
        env = CanonicalEnvelope.from_dict(data)
    except Exception as err:                        # noqa: BLE001
        log.warning("skipping unparseable message on %s: %s",
                    msg.subject, err)
        return
    ok = mirror_one(env)
    log.info("mirror %s subject=%s → cascade.events: %s",
             "ok" if ok else "FAILED", msg.subject, env.event_id)


async def run_mirror() -> None:
    import nats
    nc = await nats.connect(NATS_URL, name="absorb-bus-mirror")
    log.info("connected to NATS %s; subscribing %s", NATS_URL, SUBJECT)
    sub = await nc.subscribe(SUBJECT, cb=_handle)
    try:
        await asyncio.Future()                      # run forever (ctrl-C / SIGTERM)
    finally:
        await sub.unsubscribe()
        await nc.drain()


def _install_signal_handlers(loop: asyncio.AbstractEventLoop) -> None:
    try:
        loop.add_signal_handler(signal.SIGINT, loop.stop)
        loop.add_signal_handler(signal.SIGTERM, loop.stop)
    except (NotImplementedError, RuntimeError):
        pass                                        # non-main thread / non-unix


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("ABSORB_MIRROR_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(name)s %(levelname)s %(message)s")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    _install_signal_handlers(loop)
    try:
        loop.run_until_complete(run_mirror())
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())