"""obs_subscriber.py — PostgreSQL LISTEN subscriber for PEB/Vision observability.

Listens on ``peb_governance_event_created`` and
``vision_lifecycle_event_created`` NOTIFY channels and publishes each
event as a CanonicalEnvelope over NATS.

Architecture::

    PostgreSQL                              Python                     NATS
    peb.governance_events                   obs_subscriber.py          ──→ CanonicalEnvelope
        │  AFTER INSERT trigger                  │                          on subjects:
        │  ──→ pg_notify(...)                    │                          nexus.peb.v1.governance.created
        │                                       │
    vision.lifecycle_events (view)             │                          nexus.vision.v1.lifecycle.created
        │  INSTEAD OF INSERT trigger            │
        │  ──→ pg_notify(...)                    │
        │                                       │
        └──────────────── NOTIFY ────────────────┘

Designed to run alongside kernel_subscriber.py as its own process::

    # Terminal 1 — Kernel subscriber (existing)
    python3 kernel_subscriber.py

    # Terminal 2 — Observability subscriber (new)
    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus python3 obs_subscriber.py
"""

from __future__ import annotations

import json
import os
import select
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
NATS_URL = os.getenv("NATS_URL")

# Channels to listen on and their NATS subject mappings
CHANNELS = {
    "peb_governance_event_created": "nexus.peb.v1.governance.created",
    "vision_lifecycle_event_created": "nexus.vision.v1.lifecycle.created",
}

# ── Globals for graceful shutdown ──────────────────────────────────
_running = True


def _signal_handler(signum: int, _frame: Any) -> None:
    global _running
    print(f"[obs_subscriber] Signal {signum} received — shutting down...",
          file=sys.stderr)
    _running = False


signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ── Core subscriber ─────────────────────────────────────────────────

def _build_envelope(
    payload: dict[str, Any],
    source: str,
    aggregate_type: str,
) -> dict[str, Any]:
    """Build the event dict that nats_publisher expects for enqueue."""
    return {
        "id": str(payload.get("event_id", payload.get("aggregate_id", ""))),
        "type": payload.get("event_type", f"{source}.created"),
        "timestamp": payload.get("timestamp", ""),
        "source": source,
        "payload": {
            "aggregate_type": aggregate_type,
            "aggregate_id": payload.get("aggregate_id"),
            "actor": payload.get("actor"),
            "raw": payload,
        },
    }


def run_obs_subscriber() -> None:
    """Main loop: connect to PostgreSQL, LISTEN, and publish over NATS."""
    # ── Import optional deps with helpful error messages ──
    try:
        import psycopg2
        import psycopg2.extensions
    except ImportError:
        print(
            "[obs_subscriber] FATAL: psycopg2 is not installed.\n"
            "  Install it with:  pip install psycopg2-binary\n"
            "  Or add it to requirements.txt.",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── Start NATS sidecar (if NATS_URL is configured) ──
    if NATS_URL:
        try:
            from nats_publisher import start_nats_sidecar
            start_nats_sidecar(NATS_URL)
            print(f"[obs_subscriber] NATS sidecar started ({NATS_URL})")
        except ImportError:
            print("[obs_subscriber] nats_publisher not available — "
                  "events will be printed to stdout only",
                  file=sys.stderr)
    else:
        print("[obs_subscriber] NATS_URL not set — events will be "
              "printed to stdout only",
              file=sys.stderr)

    # ── Connect to PostgreSQL ──
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(
        psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT
    )
    cur = conn.cursor()

    # ── Subscribe to all channels ──
    for channel in CHANNELS:
        cur.execute(f"LISTEN {channel};")
        print(f"[obs_subscriber] Subscribed to channel '{channel}'")

    print("[obs_subscriber] Listening for PEB/Vision events...")

    # ── Main notification loop ──
    try:
        while _running:
            ready = select.select([conn], [], [], 0.5)
            if ready[0]:
                conn.poll()
            while conn.notifies:
                notify = conn.notifies.pop(0)
                try:
                    payload: dict[str, Any] = json.loads(notify.payload)
                    channel = notify.channel
                    subject = CHANNELS.get(channel)
                    if not subject:
                        print(f"[obs_subscriber] Unknown channel: {channel}",
                              file=sys.stderr)
                        continue

                    event_type = payload.get("event_type", "unknown")
                    event_id = payload.get("event_id",
                                          payload.get("aggregate_id", "?"))
                    aggregate_type = payload.get("aggregate_type", "unknown")

                    print(f"[obs_subscriber] {channel}: "
                          f"{event_type} ({event_id})")

                    # ── Build a CanonicalEnvelope and publish ──
                    try:
                        from nats_publisher import enqueue_publish
                        from nats_envelope.envelope import (
                            CanonicalEnvelope, Classification,
                        )

                        # Derive source from channel
                        source = "peb" if "peb" in channel else "vision"
                        event_dict = _build_envelope(
                            payload, source, aggregate_type,
                        )

                        envelope = CanonicalEnvelope(
                            event_id=str(event_id),
                            event_type=event_type,
                            occurred_at=payload.get("timestamp", ""),
                            origin_component=source,
                            domain=source,
                            correlation_id=str(event_id),
                            causation_id=None,
                            classification=Classification.INTERNAL,
                            subject=subject,
                            payload=event_dict,
                        )
                        enqueue_publish(subject, envelope)
                    except ImportError as e:
                        print(f"[obs_subscriber] Enqueue import error: {e}",
                              file=sys.stderr)
                        print(f"[obs_subscriber] [EVENT] {subject}")
                        print(json.dumps(payload, indent=2))
                    except Exception as e:
                        print(f"[obs_subscriber] Enqueue error: {e}",
                              file=sys.stderr)

                except json.JSONDecodeError as e:
                    print(f"[obs_subscriber] Invalid NOTIFY payload: "
                          f"{e}", file=sys.stderr)
    finally:
        cur.close()
        conn.close()
        print("[obs_subscriber] Connection closed")

        # ── Stop NATS sidecar ──
        if NATS_URL:
            try:
                from nats_publisher import stop_nats_sidecar
                stop_nats_sidecar()
            except ImportError:
                pass


def main() -> None:
    """Entry point."""
    print("[obs_subscriber] Starting Observability Subscriber...")
    run_obs_subscriber()


if __name__ == "__main__":
    main()
