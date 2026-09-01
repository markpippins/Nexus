"""Versioned binding PEB decision contract (P-series).

This module is deliberately pure: it validates a PEB result but does not
change resolution, Conduit, plans, promotion state, or any other lifecycle
authority. A validated result is still only an advisory input until the
resolution-owned transition explicitly consumes it.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Mapping


BINDING_CONTRACT_VERSION = 1
BINDING_DECISION_CLASS = "deny_contract_promotion"
BINDING_AUTHORITY_LEVEL = "advisory"

NEGATIVE_DISPOSITIONS = frozenset({
    "refused", "unknown", "stale", "drift", "quarantined", "superseded", "rolled_back",
})
POSITIVE_DISPOSITIONS = frozenset({"allow"})
ALL_DISPOSITIONS = POSITIVE_DISPOSITIONS | NEGATIVE_DISPOSITIONS


class BindingValidationError(ValueError):
    """A binding result is not safe to pass to a resolution boundary."""


@dataclass(frozen=True)
class BindingDecision:
    """Immutable validated decision value; no lifecycle side effects."""

    contract_version: int
    decision_class: str
    contract_id: str
    contract_version_id: str
    proposition_id: str
    doctrine_ids: tuple[str, ...]
    evaluator_id: str
    evaluator_version: str
    evidence_ids: tuple[str, ...]
    subject_id: str
    work_item_id: str
    as_of: str
    disposition: str
    authority_level: str
    evaluation_fingerprint: str
    decision_id: str
    evidence_fresh: bool
    replay_context: str
    lineage_fingerprint: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "binding_contract_version": self.contract_version,
            "decision_class": self.decision_class,
            "contract": {"id": self.contract_id, "version": self.contract_version_id},
            "proposition_id": self.proposition_id,
            "doctrine_ids": list(self.doctrine_ids),
            "evaluator": {"id": self.evaluator_id, "version": self.evaluator_version},
            "evidence_ids": list(self.evidence_ids),
            "subject_id": self.subject_id,
            "work_item_id": self.work_item_id,
            "as_of": self.as_of,
            "disposition": self.disposition,
            "authority_level": self.authority_level,
            "evaluation_fingerprint": self.evaluation_fingerprint,
            "decision_id": self.decision_id,
            "evidence_fresh": self.evidence_fresh,
            "replay_context": self.replay_context,
            "lineage_fingerprint": self.lineage_fingerprint,
        }


def _required(data: Mapping[str, Any], keys: tuple[str, ...]) -> None:
    missing = [key for key in keys if data.get(key) in (None, "")]
    if missing:
        raise BindingValidationError("missing binding fields: " + ", ".join(missing))


def _string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BindingValidationError(f"{field} must be a non-empty string")
    return value.strip()


def _strings(value: Any, field: str, *, allow_empty: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list) or (not allow_empty and not value):
        raise BindingValidationError(f"{field} must be a non-empty array")
    result = tuple(_string(item, f"{field}[]") for item in value)
    if len(set(result)) != len(result):
        raise BindingValidationError(f"{field} must not contain duplicates")
    return result


def _fingerprint(value: Any, field: str) -> str:
    result = _string(value, field)
    if len(result) != 71 or not result.startswith("sha256:"):
        raise BindingValidationError(f"{field} must be sha256:<64 hex chars>")
    try:
        int(result[7:], 16)
    except ValueError as exc:
        raise BindingValidationError(f"{field} must be sha256:<64 hex chars>") from exc
    return result


def _lineage_fingerprint(data: Mapping[str, Any]) -> str:
    lineage = {
        key: data[key]
        for key in (
            "binding_contract_version", "decision_class", "contract",
            "proposition_id", "doctrine_ids", "evaluator", "evidence_ids",
            "subject_id", "work_item_id", "as_of", "disposition",
            "authority_level", "evaluation_fingerprint", "decision_id",
            "evidence_fresh", "replay_context",
        )
    }
    payload = json.dumps(lineage, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(payload.encode()).hexdigest()


def validate_binding_decision(raw: Mapping[str, Any], *, expected_subject_id: str | None = None,
                              expected_work_item_id: str | None = None,
                              expected_replay_context: str | None = None) -> BindingDecision:
    """Validate a PEB decision and return an immutable value.

    Every identity and authority-relevant context is mandatory. Missing or
    mismatched values raise rather than being defaulted. ``advisory`` is the
    only accepted authority level; this function can never activate blocking
    behavior.
    """
    if not isinstance(raw, Mapping):
        raise BindingValidationError("binding decision must be an object")
    _required(raw, (
        "binding_contract_version", "decision_class", "contract", "proposition_id",
        "doctrine_ids", "evaluator", "evidence_ids", "subject_id", "work_item_id",
        "as_of", "disposition", "authority_level", "evaluation_fingerprint",
        "decision_id", "evidence_fresh", "replay_context",
    ))
    if raw["binding_contract_version"] != BINDING_CONTRACT_VERSION:
        raise BindingValidationError("unsupported binding contract version")
    if raw["decision_class"] != BINDING_DECISION_CLASS:
        raise BindingValidationError("unauthorized decision class")
    if raw["authority_level"] != BINDING_AUTHORITY_LEVEL:
        raise BindingValidationError("binding decisions must remain advisory")
    if raw["disposition"] not in ALL_DISPOSITIONS:
        raise BindingValidationError("unknown disposition")
    if not isinstance(raw["evidence_fresh"], bool) or not raw["evidence_fresh"]:
        raise BindingValidationError("evidence is not fresh")
    subject_id = _string(raw["subject_id"], "subject_id")
    work_item_id = _string(raw["work_item_id"], "work_item_id")
    if expected_subject_id is not None and subject_id != expected_subject_id:
        raise BindingValidationError("subject binding mismatch")
    if expected_work_item_id is not None and work_item_id != expected_work_item_id:
        raise BindingValidationError("work-item binding mismatch")
    replay_context = _string(raw["replay_context"], "replay_context")
    if expected_replay_context is not None and replay_context != expected_replay_context:
        raise BindingValidationError("replay context mismatch")
    contract = raw["contract"]
    evaluator = raw["evaluator"]
    if not isinstance(contract, Mapping):
        raise BindingValidationError("contract must be an object")
    if not isinstance(evaluator, Mapping):
        raise BindingValidationError("evaluator must be an object")
    _required(contract, ("id", "version"))
    _required(evaluator, ("id", "version"))
    doctrine_ids = _strings(raw["doctrine_ids"], "doctrine_ids", allow_empty=True)
    evidence_ids = _strings(raw["evidence_ids"], "evidence_ids")
    as_of = _string(raw["as_of"], "as_of")
    if "T" not in as_of or not (as_of.endswith("Z") or "+" in as_of):
        raise BindingValidationError("as_of must carry an explicit timezone")
    decision_id = _string(raw["decision_id"], "decision_id")
    evaluation_fingerprint = _fingerprint(raw["evaluation_fingerprint"], "evaluation_fingerprint")
    expected_lineage = _lineage_fingerprint(raw)
    supplied_lineage = raw.get("lineage_fingerprint")
    if supplied_lineage is not None and supplied_lineage != expected_lineage:
        raise BindingValidationError("lineage fingerprint mismatch")
    return BindingDecision(
        contract_version=BINDING_CONTRACT_VERSION,
        decision_class=BINDING_DECISION_CLASS,
        contract_id=_string(contract["id"], "contract.id"),
        contract_version_id=_string(contract["version"], "contract.version"),
        proposition_id=_string(raw["proposition_id"], "proposition_id"),
        doctrine_ids=doctrine_ids,
        evaluator_id=_string(evaluator["id"], "evaluator.id"),
        evaluator_version=_string(evaluator["version"], "evaluator.version"),
        evidence_ids=evidence_ids,
        subject_id=subject_id,
        work_item_id=work_item_id,
        as_of=as_of,
        disposition=_string(raw["disposition"], "disposition"),
        authority_level=BINDING_AUTHORITY_LEVEL,
        evaluation_fingerprint=evaluation_fingerprint,
        decision_id=decision_id,
        evidence_fresh=True,
        replay_context=replay_context,
        lineage_fingerprint=expected_lineage,
    )


def negative_disposition(reason: str) -> str:
    """Map a refused validation to a durable explicit negative state."""
    normalized = _string(reason, "reason").lower()
    for state in NEGATIVE_DISPOSITIONS:
        if state in normalized:
            return state
    return "refused"


def binding_idempotency_key(decision: Mapping[str, Any]) -> str:
    """Stable duplicate-delivery key derived from immutable decision identity."""
    validated = validate_binding_decision(decision)
    return f"peb:binding:{validated.decision_id}:{validated.evaluation_fingerprint}"


__all__ = [
    "ALL_DISPOSITIONS", "BINDING_AUTHORITY_LEVEL", "BINDING_CONTRACT_VERSION",
    "BINDING_DECISION_CLASS", "BindingDecision", "BindingValidationError",
    "binding_idempotency_key", "negative_disposition", "validate_binding_decision",
]
