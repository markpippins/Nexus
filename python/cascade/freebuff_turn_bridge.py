"""freebuff_turn_bridge.py — NATS → drop-directory bridge for Freebuff sessions.

Subscribes to ``nexus.duality.v1.conversation.turn.requested`` and writes
each event as a JSON file to a well-known drop directory.  The Freebuff
session (or nexus-console's message-box polling loop) reads these files
and surfaces the turn request to the role-holder.

Usage::

    NATS_URL=nats://localhost:4222 \\
        TURN_QUEUE_DIR=/tmp/nexus/freebuff/turn-queue \\
        python3 freebuff_turn_bridge.py

Systemd unit: ``~/.config/systemd/user/cascade-freebuff-turn-bridge.service``
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
from typing import Any

# ── Early import check (fail fast, before async loop) ──
try:
    import nats  # noqa: F401
except ImportError as e:
    print(f"[freebuff-turn-bridge] FATAL: {e} — install with: pip install nats-py",
          file=sys.stderr)
    sys.exit(1)

# ── Configuration ───────────────────────────────────────────────────
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")
NATS_SUBJECT = os.getenv(
    "TURN_REQUESTED_SUBJECT",
    "nexus.duality.v1.conversation.turn.requested",
)
TURN_QUEUE_DIR = os.getenv(
    "TURN_QUEUE_DIR",
    "/tmp/nexus/freebuff/turn-queue",
)

# ── Logging ─────────────────────────────────────────────────────────


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [freebuff-turn-bridge] {msg % args}", flush=True)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()
_processed_count = 0


def _signal_handler() -> None:
    _log("Shutdown signal received — draining...")
    _shutdown.set()


# ── Drop-directory writer ───────────────────────────────────────────


def _write_turn_event(payload: dict[str, Any]) -> str | None:
    """Write a turn.requested event to the drop directory.

    Filename: ``<iso_timestamp>-<thread_id_short>.json`` so the consumer
    can process them in chronological order and de-duplicate by thread.

    Returns the file path on success, None on failure.
    """
    try:
        os.makedirs(TURN_QUEUE_DIR, exist_ok=True)
    except OSError as e:
        _log("Cannot create drop directory %s: %s", TURN_QUEUE_DIR, e)
        return None

    thread_id = payload.get("thread_id", "unknown")[:8]
    # Include microseconds to avoid collisions when two events for the
    # same thread arrive within the same second.
    now = time.time()
    safe_ts = time.strftime("%Y%m%dT%H%M%S", time.gmtime(now))
    safe_ts += f"{int((now % 1) * 1_000_000):06d}Z"
    filename = f"{safe_ts}-{thread_id}.json"
    path = os.path.join(TURN_QUEUE_DIR, filename)

    # ── Write atomically (write temp + rename) ──
    tmp_path = path + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f)
        os.rename(tmp_path, path)
        return path
    except OSError as e:
        _log("Failed to write turn event: %s", e)
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return None


# ── NATS subscriber ─────────────────────────────────────────────────


async def run_freebuff_turn_bridge() -> None:
    """Main loop: connect NATS, subscribe, write turn events to disk."""
    global _processed_count

    # ── Ensure drop directory exists ──
    try:
        os.makedirs(TURN_QUEUE_DIR, exist_ok=True)
    except OSError as e:
        _log("FATAL: cannot create %s: %s", TURN_QUEUE_DIR, e)
        return

    _log("Drop directory: %s", TURN_QUEUE_DIR)

    # ── Connect to NATS ──
    _log("Connecting to NATS at %s...", NATS_URL)
    try:
        nc = await nats.connect(NATS_URL, name="freebuff_turn_bridge")
    except Exception as e:
        _log("FATAL: NATS connection failed: %s", e)
        sys.exit(1)
    _log("NATS connected")

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        global _processed_count

        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
        except json.JSONDecodeError as e:
            _log("Invalid JSON on %s: %s", msg.subject, e)
            return

        role = data.get("role", "?")
        thread_id = data.get("thread_id", "?")[:8]
        comment_role = data.get("comment_role", "?")

        _log("turn.requested: role=%s thread=%s replied_by=%s",
             role, thread_id, comment_role)

        path = _write_turn_event(data)
        if path:
            _log("  → wrote %s", os.path.basename(path))
            _processed_count += 1

    # ── Subscribe ──
    sub = await nc.subscribe(NATS_SUBJECT, cb=on_message)
    _log("Subscribed to %s — waiting for turn.requested events...", NATS_SUBJECT)

    # ── Wait for shutdown ──
    try:
        await _shutdown.wait()
    except asyncio.CancelledError:
        pass
    finally:
        _log("Shutting down — %d events written", _processed_count)
        await sub.unsubscribe()
        await nc.drain()
        _log("NATS connection closed")


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

    _log("Starting Freebuff Turn Bridge...")
    _log("NATS: %s | Subject: %s | Drop: %s",
         NATS_URL, NATS_SUBJECT, TURN_QUEUE_DIR)
    try:
        loop.run_until_complete(run_freebuff_turn_bridge())
    except KeyboardInterrupt:
        _log("Interrupted")
    finally:
        loop.close()
        _log("Freebuff Turn Bridge stopped")


if __name__ == "__main__":
    main()
