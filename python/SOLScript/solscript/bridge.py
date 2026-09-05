"""Declarative Shrapnel -> Resolution bridge for SOLScript.

The bridge is a read-only projection contract. Resolution owns lifecycle and
identity; Shrapnel owns complex subject state. This module only joins the two
through a declared identity field and returns a normalized, typed read result.
It never writes either source and never turns missing evidence into ``False``.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple
from uuid import UUID

from .adapters.contract import SolStoragePort


BRIDGE_SCHEMA_VERSION = 1
BridgeStatus = Literal["resolved", "unknown", "stale", "unavailable", "refusal"]
BridgeSource = Literal["resolution", "shrapnel"]


@dataclass(frozen=True)
class BridgeFieldSlice:
    """One explicitly requested field in a bridge read-set."""

    name: str
    value_type: str
    source: BridgeSource = "shrapnel"
    required: bool = True


@dataclass(frozen=True)
class ShrapnelResolutionBridge:
    """Versioned, declarative identity and field-slice contract.

    ``resolution_concept_id`` is a logical contract value supplied by the
    caller's loaded Resolution model; it is not a database-specific constant.
    ``resolution_identity_field`` and ``shrapnel_identity_field`` define the
    shared identity edge (normally ``asset_id``).
    """

    bridge_id: str
    version: int
    resolution_concept_id: str
    resolution_identity_field: str = "asset_id"
    shrapnel_identity_field: str = "asset_id"
    fields: Tuple[BridgeFieldSlice, ...] = field(default_factory=tuple)
    as_of_required: bool = True
    schema_version: int = BRIDGE_SCHEMA_VERSION

    def validate(self) -> None:
        if not self.bridge_id or not self.resolution_concept_id:
            raise ValueError("bridge_id and resolution_concept_id are required")
        if self.version < 1 or self.schema_version != BRIDGE_SCHEMA_VERSION:
            raise ValueError("unsupported bridge version")
        if not self.resolution_identity_field or not self.shrapnel_identity_field:
            raise ValueError("both bridge identity fields are required")
        names = set()
        for item in self.fields:
            if item.name in names:
                raise ValueError(f"duplicate bridge field: {item.name}")
            if item.source not in ("resolution", "shrapnel"):
                raise ValueError(f"unsupported bridge source: {item.source}")
            if item.value_type not in {
                "text", "integer", "numeric", "boolean", "timestamp", "jsonb", "uuid"
            }:
                raise ValueError(f"unsupported bridge field type: {item.value_type}")
            names.add(item.name)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["fields"] = [asdict(item) for item in self.fields]
        return data


@dataclass(frozen=True)
class BridgeReadResult:
    """Normalized bridge response, including explicit negative states."""

    status: BridgeStatus
    bridge_id: str
    bridge_version: int
    asset_id: Optional[str]
    as_of: Optional[str]
    fields: Dict[str, Any] = field(default_factory=dict)
    source_refs: List[Dict[str, Any]] = field(default_factory=list)
    reason: Optional[str] = None

    @property
    def resolved(self) -> bool:
        return self.status == "resolved"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _parse_as_of(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("as_of must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _coerce_bound(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = _parse_as_of(value)
        except ValueError:
            # Callers distinguish a malformed non-null bound from an absent
            # bound by checking the original value.
            return None
        if parsed is None:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _active_at(item: Any, as_of: datetime) -> Tuple[bool, bool]:
    """Return ``(active, valid_bounds)`` without guessing malformed bounds."""
    raw_start = getattr(item, "valid_from", None)
    raw_end = getattr(item, "valid_until", None)
    start = _coerce_bound(raw_start)
    end = _coerce_bound(raw_end)
    valid_bounds = (raw_start is None or start is not None) and (raw_end is None or end is not None)
    if not valid_bounds:
        return False, False
    return (start is None or start <= as_of) and (end is None or as_of < end), True


def _subject_identity(subject: Any, field_name: str) -> Optional[str]:
    # ``canonical_asset_id`` is a normalized convenience field for the
    # conventional asset_id edge only. A declarative bridge using another
    # identity field must read the configured attribute instead.
    value = (
        getattr(subject, "canonical_asset_id", None)
        if field_name == "asset_id"
        else getattr(subject, "attributes", {}).get(field_name)
    )
    if value is None:
        value = getattr(subject, "attributes", {}).get(field_name)
    return str(value) if value is not None else None


def _fact_identity(fact: Any, field_name: str) -> Optional[str]:
    value = getattr(fact, "attributes", {}).get(field_name)
    return str(value) if value is not None else None


def _typed(value: Any, value_type: str) -> bool:
    if value_type == "jsonb":
        return True
    if value_type == "text":
        return isinstance(value, str)
    if value_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if value_type == "numeric":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if value_type == "boolean":
        return isinstance(value, bool)
    if value_type == "timestamp":
        return _coerce_bound(value) is not None
    if value_type == "uuid":
        try:
            UUID(str(value))
            return True
        except (ValueError, AttributeError, TypeError):
            return False
    return False


def _result(
    bridge: ShrapnelResolutionBridge,
    status: BridgeStatus,
    asset_id: Optional[str],
    as_of: Optional[str],
    reason: str,
    *,
    fields: Optional[Dict[str, Any]] = None,
    source_refs: Optional[List[Dict[str, Any]]] = None,
) -> BridgeReadResult:
    return BridgeReadResult(
        status=status,
        bridge_id=bridge.bridge_id,
        bridge_version=bridge.version,
        asset_id=asset_id,
        as_of=as_of,
        fields=fields or {},
        source_refs=source_refs or [],
        reason=reason,
    )


async def read_bridge(
    port: SolStoragePort,
    bridge: ShrapnelResolutionBridge,
    *,
    asset_id: str,
    as_of: Optional[str],
) -> BridgeReadResult:
    """Perform a typed, as-of-aware, read-only bridge operation.

    The result is deliberately explicit about ``unknown`` (no matching source),
    ``stale`` (matching source exists but is outside the requested time),
    ``unavailable`` (ambiguous or malformed source), and ``refusal`` (invalid
    request). These states are not collapsed into a boolean or guessed value.
    """
    try:
        bridge.validate()
    except ValueError as exc:
        return _result(bridge, "refusal", asset_id or None, as_of, str(exc))
    if not asset_id:
        return _result(bridge, "refusal", None, as_of, "asset_id is required")
    if bridge.as_of_required and not as_of:
        return _result(bridge, "refusal", asset_id, None, "as_of is required")
    try:
        as_of_dt = _parse_as_of(as_of)
    except ValueError as exc:
        return _result(bridge, "refusal", asset_id, as_of, str(exc))
    if as_of_dt is None:
        as_of_dt = datetime.now(timezone.utc)

    try:
        subjects = await port.list_subjects(bridge.resolution_concept_id)
        facts = await port.list_shrapnel_facts()
    except Exception as exc:  # source unavailability is a contract result
        return _result(bridge, "unavailable", asset_id, as_of, f"source_unavailable: {exc}")

    matching_subjects = [
        subject for subject in subjects
        if _subject_identity(subject, bridge.resolution_identity_field) == asset_id
    ]
    if not matching_subjects:
        return _result(bridge, "unknown", asset_id, as_of, "resolution_subject_not_found")
    subject_states = [_active_at(subject, as_of_dt) for subject in matching_subjects]
    if any(not valid for _, valid in subject_states):
        return _result(bridge, "unavailable", asset_id, as_of, "malformed_resolution_temporal_bounds")
    active_subjects = [subject for subject, (active, _) in zip(matching_subjects, subject_states) if active]
    if not active_subjects:
        return _result(bridge, "stale", asset_id, as_of, "resolution_subject_not_effective_at_as_of")
    if len(active_subjects) != 1:
        return _result(bridge, "unavailable", asset_id, as_of, "ambiguous_resolution_membership")

    matching_facts = [
        fact for fact in facts
        if _fact_identity(fact, bridge.shrapnel_identity_field) == asset_id
    ]
    if not matching_facts:
        return _result(bridge, "unknown", asset_id, as_of, "shrapnel_fact_not_found")
    fact_states = [_active_at(fact, as_of_dt) for fact in matching_facts]
    if any(not valid for _, valid in fact_states):
        return _result(bridge, "unavailable", asset_id, as_of, "malformed_shrapnel_temporal_bounds")
    active_facts = [fact for fact, (active, _) in zip(matching_facts, fact_states) if active]
    if not active_facts:
        return _result(bridge, "stale", asset_id, as_of, "shrapnel_fact_not_effective_at_as_of")
    if len(active_facts) != 1:
        return _result(bridge, "unavailable", asset_id, as_of, "ambiguous_shrapnel_membership")

    subject = active_subjects[0]
    fact = active_facts[0]
    sources = {
        "resolution": subject,
        "shrapnel": fact,
    }
    values: Dict[str, Any] = {}
    refs: List[Dict[str, Any]] = [
        {"source": "resolution", "subject_id": str(subject.id), "as_of": as_of},
        {"source": "shrapnel", "object_id": str(fact.object_id), "as_of": as_of},
    ]
    for item in bridge.fields:
        source = sources[item.source]
        attributes = getattr(source, "attributes", {})
        if item.source == "resolution" and item.name == bridge.resolution_identity_field:
            value = _subject_identity(source, item.name)
        else:
            value = attributes.get(item.name)
        if value is None:
            if item.required:
                return _result(bridge, "unavailable", asset_id, as_of, f"required_field_missing: {item.source}.{item.name}", source_refs=refs)
            continue
        if not _typed(value, item.value_type):
            return _result(bridge, "unavailable", asset_id, as_of, f"field_type_mismatch: {item.source}.{item.name}", source_refs=refs)
        values[item.name] = value

    return _result(
        bridge,
        "resolved",
        asset_id,
        as_of,
        "bridge_read_resolved",
        fields=values,
        source_refs=refs,
    )
