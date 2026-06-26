"""envelope_adapter.py — wraps cascade's flat event dicts into CanonicalEnvelope.

Phase 1.5: The file writes stay flat (cascade's native format).
Only the NATS path gets wrapped in a canonical envelope.

This adapter is called from nats_publisher.py's ``try_enqueue_event()``
and from dispatcher.py / architect_agent.py when they enqueue events.

Design:
  - correlation_id = the idea_id from the event payload (if present)
    or the event's own id (for root events like IdeaCaptured).
  - causation_id = the immediate parent event (if known).
    For WorkflowPlanned: the IdeaCaptured event_id.
    For StepRequested: the WorkflowPlanned event_id.
    For step completions: the StepRequested event_id.
  - source_event_ids = accumulates as the workflow progresses.
    Root events start with just their own id.
    Subsequent events add their causation_id to the chain.
  - execution_id = None for now (Phase 4 will track retries).
"""

from __future__ import annotations

import sys
import os
from typing import Any

# Make the shared nats package importable from cascade
_NATS_PACKAGE = os.path.join(os.path.dirname(__file__), "..", "nats")
if os.path.isdir(_NATS_PACKAGE):
    _parent = os.path.dirname(_NATS_PACKAGE)
    if _parent not in sys.path:
        sys.path.insert(0, _parent)

from nats_envelope.envelope import CanonicalEnvelope, Classification
from nats_publisher import event_type_to_subject


def cascade_to_envelope(
    event_dict: dict[str, Any],
    *,
    causation_id: str | None = None,
    source_event_ids: list[str] | None = None,
    correlation_id: str | None = None,
    policy_version: str | None = None,
) -> CanonicalEnvelope:
    """Wrap a cascade flat event dict into a CanonicalEnvelope.

    Args:
        event_dict: Cascade's native event format with keys
            ``id``, ``type``, ``timestamp``, ``source``, ``payload``.
        causation_id: The immediate parent event_id (if known).
            For WorkflowPlanned, this is the IdeaCaptured event_id.
        source_event_ids: All contributing upstream event_ids.
            Should include causation_id if present.
        correlation_id: Override for the workflow correlation id.
            Defaults to ``payload.idea_id`` or the event's own id.
        policy_version: LOSM/PGE governance version active when this
            event was emitted (e.g. "v27"). None if not yet tracked.

    Returns:
        A CanonicalEnvelope ready for NATS publish.
    """
    event_type = event_dict.get("type", "unknown")
    event_id = event_dict.get("id", "")

    # ── Resolve correlation_id ──
    if correlation_id is None:
        payload = event_dict.get("payload", {})
        correlation_id = payload.get("idea_id", event_id)

    # ── Build source_event_ids chain ──
    ids: list[str] = list(source_event_ids) if source_event_ids else []
    if causation_id and causation_id not in ids:
        ids.append(causation_id)
    if event_id and event_id not in ids:
        ids.append(event_id)

    # ── Resolve execution_id ──
    # Not tracked yet — Phase 4 (distributed workers) will add this.
    execution_id = event_dict.get("_meta", {}).get("execution_id")

    # ── Determine classification ──
    # KernelPanic and StepRejected are RESTRICTED; everything else is INTERNAL.
    if event_type in ("KernelPanic", "StepRejected"):
        classification = Classification.RESTRICTED
    else:
        classification = Classification.INTERNAL

    return CanonicalEnvelope(
        event_id=event_id,
        event_type=event_type,
        occurred_at=event_dict.get("timestamp", ""),
        origin_component="cascade",
        correlation_id=correlation_id,
        causation_id=causation_id,
        source_event_ids=ids,
        execution_id=execution_id,
        classification=classification,
        policy_version=policy_version,
        subject=event_type_to_subject(event_type),
        payload=event_dict,
    )
