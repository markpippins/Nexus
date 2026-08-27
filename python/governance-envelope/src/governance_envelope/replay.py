"""Replay semantics for governance admission envelopes (W1.09).

PURE evaluation layer: everything here operates on plain dicts loaded from
static fixture files. There is deliberately:

* NO database access (no psql/psycopg/docker/subprocess),
* NO network access,
* NO wall-clock reads — time enters only through captured timestamps
  (``evaluation.evaluated_at``, ``law.effective_at``).

This structural purity is itself an acceptance criterion (W1.09 AC5): SOL
assessment cannot mutate PEB or Conduit state because the replay evaluator
is incapable of performing I/O at all. ``run_replay_conformance.py`` asserts
the import-surface invariant mechanically.

Semantics follow nexus/docs/governance-envelope-projection-joins.md §5
(W1.08 design): resolve law references AS OF captured timestamps under
supersession-by-insertion, recompute the evaluation fingerprint (W1.11
canonicalizer), and compare.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

from .canonical import canonical_json, canonicalize, evaluate_fingerprint  # noqa: F401

# ---------------------------------------------------------------------------
# drift taxonomy (W1.09 AC6)
# ---------------------------------------------------------------------------

DRIFT_CONTRACT = "contract"
DRIFT_DOCTRINE = "doctrine"
DRIFT_INPUT = "input"
DRIFT_EVALUATOR = "evaluator"
DRIFT_RECEIPT_LINEAGE = "receipt_lineage"
DRIFT_FRAME = "frame"

# mutation point -> drift category for the AC3 matrix
MUTATION_CATEGORY = {
    "contract.contract_digest": DRIFT_CONTRACT,
    "law.proposition_ids": DRIFT_DOCTRINE,
    "law.posture_ids": DRIFT_DOCTRINE,
    "law.frame_values": DRIFT_FRAME,
    "inputs.input_snapshot_id": DRIFT_INPUT,
    "inputs.input_fingerprint": DRIFT_INPUT,
    "evaluation.evaluated_at": DRIFT_EVALUATOR,
    "evaluation.disposition": DRIFT_EVALUATOR,
    "evaluation.assertion_results": DRIFT_EVALUATOR,
    "authority.peb_transaction_id": DRIFT_RECEIPT_LINEAGE,
    "authority.admission_receipt_id": DRIFT_RECEIPT_LINEAGE,
}


class ReplayError(ValueError):
    """Raised when a fixture cannot be replayed (fail closed)."""


# ---------------------------------------------------------------------------
# law-snapshot resolution (supersession-by-insertion, valid-time selection)
# ---------------------------------------------------------------------------

def _registry_rows(registry: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return list(registry.get(kind, []))


def resolve_law_as_of(registry: dict[str, Any], kind: str, as_of: str | None):
    """Return the row versions in force at ``as_of``.

    Valid-time rule (W1.08 §5): for each entity key, take the max
    ``effective_from <= as_of`` row; skip rows already superseded strictly
    BEFORE ``as_of``. Pure dict/list logic — no clock anywhere.
    """
    rows = [r for r in _registry_rows(registry, kind)]
    entities: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        entities.setdefault(r["entity_key"], []).append(r)

    out = []
    for _, versions in sorted(entities.items()):
        # Valid at `as_of`: already effective AND not superseded before it.
        valid = [
            r for r in versions
            if r["effective_from"] <= as_of
            and (r.get("superseded_at") is None or r["superseded_at"] > as_of)
        ]
        if not valid:
            continue                                     # not yet in force / retired
        # Latest winning version at that instant (tie-break on version).
        out.append(max(valid, key=lambda r: (r["effective_from"], r.get("version", 0))))
    return out


def law_snapshot_digest(registry: dict[str, Any], as_of: str) -> str:
    """Deterministic digest over the resolved law view at ``as_of``."""
    payload_parts = []
    for kind in sorted(registry.keys()):
        for row in resolve_law_as_of(registry, kind, as_of):
            payload_parts.append(json.dumps(row, sort_keys=True, separators=(",", ":")))
    blob = "|".join(payload_parts).encode("utf-8")
    return "sha256:" + hashlib.sha256(blob).hexdigest()


# ---------------------------------------------------------------------------
# envelope integrity (fingerprint round-trip)
# ---------------------------------------------------------------------------

def envelope_fingerprint_check(envelope: dict[str, Any]) -> tuple[bool, str | None]:
    """Verify the stored fingerprint matches recomputation.

    The fingerprint covers the envelope WITHOUT its own fingerprint group
    (standard practice since W1.05's wire builder).
    """
    claimed = envelope.get("fingerprint", {}).get("evaluation_fingerprint")
    if not isinstance(claimed, str):
        return False, None
    core = copy.deepcopy(envelope)
    core.pop("fingerprint", None)
    try:
        actual = evaluate_fingerprint(core)
    except ValueError:
        return False, None
    return actual == claimed, actual


def envelope_digest(envelope: dict[str, Any]) -> str:
    """Byte-stable identifier for cross-language agreement (W1.09 AC4)."""
    canonical = canonicalize(copy.deepcopy(envelope))
    return "sha256:" + hashlib.sha256(canonical_json(canonical).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# replay verdicts
# ---------------------------------------------------------------------------

def _as_of_for(envelope: dict[str, Any]) -> str:
    law = envelope.get("law", {})
    if law.get("effective_at"):
        return law["effective_at"]
    ev = envelope.get("evaluation", {})
    ts = ev.get("evaluated_at")
    if isinstance(ts, str):
        # W1.04 canonical form carries Z; make lexicographic comparison safe
        return ts.replace("Z", "")
    raise ReplayError("fixture has no resolvable as-of timestamp")


def replay_envelope(fixture: dict[str, Any]) -> dict[str, Any]:
    """Replay one fixture offline and produce a structured verdict.

    Returns {"verdict": ..., "expected_...": ..., "drift": ...} where verdict
    is one of: replay_ok, stale_doctrine, drift_confirmed, duplicate_retry.
    """
    envelope = fixture["envelope"]
    law = envelope["law"]

    ok, actual_fp = envelope_fingerprint_check(envelope)
    if not ok:
        return {"verdict": "fingerprint_mismatch",
                "claimed": envelope.get("fingerprint", {}).get("evaluation_fingerprint"),
                "actual": actual_fp}

    as_of = _as_of_for(envelope)

    # Contract identity must match its registered artifact version.
    contract = envelope["contract"]
    reg_rows = [r for r in fixture.get("contract_registry", [])
                if r.get("contract_id") == contract.get("contract_id")
                and r.get("version") == contract.get("contract_version")]
    if reg_rows:
        if reg_rows[0]["digest"] != contract["contract_digest"]:
            return {"verdict": "drift_confirmed",
                    "category": DRIFT_CONTRACT,
                    "detail": "registered artifact digest disagrees with envelope citation",
                    "recorded": reg_rows[0]["digest"],
                    "cited": contract["contract_digest"]}

    # Doctrine citations must still be resolvable in force.
    for did in law.get("doctrine_ids") or []:
        rows = [r for r in resolve_law_as_of(fixture.get("law_registry", {}), "doctrines", as_of)
                if r["entity_key"] == did]
        if not rows:
            return {"verdict": "stale_doctrine", "missing_doctrine": did,
                    "category": DRIFT_DOCTRINE}

    # Proposition validity: every cited proposition must exist in force.
    for prop in law.get("proposition_ids", []):
        rows = [r for r in resolve_law_as_of(fixture["law_registry"], "propositions", as_of)
                if r["entity_key"] == prop]
        if not rows:
            return {"verdict": "stale_doctrine", "missing_proposition": prop,
                    "category": DRIFT_DOCTRINE}

    # Posture validity.
    for pid in law.get("posture_ids") or []:
        rows = [r for r in resolve_law_as_of(fixture["law_registry"], "postures", as_of)
                if r["entity_key"] == pid]
        if not rows:
            return {"verdict": "stale_doctrine", "missing_posture": pid,
                    "category": DRIFT_DOCTRINE}

    # Deterministic redigest: same captured inputs -> same fingerprint.
    core = copy.deepcopy(envelope)
    core.pop("fingerprint", None)
    redigest = evaluate_fingerprint(core)
    expected_fp = fixture["expected"]["evaluation_fingerprint"]
    if redigest != expected_fp:
        return {"verdict": "drift_confirmed",
                "category": DRIFT_DOCTRINE,   # content changed under the citation
                "stored": expected_fp, "recomputed": redigest}

    # Duplicate retry: caller flags whether THIS attempt follows an
    # already-consumed admission of the same envelope identity (only later
    # attempts in a retry fixture carry the flag - attempt zero never does).
    retry = fixture.get("prior_admission_consumed")
    if retry:
        prior_receipt = fixture["expected"].get("receipt") or {}
        return {"verdict": "duplicate_retry",
                "category": DRIFT_RECEIPT_LINEAGE,
                "refusal_code_expected": "duplicate_reuse",
                "prior_receipt_transaction": prior_receipt.get("peb_transaction_id")}

    exp = fixture["expected"]
    return {
        "verdict": "replay_ok",
        "disposition": envelope["evaluation"]["disposition"],
        "disposition_matches": exp["disposition"] == envelope["evaluation"]["disposition"],
        "fingerprint": redigest,
        "fingerprint_stable": redigest == expected_fp,
        "receipt_expected": exp.get("receipt"),
        "purity_no_io": True,  # proven structurally; see package import scan
    }


def classify_drift(mutation_path: str) -> str:
    """Map a mutation point to its drift category (fail closed on unknowns)."""
    if mutation_path in MUTATION_CATEGORY:
        return MUTATION_CATEGORY[mutation_path]
    raise ReplayError(f"unknown mutation path for drift taxonomy: {mutation_path}")


def apply_mutation(envelope: dict[str, Any], dotted: str, value: Any) -> dict[str, Any]:
    """Apply {'a.b': v} mutation, returning a NEW deep-copied envelope."""
    mutated = copy.deepcopy(envelope)
    tgt = mutated
    keys = dotted.split(".")
    for k in keys[:-1]:
        tgt = tgt.setdefault(k, {})
    tgt[keys[-1]] = value
    return mutated


def drift_verdict(fixture: dict[str, Any], mutation_path: str, new_value: Any) -> dict[str, Any]:
    """Intentional-drift probe: recapture fingerprint after one mutation.

    A mutation produces a drift signal iff the recomputed fingerprint differs
    from the original AND the classified category matches the taxonomy.
    """
    base_env = fixture["envelope"]
    mutated = apply_mutation(base_env, mutation_path, new_value)
    core = copy.deepcopy(mutated)
    core.pop("fingerprint", None)
    new_fp = evaluate_fingerprint(core)
    original_fp = fixture["expected"]["evaluation_fingerprint"]
    drifted = new_fp != original_fp
    return {
        "mutation": mutation_path,
        "category": classify_drift(mutation_path),
        "signal_emitted": drifted,
        "original_fingerprint": original_fp,
        "mutated_fingerprint": new_fp,
        "note": ("intentional drift captured - a sane pipeline refuses the "
                 "mutation instead of silently adopting it"),
    }
