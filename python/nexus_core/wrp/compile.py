"""
compile.py — single compile-time CCNF/CER emission entry point (T21).

Compiles a Specification (intent + constraints) + Implementation Plan (goal,
files_affected, acceptance_criteria) into a validated WorkRequest, then into a
CCNF Canonical Event Record (CER) with a deterministic ``entity_key``.

This module is the **single compiler** for ``nexus_core/wrp``. Conduit's
compile path (``python/conduit/ccnf_bridge.py``) becomes a *caller* of this
entry point, never a second emitter. Any quarantined/legacy emitter that still
emits must call this module.

Design invariants (T21):

- **Fail-closed.** A compile error raises :class:`CompileError` — there is no
  partial WorkRequest or partial CER. Fail-closed cases:
    - unknown/newer CCNF version (``CCNF_VERSION_MISMATCH``)
    - missing entity-key inputs (``MISSING_SPEC_FIELD`` / ``MISSING_PLAN_FIELD``)
    - missing spec/plan fields (``MISSING_SPEC_FIELD`` / ``MISSING_PLAN_FIELD``)
    - invalid intent (``INTENT_NORMALIZATION_FAILURE``)
    - invalid artifact reference (``ARTIFACT_RESOLUTION_FAILURE``)
    - hash mismatch / non-canonical serialization (``HASH_MISMATCH``)
- **Deterministic.** Same input + same CCNF version => identical CER +
  ``entity_key``. The ``entity_key`` is *always* deterministic (it hashes only
  ``{domain, intent, actor, scope}``). The full CER is deterministic whenever
  the timestamp is pinned (pass ``timestamp=`` or a ``created_at`` on the
  plan) — exactly like the Go reference, which only substitutes wall-clock time
  when the input omits a timestamp.
- **Single identity derivation.** ``entity_key`` is derived exactly once (via
  ``identity.derive_identity``) and carried in the CER. The envelope wrapper
  (:func:`build_envelope`) does **not** re-derive it.

The CCNF pipeline below is a pure-Python, byte-identical mirror of the Go
reference (``go/wrp/ccnf-ref/ccnf`` — ``ccnf.Run``): structural parse →
canonicalize → normalize intent → check target → resolve artifacts → derive
identity → compute deltas → assemble CER → sign. Cross-language parity is
guarded by ``test_conformance_ccnf_compile.py`` (golden vectors).

Reuses ``identity.py`` (``canonical_json``, ``normalize_intent``,
``derive_identity``) so the entity-key bytes match the Go reference exactly.

Usage::

    from nexus_core.wrp.compile import compile_work_request, CompileError

    result = compile_work_request(
        specification={"intent": {"action": "execute", "target_type": "plan",
                                  "target_id": "plan:42"},
                       "constraints": ["no schema changes"]},
        implementation_plan={"id": "wr-42", "goal": "Add a widget",
                             "files_affected": ["src/widget.py"],
                             "acceptance_criteria": ["tests pass"]},
        timestamp=1720000000,
    )
    print(result.entity_key, result.canonical_hash)
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from nexus_core.wrp.identity import (
    canonical_json,
    derive_identity,
    normalize_intent,
)

__all__ = [
    "CCNF_VERSION",
    "EVENT_VERSION",
    "SYSTEM_NAME",
    "CompileError",
    "CCNFVersionMismatch",
    "StructuralParseFailure",
    "IntentNormalizationFailure",
    "ArtifactResolutionFailure",
    "DeltaScopeViolation",
    "MissingSpecField",
    "MissingPlanField",
    "HashMismatch",
    "CompileResult",
    "compile_ccnf_input",
    "compile_work_request",
    "build_envelope",
    "validate_delta_scope",
    "read_ccnf_version_manifest",
    "manifest_matches_constant",
    "locked_ccnf_version",
]


# ── Version constants ────────────────────────────────────────────────
# Mirrors go/wrp/ccnf-ref/ccnf/types.go: CurrentCCNFVersion, CurrentEventVersion,
# SystemName. CCNF_VERSION is the embedded constant fallback; the canonical
# record is the CCNF_VERSION manifest file (T21 item 4 / T07 item 4). CI
# verifies manifest == constant via manifest_matches_constant().
CCNF_VERSION = 1
EVENT_VERSION = 1
SYSTEM_NAME = "nexus"

# Closed controlled vocabulary (Go ccnf/intents.go controlledVocab, mirrored by
# identity.py normalize_intent).
_CONTROLLED_VOCAB = frozenset({
    "create", "update", "delete", "execute", "validate", "emit",
})

# CCNF_VERSION manifest — canonical record of the locked protocol version.
# Lives next to this module. The embedded constant is only a fallback when the
# manifest is unreadable; compile_work_request() fails closed if the two
# disagree.
_MANIFEST_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "CCNF_VERSION"
)


# ── Errors ───────────────────────────────────────────────────────────
# Error codes mirror the Go CCNFError constants (types.go) plus compile-level
# fail-closed cases unique to the entry point. A code string (not just a class)
# lets callers match the Go error contract exactly.

class CompileError(Exception):
    """Base class for all compile/CCNF failures.

    ``code`` carries a stable machine-readable error code (mirrors the Go
    ``CCNFError`` constants). All failures are fail-closed: a raised
    :class:`CompileError` means no WorkRequest / CER was produced.
    """

    code = "COMPILE_ERROR"

    def __init__(self, message: str = "") -> None:
        self.message = message
        super().__init__(f"{self.code}: {message}" if message else self.code)


class CCNFVersionMismatch(CompileError):
    """Version gate failure: unknown/newer CCNF version, or embedded-version
    mismatch, or manifest != embedded constant."""

    code = "CCNF_VERSION_MISMATCH"


class StructuralParseFailure(CompileError):
    """Input is not a valid CCNF document (wrong root type, missing required
    field)."""

    code = "STRUCTURAL_PARSE_FAILURE"


class IntentNormalizationFailure(CompileError):
    """Free-text intent, empty action, or action outside the controlled
    vocabulary."""

    code = "INTENT_NORMALIZATION_FAILURE"


class ArtifactResolutionFailure(CompileError):
    """Invalid artifact ID syntax or non-object artifact value."""

    code = "ARTIFACT_RESOLUTION_FAILURE"


class DeltaScopeViolation(CompileError):
    """Artifact prefix outside the intent target scope (documented; the Go
    ``process`` path does not enforce this — kept for parity)."""

    code = "DELTA_SCOPE_VIOLATION"


class MissingSpecField(CompileError):
    """A required Specification field is absent (missing entity-key input)."""

    code = "MISSING_SPEC_FIELD"


class MissingPlanField(CompileError):
    """A required Implementation Plan field is absent."""

    code = "MISSING_PLAN_FIELD"


class HashMismatch(CompileError):
    """The committed ``signature.hash`` does not equal the canonical hash of
    the CER (hash mismatch or non-canonical serialization)."""

    code = "HASH_MISMATCH"


# ── Version manifest (T21 item 4) ────────────────────────────────────

def read_ccnf_version_manifest(path: str = _MANIFEST_PATH) -> int:
    """Read the locked CCNF version from the manifest; fall back to the
    embedded constant when the manifest is missing or unreadable.

    The manifest is a text file whose first non-comment, non-empty line is the
    integer version. The embedded constant (:data:`CCNF_VERSION`) is the
    fallback for environments where the manifest is not deployed alongside the
    module.
    """
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                return int(line)
    except (OSError, ValueError):
        pass
    return CCNF_VERSION


def manifest_matches_constant(path: str = _MANIFEST_PATH) -> bool:
    """True iff the on-disk manifest agrees with the embedded constant.

    CI verifies this stays True so the locked version can never silently drift
    from the constant the code actually enforces.
    """
    return read_ccnf_version_manifest(path) == CCNF_VERSION


def locked_ccnf_version(path: str = _MANIFEST_PATH) -> int:
    """Return the locked CCNF version, failing closed if the manifest
    disagrees with the embedded constant.
    """
    v = read_ccnf_version_manifest(path)
    if v != CCNF_VERSION:
        raise CCNFVersionMismatch(
            f"manifest CCNF_VERSION {v} != embedded constant {CCNF_VERSION}"
        )
    return v


# ── Canonicalization (mirrors ccnf/canonicalize.go + normalize.go) ────

def _normalize_string(s: str) -> str:
    """Mirror Go ``normalizeString``: strip zero-width chars (U+200B..U+200D)
    and BOM (U+FEFF), then NFC-normalize (UAX #15)."""
    out: List[str] = []
    for ch in s:
        o = ord(ch)
        if 0x200B <= o <= 0x200D or o == 0xFEFF:
            continue
        out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def _normalize_strings(v: Any) -> Any:
    """Recursive mirror of Go ``normalizeStrings`` (normalizes keys + values)."""
    if isinstance(v, str):
        return _normalize_string(v)
    if isinstance(v, dict):
        return {_normalize_string(k): _normalize_strings(vv) for k, vv in v.items()}
    if isinstance(v, list):
        return [_normalize_strings(x) for x in v]
    return v


# Go time.RFC3339 layout ("2006-01-02T15:04:05Z07:00") is strict: it rejects
# fractional seconds and requires a timezone. Mirror that exactly so a
# fractional-second timestamp is left untouched (-> 0 -> wall-clock), matching
# Go's convertTimestamps/parseTimestamp.
_RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$"
)


def _parse_rfc3339(s: str) -> Optional[int]:
    """Parse a strict RFC-3339 timestamp to epoch seconds; None if unparseable.

    Mirrors Go ``time.Parse(time.RFC3339, s)``: accepts ``Z`` or a numeric
    offset, rejects fractional seconds and naive datetimes (matching Go, which
    leaves such strings untouched at the canonicalize step).
    """
    if not _RFC3339_RE.match(s):
        return None
    try:
        cleaned = s[:-1] + "+00:00" if s.endswith("Z") else s
        dt = datetime.fromisoformat(cleaned)
        return int(dt.timestamp())
    except (ValueError, TypeError):
        return None


def _convert_timestamps(m: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror Go ``convertTimestamps``: RFC-3339 ``timestamp`` strings -> epoch
    seconds; float64 ``timestamp`` -> int64 (truncated); recurse into maps and
    arrays."""
    for k, v in m.items():
        if k == "timestamp":
            if isinstance(v, str):
                ts = _parse_rfc3339(v)
                if ts is not None:
                    m[k] = ts
            elif isinstance(v, float):
                m[k] = int(v)
        elif isinstance(v, dict):
            _convert_timestamps(v)
        elif isinstance(v, list):
            for elem in v:
                if isinstance(elem, dict):
                    _convert_timestamps(elem)
    return m


def _normalize_number(f: float) -> Any:
    """Mirror Go ``normalizeNumber``: integral floats -> int."""
    if f == float(int(f)):
        return int(f)
    return f


def _normalize_absent_fields(m: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror Go ``normalizeAbsentFields``: integral floats -> int (recursive);
    empty ``collapse_key`` string -> null. Null values are preserved as null."""
    for k, v in list(m.items()):
        if v is None:
            continue
        if isinstance(v, bool):
            continue
        if isinstance(v, float):
            m[k] = _normalize_number(v)
        elif isinstance(v, str):
            if v == "" and k == "collapse_key":
                m[k] = None
        elif isinstance(v, dict):
            _normalize_absent_fields(v)
        elif isinstance(v, list):
            for elem in v:
                if isinstance(elem, dict):
                    _normalize_absent_fields(elem)
    return m


def _parse_timestamp(v: Any) -> int:
    """Mirror Go ``parseTimestamp``: float/int -> int64; RFC-3339 string ->
    epoch; unparseable -> 0 (caller substitutes wall-clock, like Go Run)."""
    if isinstance(v, bool):
        return 0
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        ts = _parse_rfc3339(v)
        if ts is not None:
            return ts
        return 0
    return 0


# ── Pipeline steps (mirror ccnf/*.go) ────────────────────────────────

def _normalize_intent(intent: Any) -> Dict[str, Any]:
    """Mirror Go ``NormalizeIntent`` via identity.py ``normalize_intent``.

    Raises :class:`IntentNormalizationFailure` (with the Go error text) for
    free-text intents, empty actions, and actions outside the controlled
    vocabulary.

    Go's ``NormalizeIntent`` reads ``target_type`` / ``target_id`` through
    ``getString`` (non-string -> ""), while identity.py's ``normalize_intent``
    returns them as-is. Coerce here so malformed inputs stay byte-identical to
    the Go reference.
    """
    try:
        norm = normalize_intent(intent)
    except ValueError as e:
        raise IntentNormalizationFailure(str(e)) from e
    norm["target_type"] = (
        norm["target_type"] if isinstance(norm["target_type"], str) else ""
    )
    norm["target_id"] = (
        norm["target_id"] if isinstance(norm["target_id"], str) else ""
    )
    return norm


def _is_valid_artifact_id(artifact_id: str) -> bool:
    """Mirror Go ``isValidArtifactID``: ``type:id`` or ``type:subtype:id`` with
    no empty segment."""
    if not isinstance(artifact_id, str):
        return False
    parts = artifact_id.split(":", 2)
    if len(parts) < 2:
        return False
    return all(p != "" for p in parts)


def _check_target_id(m: Dict[str, Any]) -> None:
    """Mirror Go ``checkTargetID``: a non-empty intent.target_id must be a valid
    ``type:id`` reference."""
    intent = m.get("intent")
    if not isinstance(intent, dict):
        return
    target_id = intent.get("target_id")
    if not isinstance(target_id, str) or target_id == "":
        return
    if not _is_valid_artifact_id(target_id):
        raise ArtifactResolutionFailure(
            f"target_id {target_id!r} is not a valid type:id reference"
        )


def _resolve_artifacts(m: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Mirror Go ``ResolveArtifacts``: extract ``payload.data`` keys that are
    valid artifact IDs into ``(refs, artifacts)``.

    NOTE: Go iterates a Go map (randomized order), which is non-deterministic
    for multi-artifact inputs. The compile entry point MUST be deterministic
    (T21), so artifact keys are sorted lexicographically here. ``entity_key``
    is unaffected (I3 excludes artifacts); only the canonical hash order is
    stabilized relative to the Go reference.
    """
    payload = m.get("payload")
    if not isinstance(payload, dict):
        return [], []
    data = payload.get("data")
    if not isinstance(data, dict) or not data:
        return [], []

    refs: List[str] = []
    artifacts: List[Dict[str, Any]] = []
    for k in sorted(data.keys()):
        if not _is_valid_artifact_id(k):
            raise ArtifactResolutionFailure(f"invalid artifact id {k!r}")
        refs.append(k)
        patch = data[k]
        if not isinstance(patch, dict):
            raise ArtifactResolutionFailure(
                f"artifact {k!r} value must be an object"
            )
        artifacts.append({"artifact_id": k, "patch": patch})
    return refs, artifacts


def _compute_state_deltas(
    m: Dict[str, Any],
    refs: List[str],
    artifacts: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Mirror Go ``ComputeStateDeltas``: per-artifact delta with null
    before_hash and ``SHA256(canonical_json(patch))`` after_hash."""
    deltas: List[Dict[str, Any]] = []
    for i, ref in enumerate(refs):
        if i < len(artifacts):
            patch = artifacts[i]["patch"]
            after_hash = hashlib.sha256(
                canonical_json(patch).encode("utf-8")
            ).hexdigest()
            deltas.append({
                "artifact_id": ref,
                "before_hash": None,  # Go computeBeforeHash -> nil
                "after_hash": after_hash,
                "patch": patch,
            })
    return deltas


def _derive_collapse_key(m: Dict[str, Any]) -> Optional[str]:
    """Mirror Go ``DeriveCollapseKey``: ``target_type:target_id`` when both are
    non-empty, else None."""
    intent = m.get("intent")
    if not isinstance(intent, dict):
        return None
    target_type = intent.get("target_type")
    target_id = intent.get("target_id")
    if not isinstance(target_type, str) or not isinstance(target_id, str):
        return None
    if target_type == "" or target_id == "":
        return None
    return f"{target_type}:{target_id}"


def _extract_artifact_prefix(artifact_id: str) -> str:
    """Mirror Go ``extractArtifactPrefix``: text before the first ``:``."""
    for i, ch in enumerate(artifact_id):
        if ch == ":":
            return artifact_id[:i]
    return artifact_id


def validate_delta_scope(refs: List[str], m: Dict[str, Any]) -> None:
    """Mirror Go ``ValidateDeltaScope`` (deltas.go).

    Raises :class:`DeltaScopeViolation` when a state-delta artifact prefix
    falls outside the intent target prefix. NOTE: the Go ``Run`` / ``process``
    path does **not** call this (scope validation is a downstream concern) —
    it is exposed for parity completeness and downstream callers, not invoked
    by :func:`compile_ccnf_input`.
    """
    intent = m.get("intent")
    target_id = ""
    if isinstance(intent, dict):
        tid = intent.get("target_id")
        if isinstance(tid, str):
            target_id = tid
    if target_id != "":
        target_prefix = _extract_artifact_prefix(target_id)
        for ref in refs:
            prefix = _extract_artifact_prefix(ref)
            if prefix != target_prefix:
                raise DeltaScopeViolation(
                    f"artifact {ref!r} (prefix {prefix!r}) outside scope of "
                    f"target {target_id!r} (prefix {target_prefix!r})"
                )
    else:
        for ref in refs:
            if not _is_valid_artifact_id(ref):
                raise DeltaScopeViolation(f"invalid artifact_id {ref!r}")


def _reject_nonfinite(v: Any) -> None:
    """Fail closed on NaN / +Inf / -Inf floats (not representable in canonical
    form — the CCNF spec says implementations SHOULD reject them at ingress)."""
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            raise StructuralParseFailure(
                "non-finite float is not representable in canonical form"
            )
    elif isinstance(v, dict):
        for vv in v.values():
            _reject_nonfinite(vv)
    elif isinstance(v, list):
        for vv in v:
            _reject_nonfinite(vv)


def _build_payload(m: Dict[str, Any]) -> Dict[str, Any]:
    """Mirror Go ``buildPayload``: artifact keys are removed from
    ``payload.data`` (they moved to state_delta); all other payload keys are
    preserved as provenance metadata."""
    payload: Dict[str, Any] = {"type": "structured", "data": {}}
    raw_payload = m.get("payload")
    if isinstance(raw_payload, dict):
        d = raw_payload.get("data")
        if isinstance(d, dict):
            payload["data"] = {
                k: v for k, v in d.items() if not _is_valid_artifact_id(k)
            }
        for k, v in raw_payload.items():
            if k != "data" and k != "type":
                payload[k] = v
    return payload


def _normalize_causality(c: Any) -> Dict[str, Any]:
    """Mirror Go ``normalizeCausality``: default block when absent; add missing
    ``ordered`` / ``parent_event_ids`` otherwise."""
    if not isinstance(c, dict):
        return {
            "parent_event_ids": [],
            "causal_chain_id": "",
            "trace_depth": 0,
            "ordered": True,
        }
    if "ordered" not in c:
        c["ordered"] = True
    if "parent_event_ids" not in c:
        c["parent_event_ids"] = []
    return c


def _compute_hash(cer: Dict[str, Any]) -> str:
    """Mirror Go ``ComputeHash``: SHA256 of canonical JSON of all CER fields
    except ``signature``."""
    m = {k: v for k, v in cer.items() if k != "signature"}
    return hashlib.sha256(canonical_json(m).encode("utf-8")).hexdigest()


def _get_string(m: Dict[str, Any], key: str) -> str:
    v = m.get(key)
    return v if isinstance(v, str) else ""


def _get_map(m: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    v = m.get(key)
    return v if isinstance(v, dict) else None


# ── Full CCNF pipeline (mirror Go ccnf.Run) ──────────────────────────

def compile_ccnf_input(
    input_dict: Dict[str, Any],
    ccnf_version: int = CCNF_VERSION,
    now_ts: Optional[int] = None,
) -> Dict[str, Any]:
    """Run the full CCNF pipeline over a CCNF input document and return the CER.

    This is a byte-identical, pure-Python mirror of Go ``ccnf.Run`` (the
    ``ccnf-conformance process`` path). It is the deterministic core that
    :func:`compile_work_request` wraps.

    Args:
        input_dict: The CCNF input document (requires top-level ``actor``,
            ``intent``, ``domain``, ``event_id``).
        ccnf_version: The CCNF version to apply. Any value other than
            :data:`CCNF_VERSION` fails closed (``CCNF_VERSION_MISMATCH``).
        now_ts: Wall-clock substitution for a zero/absent timestamp. Purely for
            determinism in tests; defaults to ``time.time()`` like Go.

    Returns:
        The full CER dict (15 top-level fields, including ``signature``).

    Raises:
        CompileError subclasses (fail-closed; no partial output).
    """
    # 1. Version gate.
    if ccnf_version != CCNF_VERSION:
        raise CCNFVersionMismatch(
            f"expected version {CCNF_VERSION}, got {ccnf_version}"
        )
    if not isinstance(input_dict, dict):
        raise StructuralParseFailure("root must be a JSON object")

    # 2. Structural parse: required top-level fields + embedded version.
    for field in ("actor", "intent", "domain", "event_id"):
        if field not in input_dict:
            raise StructuralParseFailure(f"missing required field {field!r}")
    embedded = input_dict.get("ccnf_version")
    if isinstance(embedded, bool):
        pass  # not a number; ignore
    elif isinstance(embedded, (int, float)) and int(embedded) != ccnf_version:
        raise CCNFVersionMismatch(
            f"input declares ccnf_version {int(embedded)}, engine is {ccnf_version}"
        )

    # 3. Canonicalize fields: strings → copy → timestamps → numbers/absent.
    m = _normalize_strings(input_dict)
    if not isinstance(m, dict):  # defensive; _normalize_strings preserves type
        raise StructuralParseFailure("root must be a JSON object")
    _convert_timestamps(m)
    _normalize_absent_fields(m)
    _reject_nonfinite(m)

    # 4. Normalize intent.
    m["intent"] = _normalize_intent(m.get("intent"))

    # 5. Check target_id.
    _check_target_id(m)

    # 6. Resolve artifacts.
    refs, artifacts = _resolve_artifacts(m)

    # 7. Derive identity (single derivation — reuses identity.py).
    entity_key, identity_type, scope = derive_identity(m)

    # 8. Compute state deltas.
    deltas = _compute_state_deltas(m, refs, artifacts)

    # 9. Collapse key / alias keys (Go DeriveAliasKeys -> nil).
    collapse_key = _derive_collapse_key(m)
    alias_keys: Optional[List[str]] = None

    # 10. Assemble CER.
    timestamp = _parse_timestamp(m.get("timestamp"))
    if timestamp == 0:
        timestamp = now_ts if now_ts is not None else int(time.time())

    cer: Dict[str, Any] = {
        "event_id": _get_string(m, "event_id"),
        "event_version": EVENT_VERSION,
        "ccnf_version": ccnf_version,
        "system": SYSTEM_NAME,
        "domain": _get_string(m, "domain"),
        "timestamp": timestamp,
        "actor": _get_map(m, "actor"),
        "intent": m["intent"],
        "identity": {
            "entity_key": entity_key,
            "type": identity_type,
            "scope": scope,
            "collapse_key": collapse_key,
            "alias_keys": alias_keys,
        },
        "causality": _normalize_causality(m.get("causality")),
        "artifact_refs": refs if refs else None,
        "state_delta": deltas,
        "payload": _build_payload(m),
        "compression": {
            "strategy": "full",
            "lossless": True,
            "compression_version": 1,
        },
    }

    # 11. Sign (hash all fields except signature).
    cer["signature"] = {"hash": _compute_hash(cer), "signed_by": None}

    return cer


# ── Compile result + entry point ────────────────────────────────────

@dataclass(frozen=True)
class CompileResult:
    """The result of a successful :func:`compile_work_request`.

    Attributes:
        work_request: The validated WorkRequest dict (spec + plan, normalized).
        ccnf_input: The CCNF input document that was compiled.
        cer: The full CER dict (15 fields, signed).
        entity_key: ``cer["identity"]["entity_key"]`` — the canonical identity,
            derived exactly once.
        canonical_hash: ``cer["signature"]["hash"]``.
        event_id: ``cer["event_id"]`` (the WorkRequest id).
    """

    work_request: Dict[str, Any]
    ccnf_input: Dict[str, Any]
    cer: Dict[str, Any]
    entity_key: str
    canonical_hash: str
    event_id: str


def compile_work_request(
    specification: Dict[str, Any],
    implementation_plan: Dict[str, Any],
    *,
    ccnf_version: Optional[int] = None,
    timestamp: Optional[int] = None,
    agent_id: str = "conduit",
    actor: Optional[Dict[str, Any]] = None,
    now_ts: Optional[int] = None,
    use_wall_clock: bool = False,
) -> CompileResult:
    """Compile a Specification + Implementation Plan into a WorkRequest → CER.

    This is the **single compile entry point** (T21). It is fail-closed: any
    invalid, ambiguous, or unsupported input raises :class:`CompileError`
    rather than producing a partial WorkRequest or CER.

    Args:
        specification: ``{"intent": <dict|str>, "constraints": [...]}``.
            ``intent`` is validated as provenance (a structured intent's
            ``action`` must be in the controlled vocabulary; free text is
            wrapped). ``constraints`` must be a list.
        implementation_plan: ``{"id": str, "goal": str, "files_affected": [...],
            "acceptance_criteria": [...]}`` plus optional ``title``, ``project``,
            ``dependencies``, ``created_at``. ``id`` and ``goal`` are required.
        ccnf_version: The CCNF version to apply; defaults to the locked
            manifest version. Anything other than :data:`CCNF_VERSION` fails
            closed.
        timestamp: Deterministic epoch seconds for the CER. When omitted, the
            plan's ``created_at`` is parsed (deterministic). If neither is
            available, the compile **fails closed** unless ``use_wall_clock``
            is set — the entry point is deterministic by default (T21).
        agent_id: The actor id for the canonical WR identity (default
            ``"conduit"``), when ``actor`` is not supplied.
        actor: Optional explicit actor map for the CCNF identity.
        now_ts: Wall-clock substitution (for tests) when ``use_wall_clock`` is
            True and no deterministic timestamp is available.
        use_wall_clock: Opt into the Go-reference wall-clock timestamp
            fallback. Defaults False — a compile without a deterministic
            timestamp fails closed instead of silently producing a
            non-deterministic CER.

    Returns:
        A :class:`CompileResult` carrying the validated WorkRequest, the CCNF
        input document, and the signed CER.

    Raises:
        CompileError subclasses — fail-closed (see module docstring).
    """
    # ── Version gate (T21 item 4): locked version; unknown/newer → fail ──
    locked = locked_ccnf_version()
    if ccnf_version is None:
        ccnf_version = locked
    if ccnf_version != CCNF_VERSION:
        raise CCNFVersionMismatch(
            f"unsupported CCNF version {ccnf_version} (locked={CCNF_VERSION})"
        )

    # ── Validate specification (fail-closed on missing entity-key inputs) ──
    if not isinstance(specification, dict):
        raise MissingSpecField("specification must be a dict")
    if "intent" not in specification:
        raise MissingSpecField("specification.intent is required")
    intent = specification["intent"]
    if isinstance(intent, dict):
        # Structured intent: validate the action against the controlled
        # vocabulary now (fail closed), even though the WR identity itself is
        # the canonical `execute` verb on the workrequest target.
        action = intent.get("action") if isinstance(intent.get("action"), str) else ""
        if action == "":
            raise IntentNormalizationFailure("empty action in specification.intent")
        if action not in _CONTROLLED_VOCAB:
            raise IntentNormalizationFailure(
                f"unknown action {action!r} in specification.intent"
            )
    elif isinstance(intent, str):
        if intent == "":
            raise IntentNormalizationFailure(
                "specification.intent must be a non-empty string or a dict"
            )
    else:
        raise IntentNormalizationFailure(
            f"unexpected specification.intent type {type(intent).__name__}"
        )
    constraints = specification.get("constraints", [])
    if not isinstance(constraints, list):
        raise MissingSpecField("specification.constraints must be a list")

    # ── Validate implementation plan (fail-closed on missing fields) ──
    if not isinstance(implementation_plan, dict):
        raise MissingPlanField("implementation_plan must be a dict")
    wr_id = implementation_plan.get("id")
    if not isinstance(wr_id, str) or wr_id == "":
        raise MissingPlanField("implementation_plan.id is required")
    goal = implementation_plan.get("goal")
    if not isinstance(goal, str) or goal == "":
        raise MissingPlanField("implementation_plan.goal is required")
    files_affected = implementation_plan.get("files_affected", [])
    if not isinstance(files_affected, list):
        raise MissingPlanField("implementation_plan.files_affected must be a list")
    acceptance_criteria = implementation_plan.get("acceptance_criteria", [])
    if not isinstance(acceptance_criteria, list):
        raise MissingPlanField(
            "implementation_plan.acceptance_criteria must be a list"
        )

    # ── Assemble the validated WorkRequest ──
    work_request: Dict[str, Any] = {
        "id": wr_id,
        "kind": "work_request",
        "intent": intent,
        "constraints": list(constraints),
        "goal": goal,
        "files_affected": list(files_affected),
        "acceptance_criteria": list(acceptance_criteria),
    }
    for passthrough in ("title", "project", "dependencies", "created_at"):
        if passthrough in implementation_plan:
            work_request[passthrough] = implementation_plan[passthrough]

    # ── Build the CCNF input document (canonical WR birth shape) ──
    # Mirrors identity._wr_ccnf_input / ccnf_bridge.CCNFAdapter: a WR is a
    # system `execute` on its own workrequest target. spec/plan content rides in
    # payload.meta (provenance) — never hashed into the entity key.
    ts = timestamp
    if ts is None:
        created = work_request.get("created_at")
        if isinstance(created, str):
            ts = _parse_rfc3339(created)
    if ts is None:
        if not use_wall_clock:
            raise MissingPlanField(
                "timestamp is required for a deterministic compile; pass "
                "timestamp=, implementation_plan.created_at=, or "
                "use_wall_clock=True"
            )
        ts = now_ts if now_ts is not None else int(time.time())

    ccnf_input: Dict[str, Any] = {
        "event_id": wr_id,
        "actor": actor if actor is not None else {"type": "system", "id": agent_id},
        "intent": {
            "action": "execute",
            "target_type": "workrequest",
            "target_id": f"workrequest:{wr_id}",
        },
        "domain": "execution",
        "timestamp": ts,
        "payload": {"data": {}, "meta": {"work_request": work_request}},
    }

    # ── Compile (single identity derivation) ──
    cer = compile_ccnf_input(ccnf_input, ccnf_version=ccnf_version)

    # ── Fail-closed integrity checks ──
    entity_key = cer["identity"]["entity_key"]
    canonical_hash = cer["signature"]["hash"]
    # Hash mismatch / non-canonical serialization: recompute and compare.
    recomputed = _compute_hash(cer)
    if recomputed != canonical_hash:
        raise HashMismatch(
            f"signature.hash {canonical_hash} != recomputed {recomputed}"
        )
    # Non-canonical serialization: canonical bytes must round-trip to the same
    # structure. This guards NaN/Inf and structurally-lossy output (it cannot
    # detect float divergence from Go's canonical form, which is covered by the
    # golden vectors + Rust acceptance instead).
    roundtrip = json.loads(canonical_json(
        {k: v for k, v in cer.items() if k != "signature"}
    ))
    if roundtrip != {k: v for k, v in cer.items() if k != "signature"}:
        raise HashMismatch("non-canonical serialization: round-trip mismatch")

    return CompileResult(
        work_request=work_request,
        ccnf_input=ccnf_input,
        cer=cer,
        entity_key=entity_key,
        canonical_hash=canonical_hash,
        event_id=wr_id,
    )


# ── T19 spine envelope ───────────────────────────────────────────────

def build_envelope(
    result: CompileResult,
    *,
    event_type: str = "WorkRequestCompiled",
    origin_component: str = "nexus-core",
    correlation_id: Optional[str] = None,
    causation_id: Optional[str] = None,
    subject: str = "nexus.kernel.v1.transition.work_request.compiled",
) -> Dict[str, Any]:
    """Build a T19 ``CanonicalEnvelope``-shaped dict around a CompileResult.

    The envelope carries the CER and the already-derived ``entity_key`` — there
    is **no second identity derivation** (T21 item 5). The returned dict matches
    ``nats_envelope.CanonicalEnvelope.to_dict()`` exactly, so a spine consumer
    can round-trip it via ``CanonicalEnvelope.from_dict(...)`` without this
    module taking a transport dependency.

    ``occurred_at`` is wall-clock (transport time), so the envelope itself is
    not deterministic; the CER it wraps is.
    """
    return {
        "event_id": result.event_id,
        "event_type": event_type,
        "event_version": EVENT_VERSION,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "origin_system": SYSTEM_NAME,
        "origin_component": origin_component,
        "domain": result.cer["domain"],
        "ccnf_version": result.cer["ccnf_version"],
        "actor": result.cer["actor"],
        "intent": result.cer["intent"],
        "correlation_id": correlation_id or result.event_id,
        "causation_id": causation_id,
        "source_event_ids": [],
        "execution_id": None,
        "classification": "internal",
        "policy_version": None,
        "subject": subject,
        "payload": {
            "cer": result.cer,
            "entity_key": result.entity_key,
            "canonical_hash": result.canonical_hash,
        },
    }
