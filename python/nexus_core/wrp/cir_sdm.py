"""
CIR-SDM data-level checks (T23) — pure evaluation over ordered event streams.

Mirrors ``nexus_core/wrp/identity.py`` in structure: a zero-dependency,
cross-kernel-safe module that turns an ordered CER/event stream into a list
of *violation records*. It is the data-level extension of the file/schema-level
ARL surface (``nexus/tools/arl/``) and the compile-time CCNF/CER emission
path (``nexus_core/wrp/compile.py`` + ``python/conduit/ccnf_bridge.py``).

# GOVERNANCE REFERENCE (do not drift)
T23 thread ``5686908d`` (architect breakdown 2026-08-14) + T09 thread
``0b51d98a`` (rule families + evaluation model, architect draft). CIRS axioms
from governance thread ``ded5b0de``:

  CIRS-3 One-Way Gate — Observation → Projection → ProjectionIR → Synthesis →
                        WorkRequest → Execution, strictly directional.
  CIRS-4 Audit Non-Influence — execution traces never influence future
                        generation (reviews/inspections are not inputs).

# CANONICAL INPUT (Step 1)
An *ordered* list of events. Each event is one of two raw shapes, normalized
to a canonical form by :func:`normalize_event`:

  1. Runtime event (conduit runtime event log — WR_* types):
       {"type": "WR_CLAIMED", "wrId": "wr-1", "timestamp": "...", "payload": {...}}

  2. CER (the 15-field CCNF compile output from ``compile_ccnf_input``):
       {"event_id": ..., "ccnf_version": 1, "domain": ..., "intent": {...},
        "causality": {"parent_event_ids": [...]}, ...}

The module NEVER mutates source events (``normalize_event`` copies) and NEVER
feeds audit traces back into generation (CIRS-4) — the rules only *read* the
stream and *report* violations.

# VIOLATION RECORD SHAPE (T09)
  (violation_id, cer_id, event_id, rule_id, rule_version, severity,
   description, detected_at, blocking)

* ``violation_id`` — deterministic SHA256 of (rule_id, event_id, cer_id,
  description). Re-running the same stream yields the SAME id.
* ``detected_at``  — the offending event's timestamp (deterministic), not the
  evaluation wall clock. No wall-clock dependence anywhere.
* ``severity``     — intrinsic seriousness of the rule family:
    ``blocking`` (structural axiom breach), ``warning`` (requires review),
    ``info`` (logged). This is *detection* severity, not enforcement.
* ``blocking``     — enforcement flag, always ``False`` unless the rule is in
  the caller-supplied ``enforced_rules`` set (shadow-mode default: nothing
  blocks until false-positive behaviour is approved — T23 Step 6/7).

# RULE VERSIONING (Step 1)
Every rule carries a deterministic ``rule_version``. Evaluation is a pure
function of (event stream, rule_version): same input + same version ⇒ same
violations, bit-for-bit.

# RULE FAMILIES (Step 2)
  1. ``cir-sdm.one-way-gate``          — CIRS-3: no illegal/reverse transitions.
  2. ``cir-sdm.audit-non-influence``   — CIRS-4: generation events never cite
                                         an audit/feedback event as causation.
  3. ``cir-sdm.provenance-causation``  — dangling causation (parent id that
                                         resolves nowhere) → violation.
  4. ``cir-sdm.version-lock``          — a stream mixing CCNF versions (or a
                                         CER missing its version) → violation.

Usage::

    from nexus_core.wrp.cir_sdm import evaluate

    events = [
        {"type": "WR_SUBMITTED", "wrId": "wr-1", "timestamp": "2026-08-01T00:00:00Z"},
        {"type": "WR_VALIDATED", "wrId": "wr-1", "timestamp": "2026-08-01T00:01:00Z"},
        # ... forward lifecycle ...
    ]
    violations = evaluate(events)            # shadow mode: blocking all False
    violations = evaluate(events, enforced_rules=frozenset({"cir-sdm.one-way-gate"}))
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from typing import Any, Dict, FrozenSet, Iterable, List, Optional, Tuple

__all__ = [
    "CIRViolation",
    "CanonicalEvent",
    "normalize_event",
    "evaluate",
    "rule_one_way_gate",
    "rule_audit_non_influence",
    "rule_provenance_causation",
    "rule_version_lock",
    "rule_ir_stage_separation",
    "rule_core_stage_separation",
    "WR_TRANSITIONS",
    "PGV_TRANSITIONS",
    "PGV_INITIAL_STATE",
    "AUDIT_DOMAINS",
    "AUDIT_ACTOR_TYPES",
    "STAGE_SYNTHESIS",
    "STAGE_IR",
    "STAGE_EXECUTION_PREFIX",
]

# ── Rule identifiers (stable; do not rename without a version bump) ───

RULE_ONE_WAY_GATE = "cir-sdm.one-way-gate"
RULE_AUDIT_NON_INFLUENCE = "cir-sdm.audit-non-influence"
RULE_PROVENANCE_CAUSATION = "cir-sdm.provenance-causation"
RULE_VERSION_LOCK = "cir-sdm.version-lock"
RULE_IR_STAGE_SEPARATION = "cir-sdm.ir-stage-separation"
RULE_CORE_STAGE_SEPARATION = "cir-sdm.core-stage-separation"

# Each rule family carries a deterministic version. Bump a family's version
# when its semantics change; the version is part of every violation record so
# consumers can tell which generation of the rule fired.
RULE_VERSIONS: Dict[str, str] = {
    RULE_ONE_WAY_GATE: "1",
    RULE_AUDIT_NON_INFLUENCE: "1",
    RULE_PROVENANCE_CAUSATION: "1",
    RULE_VERSION_LOCK: "1",
    RULE_IR_STAGE_SEPARATION: "1",
    RULE_CORE_STAGE_SEPARATION: "1",
}

# ── Canonical event schema ────────────────────────────────────────────


@dataclass(frozen=True)
class CanonicalEvent:
    """The normalized form every rule evaluates over.

    Populated by :func:`normalize_event` from either a runtime event or a
    CER. Rules only read these fields; the original dict is never mutated.
    """

    event_id: str
    event_type: str                 # WR_* type for runtime events; "cer" otherwise
    wr_id: Optional[str] = None
    timestamp: Optional[int] = None  # epoch seconds when present
    domain: Optional[str] = None
    intent_action: Optional[str] = None
    actor_type: Optional[str] = None
    parent_event_ids: List[str] = field(default_factory=list)
    ccnf_version: Optional[int] = None
    phase: Optional[str] = None      # pgv.phase_lifecycle target state
    is_cer: bool = False
    is_audit: bool = False
    unbackfilled: bool = False       # identity-unknown / pre-CER row (T23 Step 5)

    @property
    def is_runtime_event(self) -> bool:
        return not self.is_cer

    @property
    def is_wr_event(self) -> bool:
        """True for WR_* runtime-status events (the one-way-gate axis).

        Non-WR ``event_type`` values (WORKREQUEST.CREATED, VISION.IR_PRODUCED,
        EXECUTION.*, …) are pipeline events on the CIRS-3 *stage* axis —
        classified by :attr:`stage` (T23 Step 3).
        """
        return (not self.is_cer) and self.event_type.startswith("WR_")

    @property
    def stage(self) -> Optional[str]:
        """CIRS-3 stage-axis classification (T23 Step 3).

        Maps a pipeline event's ``event_type`` to its CIRS-3 stage:
        ``WORKREQUEST.CREATED`` → ``synthesis``; ``VISION.IR_PRODUCED`` →
        ``projection_ir``; ``EXECUTION.*`` → ``execution``. Returns ``None``
        for WR_* runtime events, CERs, and unknown types.
        """
        return _stage_of(self.event_type)


# ── Audit / feedback classification (CIRS-4) ──────────────────────────
# A CER is "audit/feedback" when its domain or actor type marks it as review /
# inspection / governance output. Generation domains (execution, specification,
# system) are the forward pipeline and are never audit. The intent-action
# controlled vocabulary (create/update/delete/execute/validate/emit) is NOT used
# here: "validate" is a generation verb in the pipeline, so domain is the
# reliable signal.

AUDIT_DOMAINS: FrozenSet[str] = frozenset({
    "review", "inspection", "audit", "governance", "critique", "feedback",
})

AUDIT_ACTOR_TYPES: FrozenSet[str] = frozenset({
    "reviewer", "inspector", "critic", "auditor",
})


def _is_audit(domain: Optional[str], actor_type: Optional[str]) -> bool:
    if domain is not None and domain.lower() in AUDIT_DOMAINS:
        return True
    if actor_type is not None and actor_type.lower() in AUDIT_ACTOR_TYPES:
        return True
    return False


# ── CIRS-3 stage axis (T23 Step 3) ────────────────────────────────────
# Pipeline-stage events on the CIRS-3 axis (Observation → Projection →
# ProjectionIR → Synthesis → WorkRequest → Execution). These event types are
# in the conduit work_request_events CHECK constraint but do NOT exist in the
# log yet — wire the recognition now so the IR/CORE/AUD checks are ready when
# they start flowing (architect Step 3 sign-off, record d39670ec).

STAGE_SYNTHESIS = "WORKREQUEST.CREATED"
STAGE_IR = "VISION.IR_PRODUCED"
STAGE_EXECUTION_PREFIX = "EXECUTION."


def _stage_of(event_type: Optional[str]) -> Optional[str]:
    """Classify a pipeline event_type onto the CIRS-3 stage axis.

    ``WORKREQUEST.CREATED`` → ``synthesis``; ``VISION.IR_PRODUCED`` →
    ``projection_ir``; ``EXECUTION.*`` → ``execution``. WR_* runtime events
    and CERs (which carry no stage ``event_type``) classify as ``None``.
    """
    if not event_type:
        return None
    if event_type == STAGE_SYNTHESIS:
        return "synthesis"
    if event_type == STAGE_IR:
        return "projection_ir"
    if event_type.startswith(STAGE_EXECUTION_PREFIX):
        return "execution"
    return None


# ── CIRS-3 legal transitions (canonical tables) ───────────────────────
# WR runtime transitions — mirrored from the TypeScript canonical
# typescript/conduit-mcp/src/runtime-kernel.ts TRANSITION_TABLE (DRAFT is the
# initial status; terminal states have no outgoing transitions). Reconcile
# against that file if it changes; do not edit independently (same doctrine as
# nexus_core/wrp/states.py).
#
#   status → [(event_type, next_status), ...]
WR_TRANSITIONS: Dict[str, List[Tuple[str, str]]] = {
    "DRAFT": [
        ("WR_SUBMITTED", "VALIDATED"),
        ("WR_REJECTED", "REJECTED"),
    ],
    "VALIDATED": [
        ("WR_VALIDATED", "QUEUED"),   # manual advance (ADR-006) — no auto-advance
        ("WR_REJECTED", "REJECTED"),
    ],
    "QUEUED": [
        ("WR_QUEUED", "CLAIMED"),
        ("WR_DEFERRED", "DEFERRED"),
    ],
    "CLAIMED": [
        ("WR_CLAIMED", "ACKED"),
        ("WR_FAILED", "FAILED"),
    ],
    "ACKED": [
        ("WR_ACKED", "SETTLED"),
        ("WR_FAILED", "FAILED"),
        ("WR_NOOP", "NOOP"),
    ],
    # Terminal states — no transitions out.
    "SETTLED": [],
    "REJECTED": [],
    "FAILED": [],
    "NOOP": [],
    "DEFERRED": [],
}

WR_INITIAL_STATUS = "DRAFT"

# pgv.phase_lifecycle transitions — mirrored from
# go/wrp/ccnf-ref/.tools/pgv.state_machine.json (phase axis, independent of the
# WR runtime axis). t7 is a wildcard ("*" → INVALID, state_compiler_failed), so
# INVALID is reachable from any phase; all other edges are enumerated. The
# REBASELINE_PENDING → PHASE_2_FROZEN reject edge (t3) is a *legal* reverse —
# the one-way gate flags only transitions absent from this table.
PGV_INITIAL_STATE = "PHASE_2_FROZEN"

PGV_TRANSITIONS: Dict[str, FrozenSet[str]] = {
    "PHASE_2_FROZEN": frozenset({"REBASELINE_PENDING"}),
    "REBASELINE_PENDING": frozenset({"REBASELINE_ACCEPTED", "PHASE_2_FROZEN"}),
    "REBASELINE_ACCEPTED": frozenset({"PHASE_3_DUAL"}),
    "PHASE_3_DUAL": frozenset({"PHASE_4_SWITCH"}),
    "PHASE_4_SWITCH": frozenset({"PHASE_2_FROZEN"}),
    "INVALID": frozenset(),
}

# ── Violation record ──────────────────────────────────────────────────


@dataclass(frozen=True)
class CIRViolation:
    """One detected CIR-SDM violation (T09 record shape)."""

    violation_id: str
    cer_id: Optional[str]
    event_id: str
    rule_id: str
    rule_version: str
    severity: str          # "blocking" | "warning" | "info"
    description: str
    detected_at: int       # offending event timestamp (0 when unknown)
    blocking: bool = False  # enforcement flag — False unless rule is enforced

    def with_blocking(self, blocking: bool) -> "CIRViolation":
        return replace(self, blocking=blocking)


def _violation_id(rule_id: str, event_id: str, cer_id: Optional[str],
                  description: str) -> str:
    """Deterministic violation id — stable across re-runs of the same stream."""
    h = hashlib.sha256()
    for part in (rule_id, event_id, cer_id or "", description):
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def _check_rule_version(rule_id: str, rule_version: str) -> None:
    """Fail closed on an unknown rule generation (mirrors compile.py's
    version-mismatch behaviour). Only ``RULE_VERSIONS[rule_id]`` is legal."""
    expected = RULE_VERSIONS[rule_id]
    if rule_version != expected:
        raise ValueError(
            f"{rule_id}: unsupported rule_version {rule_version!r} "
            f"(expected {expected!r})")


def _make_violation(
    rule_id: str,
    event: CanonicalEvent,
    severity: str,
    description: str,
    cer_id: Optional[str] = None,
) -> CIRViolation:
    return CIRViolation(
        violation_id=_violation_id(rule_id, event.event_id, cer_id, description),
        cer_id=cer_id,
        event_id=event.event_id,
        rule_id=rule_id,
        rule_version=RULE_VERSIONS[rule_id],
        severity=severity,
        description=description,
        detected_at=event.timestamp or 0,
    )


# ── Normalization ─────────────────────────────────────────────────────


def _parse_timestamp(value: Any) -> Optional[int]:
    """Best-effort timestamp → epoch seconds; None when absent/unparseable.

    Deterministic only — never falls back to the wall clock (a CER with no
    timestamp yields ``None``, which surfaces as ``detected_at == 0``).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return int(float(s))
        except ValueError:
            pass
        # ISO-8601 (assume UTC when no offset) — parse the date part only.
        from datetime import datetime, timezone

        iso = s
        if iso.endswith("Z"):
            iso = iso[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(iso)
        except ValueError:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    return None


def normalize_event(raw: Any) -> CanonicalEvent:
    """Normalize a runtime event, a DB event row, or a CER.

    Accepts three raw shapes (the input dict is never mutated):

      1. Runtime event (convenience form): ``{"type": "WR_CLAIMED",
         "wrId": ..., "timestamp": ...}``.
      2. DB event row (conduit ``work_request_events``): ``{"event_id",
         "work_request_id", "event_type", "causation_id", "actor_type",
         "occurred_at", ...}`` — ``causation_id`` becomes a single-parent
         ``parent_event_ids`` entry; ``actor_type`` feeds audit classification.
      3. CER (15-field CCNF compile output).

    Malformed input normalizes to a best-effort canonical form (missing ids
    become ``""``); the provenance/version rules then surface the gap.
    """
    if not isinstance(raw, dict):
        raw = {}

    # Kind 1 — runtime event: {"type": "WR_*", "wrId": ...}
    type_field = raw.get("type")
    if isinstance(type_field, str) and type_field.startswith("WR_"):
        wr_id = raw.get("wrId") or raw.get("wr_id") or raw.get("work_request_id")
        return CanonicalEvent(
            event_id=raw.get("event_id") or raw.get("id") or wr_id or "",
            event_type=type_field,
            wr_id=wr_id,
            timestamp=_parse_timestamp(raw.get("timestamp")),
            is_cer=False,
            is_audit=False,
        )

    # Kind 2 — DB event row: {"event_type": ..., "work_request_id", ...}
    db_event_type = raw.get("event_type")
    if isinstance(db_event_type, str):
        wr_id = raw.get("work_request_id") or raw.get("wr_id") or raw.get("wrId")
        actor_type = raw.get("actor_type")
        causation_id = raw.get("causation_id")
        parents = [str(causation_id)] if causation_id else []
        return CanonicalEvent(
            event_id=str(raw.get("event_id") or wr_id or ""),
            event_type=db_event_type,
            wr_id=wr_id,
            timestamp=_parse_timestamp(raw.get("occurred_at") or raw.get("timestamp")),
            actor_type=actor_type if isinstance(actor_type, str) else None,
            parent_event_ids=parents,
            is_cer=False,
            is_audit=_is_audit(None, actor_type),
        )

    # Kind 3 — CER: the 15-field CCNF compile output.
    domain = raw.get("domain")
    actor = raw.get("actor") if isinstance(raw.get("actor"), dict) else {}
    actor_type = actor.get("type") if isinstance(actor, dict) else None
    intent = raw.get("intent") if isinstance(raw.get("intent"), dict) else {}
    intent_action = intent.get("action")
    causality = raw.get("causality") if isinstance(raw.get("causality"), dict) else {}
    parents = causality.get("parent_event_ids") or []
    if isinstance(parents, str):
        parents = [parents]
    parent_ids = [str(p) for p in parents if p]

    ccnf_version = raw.get("ccnf_version")
    if isinstance(ccnf_version, (int, float)) and not isinstance(ccnf_version, bool):
        ccnf_version = int(ccnf_version)
    elif isinstance(ccnf_version, str) and ccnf_version.strip().isdigit():
        ccnf_version = int(ccnf_version.strip())
    else:
        ccnf_version = None

    # identity-unknown / unbackfilled: a replayed pre-CER row carries either an
    # explicit ``unbackfilled`` marker or an identity with a NULL entity_key.
    # These must NOT fabricate violations (T23 Step 5 historical fixture).
    unbackfilled = raw.get("unbackfilled") is True
    identity = raw.get("identity") if isinstance(raw.get("identity"), dict) else {}
    if identity.get("entity_key") is None and identity:
        unbackfilled = True

    return CanonicalEvent(
        event_id=raw.get("event_id") or "",
        event_type="cer",
        wr_id=raw.get("wr_id") or raw.get("work_request_id"),
        timestamp=_parse_timestamp(raw.get("timestamp")),
        domain=domain if isinstance(domain, str) else None,
        intent_action=intent_action if isinstance(intent_action, str) else None,
        actor_type=actor_type,
        parent_event_ids=parent_ids,
        ccnf_version=ccnf_version,
        phase=raw.get("phase") if isinstance(raw.get("phase"), str) else None,
        is_cer=True,
        is_audit=_is_audit(domain, actor_type),
        unbackfilled=unbackfilled,
    )


# ── Rule 1: CIRS-3 one-way gate ───────────────────────────────────────


def rule_one_way_gate(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_ONE_WAY_GATE],
) -> List[CIRViolation]:
    """CIRS-3 — no illegal/reverse transitions in the ordered stream.

    The WR runtime axis is folded **per WorkRequest** (a dict keyed by
    ``wr_id``): the conduit ``work_request_events`` log is interleaved, so
    multiple WRs share one ordered stream. A single global fold would flag a
    perfectly legal interleave (wr-1 advancing while wr-2 starts at DRAFT) as
    an illegal transition. The pgv phase axis is folded **globally** (phase is
    not scoped to a WR).

    Any event whose target state is not reachable from its WR's current state
    is a violation. A reverse transition (e.g. a ``WR_CLAIMED`` after
    ``SETTLED``) is caught as an illegal transition from a terminal state.
    """
    _check_rule_version(RULE_ONE_WAY_GATE, rule_version)
    violations: List[CIRViolation] = []
    # Per-WR fold — key by wr_id (empty string buckets wr_id-less WR events).
    wr_statuses: Dict[str, str] = {}
    phase = PGV_INITIAL_STATE

    for ev in events:
        if ev.is_wr_event:
            wr_key = ev.wr_id or ""
            wr_status = wr_statuses.get(wr_key, WR_INITIAL_STATUS)
            allowed = WR_TRANSITIONS.get(wr_status)
            if allowed is None:
                # Unknown status — treat as terminal; nothing may follow.
                violations.append(_make_violation(
                    RULE_ONE_WAY_GATE, ev, "blocking",
                    f"illegal WR transition: status {wr_status!r} unknown",
                ))
                continue
            next_status = None
            for etype, nxt in allowed:
                if etype == ev.event_type:
                    next_status = nxt
                    break
            if next_status is None:
                allowed_list = ", ".join(e for e, _ in allowed) or "(terminal)"
                violations.append(_make_violation(
                    RULE_ONE_WAY_GATE, ev, "blocking",
                    f"illegal WR transition: {ev.event_type} not allowed from "
                    f"{wr_status} (allowed: {allowed_list})",
                ))
                # Do not advance past an illegal event — the stream stays put,
                # so a subsequent event is also evaluated from the same status.
                continue
            wr_statuses[wr_key] = next_status

        elif ev.phase is not None:
            allowed_phases = PGV_TRANSITIONS.get(phase, frozenset())
            if ev.phase not in allowed_phases:
                violations.append(_make_violation(
                    RULE_ONE_WAY_GATE, ev, "blocking",
                    f"illegal pgv phase transition: {phase} -> {ev.phase} not in "
                    f"pgv.phase_lifecycle",
                ))
                continue
            phase = ev.phase

    return violations


# ── Rule 2: CIRS-4 audit non-influence ────────────────────────────────


def rule_audit_non_influence(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_AUDIT_NON_INFLUENCE],
) -> List[CIRViolation]:
    """CIRS-4 — no generation CER cites an audit/feedback CER in causation.

    First pass indexes every event id → audit flag; second pass checks that a
    *generation* event's ``parent_event_ids`` never reference an audit event.
    """
    _check_rule_version(RULE_AUDIT_NON_INFLUENCE, rule_version)
    materialized = list(events)
    audit_by_id: Dict[str, bool] = {}
    for ev in materialized:
        if ev.event_id:
            audit_by_id[ev.event_id] = ev.is_audit

    violations: List[CIRViolation] = []
    for ev in materialized:
        if ev.is_audit or not ev.parent_event_ids:
            continue
        for parent in ev.parent_event_ids:
            if audit_by_id.get(parent, False):
                violations.append(_make_violation(
                    RULE_AUDIT_NON_INFLUENCE, ev, "blocking",
                    f"generation event cites audit/feedback event {parent!r} in "
                    f"causation (audit non-influence)",
                    cer_id=ev.event_id,
                ))
    return violations


# ── Rule 3: provenance / causation ────────────────────────────────────


def rule_provenance_causation(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_PROVENANCE_CAUSATION],
) -> List[CIRViolation]:
    """Provenance — dangling or upstream-injecting causation.

    Every ``parent_event_id`` a CER cites must resolve to an event present
    **earlier** in the stream (strictly lower index than the citing event).
    Two distinct violation classes, both ``warning`` severity:

      * **dangling** — the parent id resolves to no event in the stream (an
        ambiguous stream-slice boundary, per T23 Step 5).
      * **upstream injection** — the parent id resolves to an event at or after
        its child (a causal edge pointing forward in time). This is a
        deterministic direction breach (CAUSAL: "no causal edges that inject
        upstream"), not a slice boundary — blocking-eligible after Step 7.

    An event with no parent ids has nothing to resolve, so it is not flagged
    here; the version-lock rule owns the "every CER carries a version" check.
    """
    _check_rule_version(RULE_PROVENANCE_CAUSATION, rule_version)
    materialized = list(events)
    # First-occurrence index per id — a parent resolves temporally iff it
    # appears at an index strictly earlier than the citing event.
    index_by_id: Dict[str, int] = {}
    for idx, ev in enumerate(materialized):
        if ev.event_id and ev.event_id not in index_by_id:
            index_by_id[ev.event_id] = idx

    violations: List[CIRViolation] = []
    for idx, ev in enumerate(materialized):
        if ev.is_audit:
            continue
        for parent in ev.parent_event_ids:
            parent_idx = index_by_id.get(parent)
            if parent_idx is None:
                violations.append(_make_violation(
                    RULE_PROVENANCE_CAUSATION, ev, "warning",
                    f"dangling causation: parent event {parent!r} resolves to no "
                    f"event in the stream",
                    cer_id=ev.event_id,
                ))
            elif parent_idx >= idx:
                violations.append(_make_violation(
                    RULE_PROVENANCE_CAUSATION, ev, "warning",
                    f"upstream injection: parent event {parent!r} appears at or "
                    f"after its child (index {parent_idx} >= {idx})",
                    cer_id=ev.event_id,
                ))
    return violations


# ── Rule 4: version lock ──────────────────────────────────────────────


def rule_version_lock(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_VERSION_LOCK],
) -> List[CIRViolation]:
    """Version lock — a stream must not mix CCNF versions, and every CER
    must carry one.

    Detects replay drift: two CERs in the same stream compiled under different
    CCNF versions cannot have come from one deterministic emission path.
    """
    _check_rule_version(RULE_VERSION_LOCK, rule_version)
    materialized = list(events)
    versions: Dict[int, str] = {}
    first_version: Optional[int] = None
    violations: List[CIRViolation] = []

    for ev in materialized:
        if not ev.is_cer:
            continue
        if ev.unbackfilled:
            continue  # identity-unknown / pre-CER — never fabricate (T23 Step 5)
        if ev.ccnf_version is None:
            violations.append(_make_violation(
                RULE_VERSION_LOCK, ev, "blocking",
                "CER missing ccnf_version (every CER must carry its CCNF version)",
                cer_id=ev.event_id,
            ))
            continue
        if first_version is None:
            first_version = ev.ccnf_version
        versions.setdefault(ev.ccnf_version, ev.event_id)

    # Mixed versions: more than one distinct version present across CERs.
    if len(versions) > 1:
        # Anchor the violation on the first CER that deviates from the
        # stream's first-seen version.
        for ev in materialized:
            if ev.is_cer and ev.ccnf_version is not None \
                    and ev.ccnf_version != first_version:
                violations.append(_make_violation(
                    RULE_VERSION_LOCK, ev, "blocking",
                    f"mixed CCNF versions in stream: saw {first_version} and "
                    f"{ev.ccnf_version} (drift)",
                    cer_id=ev.event_id,
                ))
                break  # one violation per stream is enough for the drift class

    return violations


# ── Rule 5: IR stage separation (IR-CHECK-1) ─────────────────────────


def rule_ir_stage_separation(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_IR_STAGE_SEPARATION],
) -> List[CIRViolation]:
    """IR-CHECK-1 (blocking) — ProjectionIR never feeds Execution edges.

    A ``VISION.IR_PRODUCED`` (ProjectionIR) event must never be a parent of
    an ``EXECUTION.*`` stage event — IR-derived nodes never appear in
    execution edges (CIRS IR family: execution isolation).
    """
    _check_rule_version(RULE_IR_STAGE_SEPARATION, rule_version)
    materialized = list(events)
    ir_ids = {
        ev.event_id for ev in materialized
        if ev.stage == "projection_ir" and ev.event_id
    }
    violations: List[CIRViolation] = []
    for ev in materialized:
        if ev.stage != "execution":
            continue
        for parent in ev.parent_event_ids:
            if parent in ir_ids:
                violations.append(_make_violation(
                    RULE_IR_STAGE_SEPARATION, ev, "blocking",
                    f"EXECUTION stage event cites ProjectionIR event {parent!r} "
                    f"in causation (IR-derived nodes never in execution edges)",
                    cer_id=ev.event_id,
                ))
    return violations


# ── Rule 6: CORE stage separation (CORE-CHECK-1) ────────────────────


def rule_core_stage_separation(
    events: Iterable[CanonicalEvent],
    rule_version: str = RULE_VERSIONS[RULE_CORE_STAGE_SEPARATION],
) -> List[CIRViolation]:
    """CORE-CHECK-1 (blocking) — Synthesis never cites Execution (reverse
    stage flow).

    A ``WORKREQUEST.CREATED`` (Synthesis) event must never cite an
    ``EXECUTION.*`` stage event as a parent — CIRS CORE: Synthesis↔Execution
    separation (no reverse stage flow).
    """
    _check_rule_version(RULE_CORE_STAGE_SEPARATION, rule_version)
    materialized = list(events)
    execution_ids = {
        ev.event_id for ev in materialized
        if ev.stage == "execution" and ev.event_id
    }
    violations: List[CIRViolation] = []
    for ev in materialized:
        if ev.stage != "synthesis":
            continue
        for parent in ev.parent_event_ids:
            if parent in execution_ids:
                violations.append(_make_violation(
                    RULE_CORE_STAGE_SEPARATION, ev, "blocking",
                    f"Synthesis event cites EXECUTION stage event {parent!r} "
                    f"in causation (Synthesis↔Execution separation)",
                    cer_id=ev.event_id,
                ))
    return violations


# ── Orchestration ─────────────────────────────────────────────────────


def evaluate(
    events: Iterable[Any],
    *,
    rule_version: str = "1",
    enforced_rules: FrozenSet[str] = frozenset(),
) -> List[CIRViolation]:
    """Evaluate the full rule family set over an ordered event stream.

    Args:
        events: Ordered list of raw runtime events and/or CERs (mixed allowed).
        rule_version: Requested rule-version generation (all families use the
            same generation; each violation records its family's version).
        enforced_rules: Rule ids whose *blocking*-severity violations should
            carry ``blocking=True``. Default empty = shadow mode (nothing
            blocks — T23 Step 6). The ``CIR_SDM_ENFORCE`` env flag is read by
            the *caller* (enforcement layer), never by this pure function.

    Returns:
        Deterministic list of :class:`CIRViolation`, in stable stream order.
        Re-running the same ``events`` produces identical output.
    """
    normalized = [normalize_event(e) for e in events]

    violations: List[CIRViolation] = []
    violations.extend(rule_one_way_gate(normalized, rule_version))
    violations.extend(rule_audit_non_influence(normalized, rule_version))
    violations.extend(rule_provenance_causation(normalized, rule_version))
    violations.extend(rule_version_lock(normalized, rule_version))
    violations.extend(rule_ir_stage_separation(normalized, rule_version))
    violations.extend(rule_core_stage_separation(normalized, rule_version))

    # Enforcement flag: only blocking-severity rules in the enforced set block.
    return [
        v.with_blocking(v.severity == "blocking" and v.rule_id in enforced_rules)
        for v in violations
    ]
