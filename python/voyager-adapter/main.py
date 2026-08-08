"""
Voyager → Semantics adapter — entry point.

Subscribes to nexus.fs.v1.{observation,hint,span} NATS subjects, parses
CanonicalEnvelope messages, and persists observations into the semantics
schema.

Usage:
    python -m voyager-adapter.main [--nats nats://localhost:4222] [--verbose]

When NATS is unavailable, falls back to a stub/logger mode so the code path
can be verified without a running NATS server.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

# Ensure the shared nats_envelope package is importable
_SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _SHARED not in sys.path:
    sys.path.insert(0, _SHARED)

from nats_envelope.envelope import CanonicalEnvelope

from . import db
from .identity import match_observation

_log = logging.getLogger("voyager-adapter")

# ── Subjects ────────────────────────────────────────────────────────

SUB_OBSERVATION = "nexus.fs.v1.observation"
SUB_HINT = "nexus.fs.v1.hint"
SUB_SPAN = "nexus.fs.v1.span"

ALL_SUBJECTS = [SUB_OBSERVATION, SUB_HINT, SUB_SPAN]


# ── Message processing ──────────────────────────────────────────────

def _parse_envelope(data: bytes) -> Optional[dict]:
    """Parse a NATS message payload into a dict (CanonicalEnvelope shape)."""
    try:
        return json.loads(data.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        _log.warning("Failed to parse NATS message: %s", e)
        return None


def _extract_payload(msg: dict) -> Optional[dict]:
    """Extract the inner payload from a CanonicalEnvelope."""
    return msg.get("payload") or msg


def process_observation(msg: dict) -> None:
    """Process a nexus.fs.v1.observation message."""
    payload = _extract_payload(msg)
    if not payload:
        return

    event_type = msg.get("event_type", "")
    raw_location = payload.get("absolute_path") or payload.get("path") or ""
    raw_hash = payload.get("content_hash") or payload.get("hash") or ""
    device_id = payload.get("device_id") or ""
    inode = str(payload.get("inode", "")) if payload.get("inode") else ""
    platform = payload.get("platform") or "voyager"
    epoch_id = msg.get("epoch_id") or msg.get("correlation_id") or ""

    # Derive asset_kind from event_type
    asset_kind = "directory" if event_type == "DirectoryObservation" else "file"

    # Generate a stable platform_identifier from the file path
    platform_identifier = raw_location or f"voyager:{uuid4().hex[:12]}"

    _log.info("Observation: %s (hash=%s, kind=%s)",
              raw_location, raw_hash[:16] if raw_hash else "none", asset_kind)

    # ── 1. Persist source_observation ───────────────────────────────
    # ingestion_run_id must be a valid UUID or NULL
    run_id = None
    if epoch_id:
        try:
            from uuid import UUID
            UUID(epoch_id)  # validate
            run_id = epoch_id
        except ValueError:
            run_id = uuid4().hex  # generate a valid UUID from the epoch string

    obs = db.insert_source_observation(
        platform=platform,
        platform_identifier=platform_identifier,
        raw_location=raw_location,
        raw_hash=raw_hash if raw_hash else None,
        namespace="voyager",
        ingestion_run_id=run_id,
        observed_at=datetime.now(timezone.utc),
        asset_kind=asset_kind,
        device_id=device_id if device_id else None,
        inode=inode if inode else None,
    )
    _log.debug("source_observation created: %s", obs.get("id"))

    # ── 2. Identity matching ────────────────────────────────────────
    match = match_observation(
        raw_location=raw_location,
        raw_hash=raw_hash if raw_hash else None,
        device_id=device_id if device_id else None,
        inode=inode if inode else None,
    )

    if match["match_type"] == "strong":
        matched_revision_id = match.get("revision_id")
        if matched_revision_id and obs.get("id"):
            _log.info("Strong match → asset %s (revision=%s) — re-linking observation",
                      match.get("asset_id"), matched_revision_id[:8])
            db.update_observation_revision(obs["id"], matched_revision_id)
        else:
            _log.info("Strong match → asset %s (no revision_id to re-link)",
                      match.get("asset_id"))
    elif match["match_type"] in ("medium", "weak"):
        _log.info("%s match → identity claim (confidence=%.2f)",
                  match["match_type"], match["confidence"])
        db.insert_identity_claim(
            asset_id=match.get("asset_id"),
            candidate_asset_id=None,
            claim_type=match.get("claim_type") or match["match_type"],
            confidence=match["confidence"],
            basis=match["basis"],
        )


def process_hint(msg: dict) -> None:
    """Process a nexus.fs.v1.hint (ObservationEdgeHint) message."""
    payload = _extract_payload(msg)
    if not payload:
        return

    from_path = payload.get("from_path") or payload.get("source_path") or ""
    to_path = payload.get("to_path") or payload.get("target_path") or ""
    hint_type = payload.get("hint_type") or payload.get("edge_type") or "related"
    confidence = float(payload.get("confidence", 0.5))

    _log.info("Hint: %s → %s (%s, confidence=%.2f)", from_path, to_path, hint_type, confidence)

    # Create an identity claim for the hinted relationship
    db.insert_identity_claim(
        asset_id=None,
        candidate_asset_id=None,
        claim_type=f"hint:{hint_type}",
        confidence=min(1.0, max(0.0, confidence)),
        basis=f"ObservationEdgeHint: {from_path} → {to_path}",
    )


def process_span(msg: dict) -> None:
    """Process a nexus.fs.v1.span (MetadataSpanEmitted) message."""
    payload = _extract_payload(msg)
    if not payload:
        return

    file_path = payload.get("absolute_path") or payload.get("path") or ""
    span_type = payload.get("span_type") or "metadata"
    _log.info("Span: %s (%s)", file_path, span_type)
    # Spans are metadata annotations — log for now, persist later as needed


# ── NATS subscriber ─────────────────────────────────────────────────

class AdapterSubscriber:
    """NATS subscriber that routes messages to the appropriate handler."""

    def __init__(self, nats_url: str):
        self.nats_url = nats_url
        self.nc = None
        self._running = False

    async def connect(self):
        try:
            import nats
            self.nc = await nats.connect(self.nats_url)
            _log.info("Connected to NATS at %s", self.nats_url)
        except ImportError:
            _log.warning("nats-py not installed — running in stub mode")
        except Exception as e:
            _log.warning("NATS connect failed (%s) — running in stub mode", e)

    async def _handler(self, msg):
        """Route a NATS message to the correct processor."""
        subject = getattr(msg, "subject", "")
        data = getattr(msg, "data", b"")
        parsed = _parse_envelope(data)
        if not parsed:
            return

        event_type = parsed.get("event_type", "")

        if SUB_OBSERVATION in subject:
            process_observation(parsed)
        elif SUB_HINT in subject:
            process_hint(parsed)
        elif SUB_SPAN in subject:
            process_span(parsed)
        else:
            _log.debug("Unhandled subject: %s", subject)

    async def subscribe(self):
        if not self.nc:
            _log.info("No NATS connection — stub mode, no subscriptions active")
            return

        for subject in ALL_SUBJECTS:
            await self.nc.subscribe(subject, cb=self._handler)
            _log.info("Subscribed to %s", subject)

    async def run(self):
        """Connect and subscribe. Blocks until shutdown."""
        await self.connect()
        await self.subscribe()
        self._running = True
        _log.info("Adapter running — waiting for messages on %s", ALL_SUBJECTS)

        # Keep alive
        while self._running:
            await asyncio.sleep(1)

    async def shutdown(self):
        _log.info("Shutting down...")
        self._running = False
        if self.nc:
            await self.nc.close()


# ── Stub mode: dry-run with a synthetic message ─────────────────────

def run_stub():
    """Process a synthetic observation message to verify the code path."""
    _log.info("=== Stub mode: processing synthetic observation ===")
    synthetic = {
        "event_type": "FileObservation",
        "origin_component": "fs-crawler",
        "correlation_id": "stub-epoch-001",
        "subject": SUB_OBSERVATION,
        "payload": {
            "absolute_path": "/home/codex/dev/nexus/README.md",
            "content_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
            "device_id": "stub-device",
            "inode": 12345,
            "platform": "voyager",
            "file_size": 1024,
        },
    }
    process_observation(synthetic)
    _log.info("=== Stub complete ===")


# ── Entry point ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Voyager → Semantics adapter")
    parser.add_argument("--nats", default=os.environ.get("NATS_URL", "nats://localhost:4222"),
                        help="NATS server URL")
    parser.add_argument("--stub", action="store_true",
                        help="Run in stub mode with a synthetic message (no NATS required)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    if args.stub:
        run_stub()
    else:
        subscriber = AdapterSubscriber(args.nats)

        async def _run():
            await subscriber.run()

        loop = asyncio.new_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(subscriber.shutdown()))

        try:
            loop.run_until_complete(_run())
        except KeyboardInterrupt:
            pass
        finally:
            loop.run_until_complete(subscriber.shutdown())
            loop.close()


if __name__ == "__main__":
    main()
