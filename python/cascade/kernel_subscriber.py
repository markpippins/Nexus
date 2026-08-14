"""kernel_subscriber.py — PostgreSQL LISTEN subscriber for kernel transitions.

Listens on the ``kernel_transition_committed`` NOTIFY channel and
publishes each transition as a CanonicalEnvelope over NATS.

This is the bridge between the **PostgreSQL Semantic Kernel** (the
append-only event log) and **Cascade** (the orchestration runtime that
responds to events).

Designed to run alongside ``main.py`` as its own process::

    # Terminal 1 — Cascade file poller (existing)
    python3 main.py

    # Terminal 2 — Kernel NOTIFY subscriber (new)
    DATABASE_URL=postgres://pguser:pgpass@localhost:5432/nexus python3 kernel_subscriber.py

Architecture::

    PostgreSQL                              Python                     NATS
    kernel.transition_event                 kernel_subscriber.py       ──→ CanonicalEnvelope
        │  AFTER INSERT trigger                  │                          on subject:
        │  ──→ pg_notify(...)                    │                          kernel.transition.committed
        │                                       │
        └──────────────── NOTIFY ────────────────┘
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
LISTEN_CHANNEL = "kernel_transition_committed"

# ── Globals for graceful shutdown ──────────────────────────────────
_running = True


def _signal_handler(signum: int, _frame: Any) -> None:
    global _running
    print(f"[kernel_subscriber] Signal {signum} received — shutting down...",
          file=sys.stderr)
    _running = False


signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ── Core subscriber ─────────────────────────────────────────────────

def _build_kernel_transition_subject(event_type: str) -> str:
    """Map a kernel event_type to a NATS subject.

    Pattern: nexus.kernel.v1.transition.<event_type_snake>

    Examples:
        intent.created    → nexus.kernel.v1.transition.intent.created
        transition.committed → nexus.kernel.v1.transition.transition.committed
    """
    return f"nexus.kernel.v1.transition.{event_type}"


def _build_envelope(
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Build the event dict that nats_publisher expects for enqueue.

    Returns a flat dict matching cascade's event format so the
    existing ``try_enqueue_event()`` adapter can wrap it.
    """
    return {
        "id": payload["event_id"],
        "type": payload["event_type"],
        "timestamp": payload["timestamp"],
        "source": "kernel",
        "payload": {
            "aggregate_type": payload.get("aggregate_type"),
            "aggregate_id": payload.get("aggregate_id"),
            "actor": payload.get("actor"),
            "raw": payload,
        },
    }


def run_kernel_subscriber() -> None:
    """Main loop: connect to PostgreSQL, LISTEN, and publish over NATS."""
    # ── Import optional deps with helpful error messages ──
    try:
        import psycopg2
        import psycopg2.extensions
    except ImportError:
        print(
            "[kernel_subscriber] FATAL: psycopg2 is not installed.\n"
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
            print(f"[kernel_subscriber] NATS sidecar started ({NATS_URL})")
        except ImportError:
            print("[kernel_subscriber] nats_publisher not available — "
                  "events will not be published over NATS",
                  file=sys.stderr)
    else:
        print("[kernel_subscriber] NATS_URL not set — events will be "
              "printed to stdout only",
              file=sys.stderr)

    # ── Connect to PostgreSQL ──
    conn = psycopg2.connect(DATABASE_URL)
    conn.set_isolation_level(
        psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT
    )
    cur = conn.cursor()
    cur.execute(f"LISTEN {LISTEN_CHANNEL};")
    print(f"[kernel_subscriber] Listening on channel "
          f"'{LISTEN_CHANNEL}' — waiting for kernel transitions...")

    # ── Main notification loop ──
    try:
        while _running:
            # Poll PostgreSQL connection for incoming notifications.
            # Without select() + conn.poll(), conn.notifies stays empty.
            ready = select.select([conn], [], [], 0.5)
            if ready[0]:
                conn.poll()
            while conn.notifies:
                notify = conn.notifies.pop(0)
                try:
                    payload: dict[str, Any] = json.loads(notify.payload)
                    event_type = payload.get("event_type", "unknown")
                    subject = _build_kernel_transition_subject(event_type)

                    print(f"[kernel_subscriber] Transition committed: "
                          f"{event_type} ({payload.get('event_id', '?')})")

                    # ── Build a CanonicalEnvelope and publish directly ──
                    # We use enqueue_publish() instead of try_enqueue_event()
                    # to control the subject namespace. try_enqueue_event
                    # routes through cascade's workflow subject mapper,
                    # which would turn kernel events into cascade subjects
                    # (nexus.cascade.v1.workflow.*). Kernel events must
                    # stay in the kernel namespace (nexus.kernel.v1.transition.*).
                    try:
                        from nats_publisher import enqueue_publish, publish_failure_event
                        from nats_envelope.envelope import CanonicalEnvelope, Classification

                        event_dict = _build_envelope(payload)

                        # ── D-T19-1: enforce identity, no self-correlation ──
                        # WorkRequest transitions MUST carry correlation_id
                        # (the WR identity) and causation_id (the conduit event
                        # that caused this transition). The retired legacy
                        # conduit.notify_work_request_event path emitted these as
                        # NULL, which the old `or event_id` fallback masked by
                        # self-correlating. Reject instead of self-correlating.
                        # NOTE: non-WR kernel events (observation.captured, etc.)
                        # intentionally pass correlation_id=None until their
                        # families get correlation wired (out of D-T19-1 scope).
                        correlation_id = payload.get("correlation_id")
                        causation_id = payload.get("causation_id")
                        if event_type.startswith("work_request.") and not correlation_id:
                            print(
                                f"[kernel_subscriber] SCHEMA VIOLATION: "
                                f"WorkRequest event {event_type} "
                                f"({payload.get('event_id', '?')}) missing "
                                f"correlation_id — rejecting (no self-correlation)",
                                file=sys.stderr,
                            )
                            # D-T19 item 5: refusal is observable on the canonical channel.
                            publish_failure_event(
                                "watchdog",
                                f"WorkRequest event {event_type} missing correlation_id",
                                aggregate_id=payload.get("aggregate_id"),
                                causation_id=causation_id,
                            )
                            continue
                        if event_type.startswith("work_request.") and not causation_id:
                            print(
                                f"[kernel_subscriber] SCHEMA VIOLATION: "
                                f"WorkRequest event {event_type} "
                                f"({payload.get('event_id', '?')}) missing "
                                f"causation_id — rejecting (no self-correlation)",
                                file=sys.stderr,
                            )
                            # D-T19 item 5: refusal is observable on the canonical channel.
                            publish_failure_event(
                                "watchdog",
                                f"WorkRequest event {event_type} missing causation_id",
                                aggregate_id=payload.get("aggregate_id"),
                                correlation_id=correlation_id,
                            )
                            continue

                        envelope = CanonicalEnvelope(
                            event_id=payload.get("event_id", ""),
                            event_type=event_type,
                            occurred_at=payload.get("timestamp", ""),
                            origin_component="kernel",
                            domain="kernel",
                            correlation_id=correlation_id,
                            causation_id=causation_id,
                            classification=Classification.INTERNAL,
                            subject=subject,
                            payload=event_dict,
                        )
                        enqueue_publish(subject, envelope)
                    except ImportError as e:
                        # Fallback: print to stdout
                        print(f"[kernel_subscriber] Enqueue import error: {e}",
                              file=sys.stderr)
                        print(f"[kernel_subscriber] [EVENT] {subject}")
                        print(json.dumps(payload, indent=2))
                    except Exception as e:
                        print(f"[kernel_subscriber] Enqueue error: {e}",
                              file=sys.stderr)

                except json.JSONDecodeError as e:
                    print(f"[kernel_subscriber] Invalid NOTIFY payload: "
                          f"{e}", file=sys.stderr)
    finally:
        cur.close()
        conn.close()
        print("[kernel_subscriber] Connection closed")

        # ── Stop NATS sidecar ──
        if NATS_URL:
            try:
                from nats_publisher import stop_nats_sidecar
                stop_nats_sidecar()
            except ImportError:
                pass


def main() -> None:
    """Entry point."""
    print("[kernel_subscriber] Starting PostgreSQL Kernel Subscriber...")
    run_kernel_subscriber()


if __name__ == "__main__":
    main()
