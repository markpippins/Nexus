"""probe.py — Pure observation layer for the Cascade Conformance Probe.

Subscribes to existing NATS subjects, captures raw CanonicalEnvelope events
close to the wire, and writes evidence bundles. No interpretation, no LOSM
imports, no normalization.

Usage:

    # Capture one complete transition chain and write an evidence bundle:
    python3 -m cascade.conformance.probe

    # Or import and use programmatically:
    from cascade.conformance.probe import capture_chain
    bundle = await capture_chain(timeout=30.0)
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

# ── Path setup ──────────────────────────────────────────────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)


# ── Configuration ───────────────────────────────────────────────────
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")

# The subjects cascade services publish on.
SUBJECT_OBSERVATION_CAPTURED = "nexus.kernel.v1.transition.observation.captured"
SUBJECT_ASSESSMENT_COMPLETED = "nexus.kernel.v1.transition.assessment.completed"
SUBJECT_ASSEMBLY_CREATED = "nexus.kernel.v1.transition.assembly.created"

# Where evidence bundles are written.
ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")


# ── Data model ──────────────────────────────────────────────────────

@dataclass
class RawEvent:
    """A single event captured close to the wire from NATS."""
    subject: str
    received_at: str            # ISO-8601 when probe received it
    envelope: dict[str, Any]    # The CanonicalEnvelope as parsed JSON
    raw_bytes_size: int         # Size of the raw NATS message in bytes


@dataclass
class EvidenceBundle:
    """The complete archaeological record of one transition observation.

    No interpretation — just what was observed on the wire and what
    was queried from PG after the fact.
    """
    capture_id: str
    started_at: str
    completed_at: str
    events: list[RawEvent] = field(default_factory=list)

    # PG receipts queried after capture completes (populated by projector)
    pg_receipts: list[dict[str, Any]] = field(default_factory=list)


# ── Signal handling ─────────────────────────────────────────────────

_shutdown = asyncio.Event()


def _signal_handler() -> None:
    _shutdown.set()


# ── Probe core ──────────────────────────────────────────────────────

async def capture_chain(
    timeout: float = 60.0,
    min_events: int = 2,
) -> EvidenceBundle:
    """Subscribe to NATS and capture one complete transition chain.

    Runs until timeout expires or shutdown is requested. Returns whatever
    events were collected.

    This is the entry point for the probe. It does not interpret events —
    it writes them as raw evidence.
    """
    try:
        import nats
    except ImportError as e:
        print(f"[probe] FATAL: {e} — install with: pip install nats-py")
        sys.exit(1)

    bundle = EvidenceBundle(
        capture_id=str(uuid.uuid4()),
        started_at=datetime.now(timezone.utc).isoformat(),
        completed_at="",
    )

    print(f"[probe] Starting capture {bundle.capture_id[:8]}...")
    print(f"[probe] NATS: {NATS_URL}")
    print(f"[probe] Subjects: {SUBJECT_OBSERVATION_CAPTURED}, {SUBJECT_ASSESSMENT_COMPLETED}")
    print(f"[probe] Timeout: {timeout}s (min {min_events} event(s) to complete)")
    print()

    # Connect to NATS
    nc = await nats.connect(NATS_URL, name="cascade-conformance-probe")
    print(f"[probe] Connected to NATS (CID: {nc._client_id if hasattr(nc, '_client_id') else '?'})")
    print()

    # ── Message handler ──
    async def on_message(msg: Any) -> None:
        try:
            data: dict[str, Any] = json.loads(msg.data.decode())
            event = RawEvent(
                subject=msg.subject,
                received_at=datetime.now(timezone.utc).isoformat(),
                envelope=data,
                raw_bytes_size=len(msg.data),
            )
            bundle.events.append(event)
            print(f"  [probe] ⚡ captured {msg.subject}")
            print(f"          event_id={data.get('event_id', '?')[:12]}... "
                  f"type={data.get('event_type', '?')}")
        except json.JSONDecodeError as e:
            print(f"  [probe] ⚠ non-JSON message on {msg.subject}: {e}")

    # ── Subscribe ──
    sub_obs = await nc.subscribe(SUBJECT_OBSERVATION_CAPTURED, cb=on_message)
    sub_asm = await nc.subscribe(SUBJECT_ASSESSMENT_COMPLETED, cb=on_message)

    print(f"[probe] Subscribed — waiting for cascade events...")
    print(f"[probe] Press Ctrl+C to stop early")
    print()

    # ── Wait for events or timeout ──
    start = time.monotonic()
    try:
        while True:
            elapsed = time.monotonic() - start
            remaining = timeout - elapsed

            if remaining <= 0:
                print(f"\n[probe] Timeout reached ({timeout}s)")
                break

            if _shutdown.is_set():
                print(f"\n[probe] Shutdown requested")
                break

            # Brief sleep to yield control — events arrive via callback
            await asyncio.sleep(0.1)

    except asyncio.CancelledError:
        print(f"\n[probe] Cancelled")
    finally:
        bundle.completed_at = datetime.now(timezone.utc).isoformat()

        # Unsubscribe and drain
        await sub_obs.unsubscribe()
        await sub_asm.unsubscribe()
        await nc.drain()

        print(f"\n[probe] Capture complete: {len(bundle.events)} event(s) in "
              f"{time.monotonic() - start:.1f}s")

        # Write evidence bundle
        _write_bundle(bundle)

    # Return outside the finally block: a return in `finally` would swallow
    # any in-flight exception (S1143) — e.g. CancelledError — and mask real
    # capture failures from the caller.
    return bundle


# ── Persistence ─────────────────────────────────────────────────────

def _write_bundle(bundle: EvidenceBundle) -> str:
    """Write the evidence bundle to the artifacts directory.

    Returns the file path.
    """
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"capture_{bundle.capture_id[:8]}_{timestamp}.json"
    filepath = os.path.join(ARTIFACTS_DIR, filename)

    with open(filepath, "w") as f:
        json.dump(asdict(bundle), f, indent=2, default=str)

    print(f"[probe] Evidence bundle written: {filepath}")
    print(f"[probe] File size: {os.path.getsize(filepath)} bytes")
    return filepath


def load_bundle(filepath: str) -> EvidenceBundle:
    """Load a previously saved evidence bundle."""
    with open(filepath) as f:
        data = json.load(f)
    # Reconstruct RawEvent objects from dicts
    events = [RawEvent(**e) for e in data.pop("events", [])]
    pg_receipts = data.pop("pg_receipts", [])
    bundle = EvidenceBundle(**data)
    bundle.events = events
    bundle.pg_receipts = pg_receipts
    return bundle


def list_bundles() -> list[str]:
    """List all evidence bundle files in the artifacts directory."""
    if not os.path.isdir(ARTIFACTS_DIR):
        return []
    files = sorted(os.listdir(ARTIFACTS_DIR))
    return [os.path.join(ARTIFACTS_DIR, f) for f in files if f.endswith(".json")]


# ── Entry point ─────────────────────────────────────────────────────

async def main() -> None:
    """Capture one chain and exit."""
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            pass

    bundle = await capture_chain(timeout=120.0, min_events=2)

    summary = {
        "capture_id": bundle.capture_id[:8],
        "events": len(bundle.events),
        "subjects": list(set(e.subject for e in bundle.events)),
    }
    print(f"\n[probe] Summary: {json.dumps(summary, indent=2)}")

    if len(bundle.events) < 2:
        print("[probe] Not enough events captured for a complete chain.")
        print("[probe] Run batch_file_candidates.py to trigger cascade events:")
        print("[probe]   cd ~/dev/nexus/python && python3 -m rover.batch_file_candidates")
        sys.exit(0)


def run() -> None:
    """Synchronous entry point for console_scripts."""
    asyncio.run(main())


if __name__ == "__main__":
    run()
