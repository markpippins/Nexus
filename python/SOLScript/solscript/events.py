"""Shared event contracts for durable Keychains handoff.

The contracts deliberately carry identities and read-set metadata rather than
source content. Source databases remain authoritative; Keychains records the
checkpoint/context projection derived from committed events.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


KEYCHAIN_EVENT_SCHEMA_VERSION = 1
READ_SET_MANIFEST_SCHEMA_VERSION = 1


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def stable_digest(value: Any) -> str:
    """Return a stable SHA-256 digest for a read-set descriptor."""
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ReadSetManifest:
    """The exact evaluator context, represented by references and digests.

    The manifest is a receipt of what was available to an evaluator. It does
    not become a second source of truth: source values remain in Resolution,
    Shrapnel, or their owning system and are addressed by ``source_refs``.
    """

    source_namespace: str
    evaluation_id: str
    evaluation_kind: str
    target_id: str
    as_of: str
    visibility_scope: str = "all"
    evaluator_id: Optional[str] = None
    permissions: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)
    source_refs: List[Dict[str, Any]] = field(default_factory=list)
    manifest_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    schema_version: int = READ_SET_MANIFEST_SCHEMA_VERSION
    recorded_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    manifest_digest: str = ""
    status: str = "pending"

    def __post_init__(self) -> None:
        if not self.manifest_digest:
            descriptor = {
                "schema_version": self.schema_version,
                "source_namespace": self.source_namespace,
                "evaluation_id": self.evaluation_id,
                "evaluation_kind": self.evaluation_kind,
                "target_id": self.target_id,
                # ``as_of`` is a capture-time fact. It is retained in the
                # manifest but excluded from the request identity so a retry
                # with the same evaluation_id can deduplicate.
                "visibility_scope": self.visibility_scope,
                "evaluator_id": self.evaluator_id,
                "permissions": self.permissions,
                "context": self.context,
                "source_refs": self.source_refs,
            }
            object.__setattr__(self, "manifest_digest", stable_digest(descriptor))

    @property
    def idempotency_key(self) -> str:
        return f"{self.source_namespace}:evaluation:{self.evaluation_kind}:{self.evaluation_id}"

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["idempotency_key"] = self.idempotency_key
        return data


@dataclass(frozen=True)
class KeychainEvent:
    """A durable source event consumed by the Keychains projection."""

    source_namespace: str
    source_event_id: str
    kind: str
    outcome: str
    aggregate_id: Optional[str] = None
    schema_version: int = KEYCHAIN_EVENT_SCHEMA_VERSION
    causation_id: Optional[str] = None
    correlation_id: Optional[str] = None
    actor: Optional[str] = None
    contract_id: Optional[str] = None
    evaluator_id: Optional[str] = None
    law_id: Optional[str] = None
    effective_at: Optional[str] = None
    recorded_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    read_set: Dict[str, Any] = field(default_factory=dict)
    payload: Dict[str, Any] = field(default_factory=dict)
    checkpoint_status: str = "pending"

    @property
    def event_id(self) -> str:
        """Globally addressable event identity within the source namespace."""
        return f"{self.source_namespace}:{self.source_event_id}"

    @property
    def idempotency_key(self) -> str:
        """Stable source-scoped key used by outbox and Keychains consumers."""
        return self.event_id

    def to_dict(self) -> Dict[str, Any]:
        """Return the wire representation expected by Keychains."""
        data = asdict(self)
        data["event_id"] = self.event_id
        data["idempotency_key"] = self.idempotency_key
        return data


def build_transition_event(
    *,
    source_event_id: str,
    entity_id: str,
    transition_id: str,
    outcome: str,
    results: Any,
    concept_id: Optional[str] = None,
    state_before: Any = None,
    state_after: Any = None,
    effective_at: Optional[str] = None,
    correlation_id: Optional[str] = None,
    actor: Optional[str] = None,
    source_namespace: str = "sol-api",
) -> KeychainEvent:
    """Build a transition event with the evaluator's compact read-set."""
    read_set = {
        "entity_id": entity_id,
        "transition_id": transition_id,
        "concept_id": concept_id,
        "guard_results": results,
        "state_before": state_before,
        "state_after": state_after,
    }
    return KeychainEvent(
        source_namespace=source_namespace,
        source_event_id=source_event_id,
        kind={
            "committed": "resolution.transition.committed",
            "refused": "resolution.transition.refused",
            "rejected": "resolution.transition.rejected",
        }.get(outcome, "resolution.transition.failed"),
        outcome=outcome,
        aggregate_id=entity_id,
        causation_id=source_event_id,
        correlation_id=correlation_id or source_event_id,
        actor=actor or "sol-api",
        effective_at=effective_at,
        read_set=read_set,
        payload={"transition_id": transition_id},
    )


def build_evaluation_event(
    *,
    source_event_id: str,
    evaluation_kind: str,
    target_id: str,
    manifest: ReadSetManifest,
    result: Dict[str, Any],
    outcome: str = "committed",
    evaluator_id: Optional[str] = None,
    actor: Optional[str] = None,
    source_namespace: str = "sol-api",
) -> KeychainEvent:
    """Build a result event that references, rather than copies, its manifest."""
    return KeychainEvent(
        source_namespace=source_namespace,
        source_event_id=source_event_id,
        kind=f"resolution.evaluation.{evaluation_kind}.completed",
        outcome=outcome,
        aggregate_id=target_id,
        causation_id=manifest.manifest_id,
        correlation_id=manifest.evaluation_id,
        actor=actor or "sol-api",
        evaluator_id=evaluator_id or "solscript",
        effective_at=manifest.as_of,
        read_set={
            "manifest_id": manifest.manifest_id,
            "manifest_digest": manifest.manifest_digest,
            "evaluation_id": manifest.evaluation_id,
            "source_namespace": manifest.source_namespace,
        },
        payload={
            "evaluation_kind": evaluation_kind,
            "target_id": target_id,
            "manifest_id": manifest.manifest_id,
            "result": result,
        },
    )
