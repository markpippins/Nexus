"""projector.py — Maps conduit events to spoken utterance text.

Non-invasive: reads conduit event payloads and projects them into
human-friendly spoken summaries. Never modifies source events.

The projection rules follow the TTS Audit Log Specification:
  - State transitions → priority-based utterance templates
  - Health checks → periodic pipeline summaries
  - Anomalies → high-priority alert utterances
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Persona(str, Enum):
    MONITOR = "monitor"
    OPS = "ops"
    REVIEW = "review"
    DEBUG = "debug"


class UtteranceType(str, Enum):
    STATE_TRANSITION = "state_transition"
    HEALTH_CHECK = "health_check"
    ANOMALY = "anomaly"
    SUMMARY = "summary"


@dataclass
class Utterance:
    """A projected utterance ready for speech synthesis."""

    text: str
    source_event_id: str | None
    utterance_type: str
    priority: int  # 1–10, 10 = highest
    persona: str

    # Metadata for audit trail
    source_event_type: str | None = None
    projected_at: str | None = None

    def __hash__(self) -> int:
        return hash(self.source_event_id or "")


# ── Projection templates ─────────────────────────────────────────────

# Maps conduit event types to (template, priority, persona)
# Event types match the actual conduit.work_request_events.event_type values.
EVENT_TEMPLATES: dict[str, tuple[str, int, str]] = {
    "WR_SUBMITTED": (
        "Work request {id} submitted{summary}",
        4,
        Persona.OPS,
    ),
    "WR_VALIDATED": (
        "Work request {id} validated",
        3,
        Persona.DEBUG,
    ),
    "WR_QUEUED": (
        "Work request {id} queued for processing",
        3,
        Persona.DEBUG,
    ),
    "WR_CLAIMED": (
        "Work request {id} claimed by builder",
        5,
        Persona.MONITOR,
    ),
    "WR_ACKED": (
        "Work request {id} acknowledged",
        3,
        Persona.DEBUG,
    ),
    "WR_SETTLED": (
        "Work request {id} completed",
        6,
        Persona.MONITOR,
    ),
    "WR_NOOP": (
        "Work request {id} requires no action",
        2,
        Persona.DEBUG,
    ),
    "WR_REJECTED": (
        "Work request {id} rejected{reason}",
        7,
        Persona.OPS,
    ),
    "WR_FAILED": (
        "Alert: Work request {id} failed{reason}",
        9,
        Persona.OPS,
    ),
    "WR_DEFERRED": (
        "Work request {id} deferred{reason}",
        4,
        Persona.OPS,
    ),
    # Also handle legacy event types that may appear in the older schema
    "WORKREQUEST.CREATED": (
        "New work request: {title}",
        4,
        Persona.OPS,
    ),
    "WORKREQUEST.DISPATCHED": (
        "{title} dispatched to builder",
        5,
        Persona.MONITOR,
    ),
    "WORKREQUEST.COMPLETED": (
        "{title} completed successfully",
        6,
        Persona.MONITOR,
    ),
    "WORKREQUEST.FAILED": (
        "Alert: {title} failed. {error}",
        9,
        Persona.OPS,
    ),
    "EXECUTION.STARTED": (
        "Execution started: {title}",
        3,
        Persona.DEBUG,
    ),
    "EXECUTION.COMPLETED": (
        "Execution finished: {title}",
        5,
        Persona.MONITOR,
    ),
    "STATE.TRANSITION_COMMITTED": (
        "State changed: {from_state} to {to_state}",
        3,
        Persona.DEBUG,
    ),
}


def _safe_get(data: dict[str, Any], key: str, default: str = "") -> str:
    """Safely extract a string from a nested dict, returning default on failure."""
    val = data.get(key, default)
    if val is None:
        return default
    return str(val)


def project_event(event_type: str, payload: dict[str, Any]) -> Utterance | None:
    """Project a single conduit event into an utterance.

    Returns None if the event type has no speech projection rule.
    """
    template_def = EVENT_TEMPLATES.get(event_type)
    if template_def is None:
        return None

    template, priority, persona = template_def

    # Build template variables from payload
    wr_id = _safe_get(payload, "work_request_id", "")
    short_id = wr_id[:8] or "unknown"

    # Extract a human-readable summary from the payload
    summary = ""
    if isinstance(payload.get("intent"), dict):
        intent = payload["intent"]
        summary = _safe_get(intent, "objective", _safe_get(intent, "type", ""))
    if not summary:
        summary = _safe_get(payload, "summary", "")
    # Only prepend punctuation when non-empty so templates like
    # "Work request {id} submitted{summary}" don't produce trailing colons.
    if summary:
        summary = f": {summary}"

    reason = _safe_get(payload, "reason", "")
    if reason:
        reason = f": {reason}"

    vars_: dict[str, str] = {
        "id": short_id,
        "title": _safe_get(payload, "title", "untitled"),
        "summary": summary,
        "reason": reason,
        "error": _safe_get(payload, "error", reason or "unknown error"),
        "from_state": _safe_get(payload, "from_state", _safe_get(payload, "old_state", "unknown")),
        "to_state": _safe_get(payload, "to_state", _safe_get(payload, "new_state", "unknown")),
        "actor": _safe_get(payload, "actor", "system"),
    }

    # Substitute template variables
    text = template
    for key, val in vars_.items():
        text = text.replace("{" + key + "}", val)

    # Clean up unmatched template vars
    text = re.sub(r"\{[^}]+\}", "", text).strip()

    return Utterance(
        text=text,
        source_event_id=payload.get("event_id"),
        source_event_type=event_type,
        utterance_type=UtteranceType.STATE_TRANSITION,
        priority=priority,
        persona=persona,
    )


def project_health_check(
    pending_plans: int,
    active_builders: int,
    blocked_plans: int,
) -> Utterance:
    """Generate a periodic pipeline health utterance."""
    if blocked_plans > 0:
        text = (
            f"Pipeline alert: {pending_plans} pending, "
            f"{active_builders} active, {blocked_plans} blocked"
        )
        priority = 8
        persona = Persona.OPS
        utype = UtteranceType.ANOMALY
    else:
        text = (
            f"Pipeline healthy: {pending_plans} pending, "
            f"{active_builders} active, no blockers"
        )
        priority = 2
        persona = Persona.MONITOR
        utype = UtteranceType.HEALTH_CHECK

    return Utterance(
        text=text,
        source_event_id=None,
        utterance_type=utype,
        priority=priority,
        persona=persona,
    )


def project_static_text(
    text: str,
    *,
    utterance_type: str = UtteranceType.SUMMARY,
    priority: int = 5,
    persona: str = Persona.REVIEW,
    source_id: str | None = None,
) -> Utterance:
    """Project arbitrary text (from nexus-assembly) into an utterance.

    Used when a user requests playback of a transcript, harvest,
    candidate, or post through the REST API.
    """
    return Utterance(
        text=text,
        source_event_id=source_id,
        utterance_type=utterance_type,
        priority=priority,
        persona=persona,
    )
