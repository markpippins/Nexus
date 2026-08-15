"""freebuff_turn_consumer.py — Polls /tmp/nexus/freebuff/turn-queue/ for
turn.requested events and surfaces them as Assembly notifications.

For each turn request file in the drop directory this daemon:
1. Reads the JSON payload
2. Posts a notification comment on the Assembly thread
   (e.g. "@architect — new message from engineer: turn requested")
3. Deletes the processed file

The notifications appear in the Assembly UI (embedded in nexus-console),
giving the role-holder a visible cue to respond.

Usage::

    TURN_QUEUE_DIR=/tmp/nexus/freebuff/turn-queue \\
        ASSEMBLY_URL=http://localhost:3107 \\
        python3 freebuff_turn_consumer.py

Systemd unit: ``~/.config/systemd/user/cascade-freebuff-turn-consumer.service``
"""

from __future__ import annotations

import json
import os
import signal
import sys
import time
import urllib.request
from typing import Any

# ── Configuration ───────────────────────────────────────────────────
TURN_QUEUE_DIR = os.getenv(
    "TURN_QUEUE_DIR",
    "/tmp/nexus/freebuff/turn-queue",
)
ASSEMBLY_URL = os.getenv("ASSEMBLY_URL", "http://localhost:3107")
POLL_INTERVAL_S = float(os.getenv("TURN_POLL_INTERVAL_S", "3"))
ENGINEER_UUID = os.getenv(
    "NEXUS_ENGINEER_UUID",
    "af069ff6-760c-44cb-a0d4-11517164169b",
)

# ── Logging ─────────────────────────────────────────────────────────


def _log(msg: str, *args: Any) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    print(f"[{ts}] [freebuff-turn-consumer] {msg % args}", flush=True)


# ── Assembly comment posting ────────────────────────────────────────


def _post_notification(thread_id: str, role: str, comment_role: str) -> bool:
    """Post a turn-request notification comment on the Assembly thread.

    Returns True if the comment was posted successfully.
    """
    mention = f"**@{role}**"
    body = (
        f"{mention} — new message from **{comment_role}** awaits your "
        f"response.\n\n"
        f"> This is an automated turn request from the Duality/Plurality "
        f"conversation system. Reply to this thread to continue the "
        f"discussion."
    )

    payload = json.dumps({
        "body": body,
        "postedById": ENGINEER_UUID,
        "role": "system",
        "model": "freebuff/turn-consumer",
    }).encode()

    try:
        req = urllib.request.Request(
            f"{ASSEMBLY_URL}/api/forums/threads/{thread_id}/comments",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            _log("Notification posted: comment=%s thread=%s role=%s",
                 result.get("id", "?")[:8], thread_id[:8], role)
            return True
    except Exception as e:
        _log("Failed to post notification for %s: %s", role, e)
        return False


# ── File processing ─────────────────────────────────────────────────


def _process_queue() -> int:
    """Process all pending turn-request files. Returns count processed."""
    if not os.path.isdir(TURN_QUEUE_DIR):
        return 0

    files = sorted(
        f for f in os.listdir(TURN_QUEUE_DIR)
        if f.endswith(".json") and not f.endswith(".tmp")
    )

    count = 0
    for filename in files:
        path = os.path.join(TURN_QUEUE_DIR, filename)
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as e:
            _log("Skipping unreadable file %s: %s", filename, e)
            try:
                os.unlink(path)
            except OSError:
                pass
            continue

        thread_id = data.get("thread_id", "")
        role = data.get("role", "")
        comment_role = data.get("comment_role", "")

        if not thread_id or not role:
            _log("Skipping malformed event %s: missing thread_id or role",
                 filename)
            try:
                os.unlink(path)
            except OSError:
                pass
            continue

        if _post_notification(thread_id, role, comment_role):
            count += 1

        # Always remove the file after processing (best-effort)
        try:
            os.unlink(path)
        except OSError as e:
            _log("Failed to remove %s: %s", filename, e)

    return count


# ── Main loop ───────────────────────────────────────────────────────

_shutdown = False


def _signal_handler(_sig: int, _frame: Any) -> None:
    global _shutdown
    _log("Shutdown signal received — draining...")
    _shutdown = True


def main() -> None:
    global _shutdown

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    _log("Starting Freebuff Turn Consumer...")
    _log("Queue dir: %s | Assembly: %s | Poll interval: %.1fs",
         TURN_QUEUE_DIR, ASSEMBLY_URL, POLL_INTERVAL_S)

    total_processed = 0

    while not _shutdown:
        n = _process_queue()
        if n > 0:
            total_processed += n
            _log("Processed %d turn request(s) this cycle (%d total)",
                 n, total_processed)
        time.sleep(POLL_INTERVAL_S)

    # Final drain
    n = _process_queue()
    total_processed += n
    _log("Shutting down — %d total turn requests surfaced", total_processed)


if __name__ == "__main__":
    main()
