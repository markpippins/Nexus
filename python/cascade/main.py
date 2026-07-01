"""main.py — Cascade pure event bus loop.

Reads events from the ``events/`` directory, validates them,
and publishes them via NATS. No LLM calls, no workflow orchestration,
no content generation.

Cascade is now a single-responsibility event bus:
    ingest → validate → sequence → persist → publish

Runtime::

    NATS_URL=nats://localhost:4222 python3 main.py

Architecture::

    while True:
        load new events from events/
        validate each event (structural)
        persist offset (last_timestamp + processed_ids)
        enqueue for NATS publish (via sidecar thread)
        sleep 2s
"""

from __future__ import annotations

import json
import os
import sys
import time

# ── Path setup (same pattern as nats_publisher.py) ──────────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

# ── Directories ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EVENT_DIR = os.path.join(BASE_DIR, "events")
OFFSET_FILE = os.path.join(BASE_DIR, "offset.json")

# ── Import validators (local, no LLM deps) ─────────────────────────
from validators.loader import load_events


# ═══════════════════════════════════════════════════════════════════════
#  Offset tracking
# ═══════════════════════════════════════════════════════════════════════

def read_offset() -> tuple[str, set[str]]:
    """Read the offset file. Returns (last_timestamp, processed_ids)."""
    if os.path.exists(OFFSET_FILE):
        try:
            with open(OFFSET_FILE) as f:
                data = json.load(f)
                return (
                    data.get("last_timestamp", ""),
                    set(data.get("processed_ids", [])),
                )
        except (json.JSONDecodeError, KeyError, OSError):
            pass
    return "", set()


def write_offset(timestamp: str, processed_ids: set[str]) -> None:
    """Persist offset state to disk."""
    with open(OFFSET_FILE, "w") as f:
        json.dump(
            {
                "last_timestamp": timestamp,
                "processed_ids": sorted(processed_ids),
            },
            f,
        )


# ═══════════════════════════════════════════════════════════════════════
#  Event publishing
# ═══════════════════════════════════════════════════════════════════════

def publish_event(event_dict: dict) -> None:
    """Enqueue an event for NATS publish via the sidecar thread.

    Graceful fallback: logged if nats_publisher is not available
    or NATS is down. Events always persist on disk first.
    """
    try:
        from nats_publisher import try_enqueue_event
        try_enqueue_event(event_dict)
    except ImportError:
        print(f"[cascade] nats_publisher not available — NATS publish skipped",
              file=sys.stderr)
    except Exception as e:
        print(f"[cascade] NATS publish failed for "
              f"{event_dict.get('id', '?')}: {e}",
              file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════
#  Main loop
# ═══════════════════════════════════════════════════════════════════════

def main() -> None:
    """Run the Cascade event bus loop."""

    # ── Start NATS publish sidecar ──
    nats_url = os.getenv("NATS_URL")
    if nats_url:
        try:
            from nats_publisher import start_nats_sidecar
            start_nats_sidecar(nats_url)
        except ImportError:
            pass

    try:
        # ── Main poll loop ──
        while True:
            last_timestamp, processed_ids = read_offset()

            # Load and validate events from disk
            valid_events, errors = load_events(EVENT_DIR)

            if errors:
                for fname, err in errors:
                    print(f"[cascade] VALIDATION {fname}: {err}")

            valid_events.sort(key=lambda e: e.get("timestamp", ""))

            # Filter to only new events (not yet processed)
            new_events = [
                evt for evt in valid_events
                if evt.get("id") and evt["id"] not in processed_ids
            ]

            for evt in new_events:
                publish_event(evt)
                processed_ids.add(evt["id"])
                if evt.get("timestamp"):
                    last_timestamp = evt["timestamp"]

            if new_events:
                write_offset(last_timestamp, processed_ids)
                print(f"[cascade] Published {len(new_events)} event(s) — "
                      f"{len(processed_ids)} total processed")

            time.sleep(2)

    finally:
        # ── Stop NATS publish sidecar ──
        if nats_url:
            try:
                from nats_publisher import stop_nats_sidecar
                stop_nats_sidecar()
            except ImportError:
                pass


if __name__ == "__main__":
    main()
