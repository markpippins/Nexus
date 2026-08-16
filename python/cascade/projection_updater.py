"""projection_updater.py — NATS subscriber that projects kernel events to DB.

Listens on ``nexus.kernel.v1.transition.*`` NATS subjects and writes each
event into ``kernel.event_log`` — the canonical projection table.

This is the REDUCER in the compiler pipeline:

    Kernel → Events → Reducers → Views
                      ↑
               projection_updater.py

Each event is written exactly once (idempotent via event_id UNIQUE constraint).
The subscriber is stateless and recovers gracefully from disconnection.

Architecture::

    PostgreSQL                        NATS                         Python
    sys_transition()                  nexus.kernel.v1.transition.*  projection_updater.py
        │ AFTER INSERT trigger             ↑                            │
        │ ──→ pg_notify(...)               │                            │
        │                                  │                            │
        └── kernel_subscriber.py ──────────┘                            │
                                    CanonicalEnvelope                   │
                                                                        ▼
                                                               kernel.event_log
                                                                 (PostgreSQL)

Usage::

    # Start the subscriber (runs as a long-lived process)
    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus \\
        NATS_URL=nats://localhost:4222 \\
        python3 projection_updater.py

    # Or via systemd / supervisor / docker for production.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
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
NATS_SUBJECT = "nexus.kernel.v1.transition.>"
REDUCER_VERSION = "kernel.event_log@0.1"

# ── Logging ─────────────────────────────────────────────────────────

def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [projection_updater] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()


def _signal_handler() -> None:
    _log("Shutdown signal received — draining...")
    _shutdown.set()


# ── Core subscriber ─────────────────────────────────────────────────

async def run_projection_updater() -> None:
    """Main async loop: connect NATS + DB, subscribe, project."""
    # ── Imports (with helpful error messages) ──
    try:
        import psycopg2
        import psycopg2.extras
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
    nc = await nats.connect(NATS_URL, name="projection_updater")
    _log("NATS connected")

    # Track subscription count for logging
    projected_count = 0

    # ── Message handler ──
    async def on_message(msg: nats.aio.msg.Msg) -> None:
        nonlocal projected_count

        try:
            # Parse the CanonicalEnvelope from the NATS message
            data: dict[str, Any] = json.loads(msg.data.decode())
            subject: str = msg.subject

            # Extract event fields from the envelope
            #
            # CanonicalEnvelope structure (to_dict):
            #   event_id, event_type, occurred_at, subject, ...
            #   payload: {              # what we put in as event_dict
            #       "id": ...,
            #       "type": ...,
            #       "timestamp": ...,
            #       "source": "kernel",
            #       "payload": {        # inner payload from _build_envelope
            #           "aggregate_type": ...,
            #           "aggregate_id": ...,
            #           "actor": ...,
            #           "raw": {         # original NOTIFY payload
            #               "event_id": ..., "event_type": ...,
            #               "aggregate_type": ..., "aggregate_id": ...,
            #               "actor": ..., "timestamp": ...,
            #           }
            #       }
            #   }

            # Envelope-level fields (set by CanonicalEnvelope constructor)
            event_id = data.get("event_id", "")
            event_type = data.get("event_type", "unknown")
            occurred_at = data.get("occurred_at", "")

            # Inner payload from _build_envelope (one level deeper)
            event_dict = data.get("payload", {})
            inner_payload = event_dict.get("payload", {})

            # Fallback chain: inner → raw → envelope-level
            raw = inner_payload.get("raw", inner_payload)
            aggregate_type = (inner_payload.get("aggregate_type")
                             or raw.get("aggregate_type", ""))
            aggregate_id = (inner_payload.get("aggregate_id")
                           or raw.get("aggregate_id", ""))
            actor = (inner_payload.get("actor")
                    or raw.get("actor", "")
                    or event_dict.get("payload", {}).get("actor", ""))

            # ── Write to event_log projection (idempotent) ──
            # psycopg2 needs json.dumps() for JSONB columns — can't auto-adapt dicts
            payload_json = json.dumps(data.get("payload", {}))
            with pg_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO kernel.event_log (
                        event_id, event_type, aggregate_type, aggregate_id,
                        actor, event_timestamp, payload, reducer_version
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s::jsonb, %s
                    )
                    ON CONFLICT (event_id) DO NOTHING
                    """,
                    (
                        event_id,
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        actor,
                        occurred_at,
                        payload_json,
                        REDUCER_VERSION,
                    ),
                )
                if cur.rowcount > 0:
                    projected_count += 1
                    _log("Projected event %s (%s) [total=%d]",
                         event_id[:8], event_type, projected_count)

        except Exception as e:
            _log("Error processing message: %s", e)
            # Don't crash — log and continue
            import traceback
            _log(traceback.format_exc())

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for kernel events...", NATS_SUBJECT)
    _log("Projection table: kernel.event_log (reducer_version=%s)", REDUCER_VERSION)

    # ── Wait for shutdown signal ──
    try:
        await _shutdown.wait()
    except asyncio.CancelledError:
        pass
    finally:
        _log("Shutting down — %d events projected this session", projected_count)
        await sub.unsubscribe()
        await nc.drain()
        pg_conn.close()
        _log("Connections closed")


# ── Entry point ─────────────────────────────────────────────────────

def main() -> None:
    """Entry point — installs signal handlers and runs the async loop."""
    # Register signal handlers for graceful shutdown
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    _log("Starting Projection Updater...")
    try:
        loop.run_until_complete(run_projection_updater())
    except KeyboardInterrupt:
        _log("Interrupted")
    finally:
        loop.close()
        _log("Projection Updater stopped")


if __name__ == "__main__":
    main()
