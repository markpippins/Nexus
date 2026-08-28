"""Pure Wave-2 candidate-to-envelope admission adapter.

The adapter deliberately performs no I/O and owns no lifecycle state. It turns
an already captured candidate into the canonical governance envelope shape,
checks the envelope fingerprint, and returns an explicit allow/refuse result.
Persistence and Conduit/PEB mutation belong to their owning services.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Mapping

from .canonical import FingerprintError, evaluate_fingerprint


class AdmissionError(ValueError):
    """Raised when a candidate cannot be converted into a valid envelope."""


@dataclass(frozen=True)
class AdmissionAssessment:
    """Immutable result suitable for persistence by the caller."""

    admitted: bool
    disposition: str
    reason: str
    envelope: dict[str, Any] | None = None
    evaluation_fingerprint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "admitted": self.admitted,
            "disposition": self.disposition,
            "reason": self.reason,
            "envelope": copy.deepcopy(self.envelope),
            "evaluation_fingerprint": self.evaluation_fingerprint,
        }


_REQUIRED_CANDIDATE_FIELDS = (
    "id",
    "contract",
    "semantic",
    "workflow",
    "law",
    "execution",
    "inputs",
)


def _missing(mapping: Mapping[str, Any], fields: tuple[str, ...]) -> list[str]:
    return [field for field in fields if mapping.get(field) is None]


def envelope_from_candidate(candidate: Mapping[str, Any]) -> dict[str, Any]:
    """Build a canonical envelope from a candidate without mutating it.

    Candidates may carry operational metadata and an optional ``envelope``
    projection. The adapter accepts the projection only when it agrees with
    the candidate identity; unknown candidate fields never enter the hash.
    """
    if not isinstance(candidate, Mapping):
        raise AdmissionError("candidate must be an object")

    missing = _missing(candidate, _REQUIRED_CANDIDATE_FIELDS)
    if missing:
        raise AdmissionError("missing candidate fields: " + ", ".join(missing))

    candidate_id = candidate["id"]
    if not isinstance(candidate_id, str) or not candidate_id.strip():
        raise AdmissionError("candidate.id must be a non-empty string")

    projected = candidate.get("envelope")
    if projected is not None:
        if not isinstance(projected, Mapping):
            raise AdmissionError("candidate.envelope must be an object")
        envelope = copy.deepcopy(dict(projected))
        if envelope.get("semantic", {}).get("subject_id") not in (None, candidate_id):
            raise AdmissionError("candidate/envelope identity mismatch")
    else:
        envelope = {
            "envelope_version": candidate.get("envelope_version", 1),
            "envelope_id": candidate.get("envelope_id", candidate_id),
            "created_at": candidate.get("created_at"),
            "contract": copy.deepcopy(candidate["contract"]),
            "semantic": copy.deepcopy(candidate["semantic"]),
            "workflow": copy.deepcopy(candidate["workflow"]),
            "law": copy.deepcopy(candidate["law"]),
            "execution": copy.deepcopy(candidate["execution"]),
            "inputs": copy.deepcopy(candidate["inputs"]),
            "evaluation": copy.deepcopy(candidate.get("evaluation") or {
                "assertion_results": [],
                "disposition": "refuse",
                "unknowns": ["candidate_not_evaluated"],
                "refusal_code": "candidate_not_evaluated",
                "evaluated_at": candidate.get("evaluated_at"),
            }),
            "evidence": copy.deepcopy(candidate.get("evidence") or {
                "evidence_ids": [],
                "evidence_fingerprint": None,
            }),
        }

    semantic = envelope.setdefault("semantic", {})
    semantic.setdefault("subject_id", candidate_id)
    if semantic["subject_id"] != candidate_id:
        raise AdmissionError("candidate/envelope identity mismatch")

    required = ("created_at", "contract", "semantic", "workflow", "law",
                "execution", "inputs", "evaluation", "evidence")
    missing_envelope = _missing(envelope, required)
    if missing_envelope:
        raise AdmissionError("missing envelope fields: " + ", ".join(missing_envelope))
    return envelope


def assess_candidate(candidate: Mapping[str, Any]) -> AdmissionAssessment:
    """Assess a candidate fail-closed and return an immutable result.

    The candidate is admitted only when it has an ``allow`` evaluation, no
    unknowns, and a valid self-consistent fingerprint. Missing contract or
    doctrine references are refusals, never implicit defaults.
    """
    try:
        envelope = envelope_from_candidate(candidate)
    except AdmissionError as exc:
        return AdmissionAssessment(False, "refuse", str(exc))

    contract = envelope.get("contract") or {}
    law = envelope.get("law") or {}
    evaluation = envelope.get("evaluation") or {}
    if not contract.get("contract_id") or not contract.get("contract_version") or not contract.get("contract_digest"):
        return AdmissionAssessment(False, "refuse", "missing_contract_identity", envelope)
    if not law.get("proposition_ids") and not law.get("doctrine_ids"):
        return AdmissionAssessment(False, "refuse", "missing_doctrine_reference", envelope)

    if evaluation.get("disposition") != "allow":
        return AdmissionAssessment(
            False,
            str(evaluation.get("disposition") or "refuse"),
            str(evaluation.get("refusal_code") or "evaluation_not_allow"),
            envelope,
        )
    if evaluation.get("unknowns"):
        return AdmissionAssessment(False, "refuse", "unknown_context", envelope)

    core = copy.deepcopy(envelope)
    core.pop("fingerprint", None)
    try:
        fingerprint = evaluate_fingerprint(core)
    except FingerprintError as exc:
        return AdmissionAssessment(False, "refuse", f"invalid_envelope: {exc}", envelope)

    claimed = (envelope.get("fingerprint") or {}).get("evaluation_fingerprint")
    if claimed is not None and claimed != fingerprint:
        return AdmissionAssessment(False, "refuse", "fingerprint_mismatch", envelope, fingerprint)

    envelope["fingerprint"] = {
        "evaluation_fingerprint": fingerprint,
        "fingerprint_algorithm": "sha256",
        "fingerprint_version": 1,
    }
    return AdmissionAssessment(True, "allow", "admitted", envelope, fingerprint)


__all__ = ["AdmissionAssessment", "AdmissionError", "assess_candidate", "envelope_from_candidate"]
