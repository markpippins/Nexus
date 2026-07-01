"""Structural event validation — type-agnostic.

Cascade is a pure event bus. It validates that events are structurally
well-formed (have required envelope fields) but does NOT enforce a
closed set of known event types. The bus transports events; it doesn't
gate them by type.
"""

# Base structural fields every event must have
REQUIRED_FIELDS = ["id", "type", "timestamp", "source", "payload"]


def validate_event(evt: dict) -> tuple[bool, str | None]:
    """Validate that an event is structurally well-formed.

    Checks:
      - Must be a dict
      - Must have a ``type`` field
      - Must have all structural envelope fields
      - ``payload`` must be a dict

    Does NOT enforce a closed set of event types. Cascade is a pure
    signal producer — any well-formed event passes validation.

    Returns (is_valid, error_message).
    """
    if not isinstance(evt, dict):
        return False, "Event is not a dictionary"

    evt_type = evt.get("type")
    if not evt_type:
        return False, "Event missing 'type' field"

    # Check structural envelope fields
    for field in REQUIRED_FIELDS:
        if field not in evt:
            return False, f"Event '{evt_type}' missing required field: '{field}'"

    # Payload must be a dict
    payload = evt.get("payload", {})
    if not isinstance(payload, dict):
        return False, f"Event '{evt_type}' payload is not a dictionary"

    return True, None
