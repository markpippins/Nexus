"""voyager_envelope_adapter.py — maps voyager's CEREnvelope pattern to CanonicalEnvelope.

Migration helper: replaces CEREnvelope(...) calls with CanonicalEnvelope
construction.  All voyager subsystems use this adapter so the transition
from CEREnvelope to the unified CanonicalEnvelope is centralized.

Usage::

    from .voyager_envelope_adapter import create_envelope, SUBJECT_MAP

    envelope = create_envelope(
        event_type="FileObservation",
        origin_layer="fs-crawler",
        epoch_id=self.current_epoch,
        payload=observation.model_dump(),
        source_event_ids=[...],
    )
"""

from __future__ import annotations

import sys
import os
import uuid

# ── Ensure nats_envelope is importable ──
# voyager runs from voyager/src/; the shared package is at nexus/python/nats_envelope/
_SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "python"))
if _SHARED not in sys.path:
    sys.path.insert(0, _SHARED)

from nats_envelope.envelope import CanonicalEnvelope, Classification

# ── Subject mapping (voyager domain) ────────────────────────────────

SUBJECT_MAP: dict[str, str] = {
    "FileObservation": "nexus.fs.v1.observation",
    "DirectoryObservation": "nexus.fs.v1.observation",
    "FileDeleted": "nexus.fs.v1.observation",
    "MetadataSpanEmitted": "nexus.fs.v1.span",
    "ObservationEdgeHint": "nexus.fs.v1.hint",
    "TopologySignal": "nexus.fs.v1.topology",
    "IdentityCandidate": "nexus.fs.v1.identity",
    "Entity": "nexus.fs.v1.identity",
    "EntityDrift": "nexus.fs.v1.drift",
    "RequirementCandidate": "nexus.fs.v1.requirement",
}


def subject_for(event_type: str) -> str:
    """Return the NATS subject for a voyager event type."""
    return SUBJECT_MAP.get(event_type, f"nexus.fs.v1.{event_type.lower()}")


# ── Actor / Intent helpers ──────────────────────────────────────────

def _default_actor() -> dict[str, str]:
    import socket
    return {"id": f"voyager-{socket.gethostname()}", "type": "service"}


def _default_intent() -> dict[str, str]:
    return {"action": "observe", "target_type": "file"}


# ── create_envelope ──────────────────────────────────────────────────

def create_envelope(
    event_type: str,
    payload: dict,
    *,
    origin_layer: str = "fs-crawler",
    epoch_id: str | None = None,
    source_event_ids: list[str] | None = None,
    correlation_id: str | None = None,
    causation_id: str | None = None,
    actor: dict[str, str] | None = None,
    intent: dict[str, str] | None = None,
    domain: str = "fs",
    ccnf_version: int = 1,
    classification: Classification = Classification.INTERNAL,
) -> CanonicalEnvelope:
    """Create a CanonicalEnvelope from voyager's parameter pattern.

    Maps the old CEREnvelope kwargs to CanonicalEnvelope fields.
    All voyager subsystems should use this instead of constructing
    CanonicalEnvelope directly, so the mapping stays centralized.
    """
    return CanonicalEnvelope(
        event_type=event_type,
        origin_component=origin_layer,
        correlation_id=correlation_id or epoch_id or str(uuid.uuid4()),
        subject=subject_for(event_type),
        payload=payload,
        domain=domain,
        ccnf_version=ccnf_version,
        epoch_id=epoch_id,
        actor=actor or _default_actor(),
        intent=intent or _default_intent(),
        source_event_ids=source_event_ids or [],
        causation_id=causation_id,
        classification=classification,
    )
