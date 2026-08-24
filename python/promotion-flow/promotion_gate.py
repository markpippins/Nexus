#!/usr/bin/env python3
"""promotion_gate.py — SOL-framed candidate readiness gate (plan 0005 stage 3).

Replaces the imperative ``auto_approve_batch`` / ``planner_has_questions`` /
``batch_is_mature`` trio with a single frame-scoped SOL proposition.  The
planner now *evaluates* rather than *approves*: the gate is deterministic,
replayable, and self-describing via the v35 meaning vocabulary.

Architecture — same pattern as ``cascade/sol_gate.py``::

    from promotion_flow.promotion_gate import evaluate_candidate_ready

    admitted, reason = evaluate_candidate_ready(candidate, thread_id)
    if admitted:
        promote(item, systems)

The SOL proposition ``"candidate is promotion-ready"`` is framed on
``system_mapped = true``, with three assertions:

  1. status NOT IN (promoted, discarded, rejected)
  2. compilation_readiness >= 0.7
  3. no planner questions on the batch thread (pre-flight HTTP check)

Only candidates with a resolvable system_id are eligible — unmapped
candidates fail the frame gate with ``context_mismatch``.
"""

from __future__ import annotations

from typing import Any

import json
import urllib.request

# ── Lazy import — SOLScript is loaded on first use ───────────────────
_IMPORTED = False


def _import_solscript():
    global _IMPORTED
    if _IMPORTED:
        return
    import sys, os
    _parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _parent not in sys.path:
        sys.path.insert(0, _parent)
    _IMPORTED = True


# ── Fixed IDs ───────────────────────────────────────────────────────

_CONCEPT_ID        = "pg:PromotionCandidate"
_STATUS_ATTR_ID    = "pg:status"
_READINESS_ATTR_ID = "pg:compilation_readiness"
_PLANNER_Q_ATTR_ID = "pg:planner_questions"
_DIM_ID            = "pg:system_mapped"
_DIM_TRUE_ID       = "pg:system_mapped:true"
_DIM_FALSE_ID      = "pg:system_mapped:false"
_PROP_ID           = "pg:ready"
_FRAME_ID          = "pg:ready:frame"
_ENTITY_ID         = "pg:candidate"
_RULE_AND_ID       = "pg:rule:and"
_EXPR_AND_ID       = "pg:expr:and"

# ── Assembly target ──────────────────────────────────────────────────

_ASSEMBLY_URL = "http://localhost:3107"
_PLANNER_UUID = "fd49d7c3-3e9c-4c82-8729-967fdef563e4"

# ── Governed threshold (kiro #4 Gap B; ruling 64392cdc) ─────────────
# Active value = latest resolution.governance_threshold row with
# effective_from <= now(). Falls back to the seeded literal when the
# table is absent or the DB is unreachable, so the gate degrades to the
# historical behavior rather than erroring.

_THRESHOLD_NAME = "promotion_min_readiness"
_THRESHOLD_DEFAULT = 0.7
_PSQL = ["docker", "exec", "-i", "pgvector_db",
         "psql", "-U", "pguser", "-d", "nexus", "-t", "-A", "-q"]


def load_min_readiness() -> float:
    """Active promotion_min_readiness from the governed threshold table."""
    import subprocess
    sql = (
        "SELECT value FROM resolution.governance_threshold "
        f"WHERE name='{_THRESHOLD_NAME}' AND effective_from <= now() "
        "ORDER BY effective_from DESC LIMIT 1;"
    )
    try:
        out = subprocess.run(_PSQL + ["-c", sql], capture_output=True,
                             text=True, timeout=10).stdout.strip()
        return float(out) if out else _THRESHOLD_DEFAULT
    except Exception as e:  # table missing / docker down → historical bar
        log_threshold_fallback(e)
        return _THRESHOLD_DEFAULT


def log_threshold_fallback(err: Exception) -> None:
    print(f"[gate] threshold fallback to {_THRESHOLD_DEFAULT}: {err}")


def record_execution_evidence(*, evidence_kind: str, source_system: str,
                              subject_ref: str, payload: dict,
                              context_kind: str = "provenance") -> bool:
    """Append-only provenance write into resolution.execution_evidence.

    Targets the CANONICAL V116-family contract (discovered on V122 apply):
      evidence_key  deterministic unique-while-active key
      source_ref    jsonb carrying the subject pointer(s)
      source_hash   sha256 of the canonical payload -> content-dedup index
                    (source_system, evidence_kind, source_hash) makes repeat
                    checks idempotent via ON CONFLICT DO NOTHING
    Evidence failures are LOGGED but never block the gate decision path.
    """
    import datetime as _dt
    import hashlib
    import subprocess

    canon = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    src_hash = hashlib.sha256(canon.encode()).hexdigest()
    ev_key = f"gate:{evidence_kind}:{subject_ref}:{src_hash[:12]}"
    sql = (
        "INSERT INTO resolution.execution_evidence "
        "(evidence_key, evidence_kind, source_system, source_ref, source_hash,"
        " captured_at, captured_by, context_kind, payload) VALUES ("
        "%(key)s, %(kind)s, %(sys)s, %(ref)s::jsonb, %(hash)s, "
        "now(), %(by)s, %(ctx)s, %(payload)s::jsonb) "
        "ON CONFLICT (source_system, evidence_kind, source_hash) DO NOTHING;"
    ) % {
        "key": _sql_lit(ev_key), "kind": _sql_lit(evidence_kind),
        "sys": _sql_lit(source_system),
        "ref": _sql_lit(json.dumps({"subject": subject_ref})),
        "hash": _sql_lit(src_hash), "by": _sql_lit("engineer-ii/promotion-gate"),
        "ctx": _sql_lit(context_kind), "payload": _sql_lit(canon),
    }
    try:
        r = subprocess.run(_PSQL + ["-c", sql], capture_output=True,
                           text=True, timeout=10)
        if r.returncode != 0:
            print(f"[gate] evidence write failed (non-blocking): "
                  f"{(r.stderr or '').strip()[:200]}")
            return False
        return True
    except Exception as e:
        print(f"[gate] evidence write failed (non-blocking): {e}")
        return False


def _sql_lit(v: str) -> str:
    return "'" + str(v).replace("'", "''") + "'"

_MIN_READINESS = load_min_readiness()   # governed bar (Gap B)

# ── Singleton state ─────────────────────────────────────────────────

_interp = None   # ResolutionInterpreter
_prop  = None    # Proposition


# ── Builder ──────────────────────────────────────────────────────────

def _expr_ref(attr_id: str, return_type: str) -> Any:
    """Build an ATTRIBUTE_REF expression (lazy-imports SOLScript)."""
    from SOLScript.solscript.models import Expression, ExpressionKind  # type: ignore[import-untyped]
    import uuid
    return Expression(
        id=str(uuid.uuid4()),
        kind=ExpressionKind.ATTRIBUTE_REF,
        return_type=return_type,
        attribute_id=attr_id,
    )


def _expr_lit(value: Any, return_type: str) -> Any:
    from SOLScript.solscript.models import Expression, ExpressionKind  # type: ignore[import-untyped]
    import uuid
    return Expression(
        id=str(uuid.uuid4()),
        kind=ExpressionKind.LITERAL,
        return_type=return_type,
        literal_value=value,
    )


def _expr_op(op: Any, return_type: str, *operands: Any) -> Any:
    from SOLScript.solscript.models import Expression, ExpressionKind  # type: ignore[import-untyped]
    import uuid
    return Expression(
        id=str(uuid.uuid4()),
        kind=ExpressionKind.OPERATOR,
        operator=op,
        return_type=return_type,
        operands=list(operands),
    )


def _build() -> None:
    global _interp, _prop

    _import_solscript()
    from SOLScript.solscript import (                   # type: ignore[import-untyped]
        Concept, ConceptAttribute, Entity,
        Expression, ExpressionKind, Operator,
        FrameDimension, FrameDimensionValue,
        Proposition, PropositionFrameValue,
        ResolutionInterpreter, Rule, RuleType, Severity,
        Disposition,
    )

    interp = ResolutionInterpreter()

    # ── PromotionCandidate concept ─────────────────────────────

    concept = Concept(
        id=_CONCEPT_ID,
        name="PromotionCandidate",
        description="Harvest candidate under evaluation for promotion to requirement",
    )
    interp.add_concept(concept)

    status_attr = ConceptAttribute(
        id=_STATUS_ATTR_ID,
        concept_id=_CONCEPT_ID,
        name="status",
        description="Candidate lifecycle status",
        value_type="text",
        is_state_attribute=True,
        allowed_values=["pending", "promoted", "discarded", "rejected"],
    )
    concept.attributes[status_attr.id] = status_attr

    readiness_attr = ConceptAttribute(
        id=_READINESS_ATTR_ID,
        concept_id=_CONCEPT_ID,
        name="compilation_readiness",
        description="CPF compilation readiness score (0.0–1.0)",
        value_type="numeric",
        is_state_attribute=False,
    )
    concept.attributes[readiness_attr.id] = readiness_attr

    planner_q_attr = ConceptAttribute(
        id=_PLANNER_Q_ATTR_ID,
        concept_id=_CONCEPT_ID,
        name="planner_questions",
        description="True when the planner has posted any comment on the batch thread — blocks auto-promotion",
        value_type="boolean",
        is_state_attribute=False,
    )
    concept.attributes[planner_q_attr.id] = planner_q_attr

    # ── system_mapped frame dimension ──────────────────────────

    dim = FrameDimension(
        id=_DIM_ID,
        name="system_mapped",
        description="Whether the candidate has a resolvable system/subsystem mapping",
        value_kind="governed_reference",
    )
    interp.add_frame_dimension(dim)

    interp.add_frame_dimension_value(FrameDimensionValue(
        id=_DIM_TRUE_ID,
        dimension_id=_DIM_ID,
        value="true",
    ))
    interp.add_frame_dimension_value(FrameDimensionValue(
        id=_DIM_FALSE_ID,
        dimension_id=_DIM_ID,
        value="false",
    ))

    # ── Assertion 1: status NOT IN (promoted, discarded, rejected) ─

    status_not_promoted = _expr_op(
        Operator.NEQ,
        "boolean",
        _expr_ref(_STATUS_ATTR_ID, "text"),
        _expr_lit("promoted", "text"),
    )
    status_not_discarded = _expr_op(
        Operator.NEQ,
        "boolean",
        _expr_ref(_STATUS_ATTR_ID, "text"),
        _expr_lit("discarded", "text"),
    )
    status_not_rejected = _expr_op(
        Operator.NEQ,
        "boolean",
        _expr_ref(_STATUS_ATTR_ID, "text"),
        _expr_lit("rejected", "text"),
    )
    status_ok = _expr_op(
        Operator.AND, "boolean",
        _expr_op(Operator.AND, "boolean", status_not_promoted, status_not_discarded),
        status_not_rejected,
    )

    # ── Assertion 2: compilation_readiness >= 0.7 ───────────────

    readiness_ok = _expr_op(
        Operator.GTE,
        "boolean",
        _expr_ref(_READINESS_ATTR_ID, "numeric"),
        _expr_lit(_MIN_READINESS, "numeric"),
    )

    # ── Assertion 3: planner_questions = false ──────────────────

    planner_ok = _expr_op(
        Operator.EQ,
        "boolean",
        _expr_ref(_PLANNER_Q_ATTR_ID, "boolean"),
        _expr_lit(False, "boolean"),
    )

    # ── Composite assertion ─────────────────────────────────────

    readiness_and_status = _expr_op(Operator.AND, "boolean", status_ok, readiness_ok)
    all_checks = _expr_op(Operator.AND, "boolean", readiness_and_status, planner_ok)
    all_checks.id = _EXPR_AND_ID

    rule = Rule(
        id=_RULE_AND_ID,
        name="candidate is ready for promotion",
        rule_type=RuleType.INVARIANT,
        expression=all_checks,
        severity=Severity.HARD,
        concept_id=_CONCEPT_ID,
    )
    concept.invariants.append(rule)
    interp.rules[rule.id] = rule

    # ── Framed proposition ──────────────────────────────────────

    prop = Proposition(
        id=_PROP_ID,
        title="candidate is promotion-ready",
        description=(
            "A harvest candidate qualifies for automatic promotion to "
            "a requirement: status is pending, compilation_readiness >= 0.7, "
            "system mapping is resolvable, and the planner has not raised questions"
        ),
        asset_concept_id=_CONCEPT_ID,
        subject_entity_id=_ENTITY_ID,
        disposition=Disposition.PENDING,
        assertions=[rule],
    )
    interp.add_proposition(prop)

    interp.add_proposition_frame_value(PropositionFrameValue(
        id=_FRAME_ID,
        proposition_id=_PROP_ID,
        dimension_id=_DIM_ID,
        reference_value_id=_DIM_TRUE_ID,
        scalar_value=None,
    ))

    _interp = interp
    _prop = prop


# ── Planner questions check (HTTP — pre-flight, not in SOL) ──────────

def _planner_has_questions(thread_id: str) -> bool:
    """True when the planner has posted ANY comment on the batch thread.

    This is a pre-flight HTTP check rather than a SOL assertion because
    it crosses an external data boundary (Assembly comments).  The result
    feeds into the ``planner_questions`` boolean attribute on the entity.
    """
    import datetime as _dt
    reachable, planner_posted, result = False, False, False
    try:
        url = f"{_ASSEMBLY_URL}/api/forums/threads/{thread_id}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        reachable = True
        comments = data.get("comments") or []
        for c in comments:
            author = c.get("postedById") or (c.get("author") or {}).get("id") or ""
            if author == _PLANNER_UUID:
                planner_posted = True
                break
        result = planner_posted
    except Exception:
        # Gap A hardening (2f31102a): Assembly unreachable now fails
        # CLOSED — treat as "questions exist" so loss of visibility
        # blocks promotion instead of waving it through.
        result = True

    record_execution_evidence(
        evidence_kind="http_preflight",
        source_system="assembly-srv",
        subject_ref=thread_id,
        payload={
            "reachable": reachable,
            "thread_id": thread_id,
            "planner_posted": planner_posted,
            "checked_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
            "fail_closed": not reachable,
        },
    )
    return result


# ── Public API ───────────────────────────────────────────────────────

def evaluate_candidate_ready(
    candidate: dict[str, Any],
    thread_id: str | None = None,
) -> tuple[bool, str]:
    """Evaluate whether a harvest candidate is ready for automatic promotion.

    Returns ``(admitted, reason)``.

    The SOL proposition is framed on ``system_mapped = true``, so
    candidates without a resolvable system mapping are refused with
    ``context_mismatch``.  Within the frame, three assertions are
    checked: status is pending, readiness >= 0.7, and the planner has
    not commented on the thread.
    """
    global _interp, _prop

    if _interp is None:
        _build()

    from SOLScript.solscript.models import Entity  # type: ignore[import-untyped]

    # ── Resolve system mapping ─────────────────────────────────
    # Gap C: identity frame — mapping means a bound system id
    has_mapping = bool(candidate.get("system_id") or candidate.get("systemId")
                       or candidate.get("attributes", {}).get("system_id"))
    system_mapped = "true" if has_mapping else "false"

    # ── Pre-flight: planner questions ──────────────────────────
    planner_q = False
    if thread_id:
        planner_q = _planner_has_questions(thread_id)

    # ── Build entity from live candidate dict ───────────────────
    readiness = candidate.get("compilation_readiness") or candidate.get("readiness") or 0
    status = str(candidate.get("status") or "pending").lower()

    entity = Entity(
        id=_ENTITY_ID,
        concept_id=_CONCEPT_ID,
        attributes={
            "status":                status,
            "compilation_readiness": float(readiness),
            "planner_questions":     planner_q,
        },
        external_id=str(candidate.get("id", "")),
    )
    _interp.entities[_ENTITY_ID] = entity

    # ── Evaluate ───────────────────────────────────────────────
    disposition, all_passed, context_status = _interp.evaluate_proposition(
        _prop,
        context={"system_mapped": system_mapped},
    )

    # ── Translate SOL outcome → (admitted, reason) ─────────────
    if context_status == "context_mismatch":
        return (False,
                f"candidate {candidate.get('id','?')[:8]} has no system mapping — "
                f"MAP required before promotion")

    # scoped — assertion results determine admission
    if all_passed:
        return (True, "")

    # Build specific reasons
    if status in ("promoted", "discarded", "rejected"):
        return (False, f"candidate status={status} — already processed")
    if float(readiness) < _MIN_READINESS:
        return (False,
                f"compilation_readiness {float(readiness):.2f} below {_MIN_READINESS} threshold")
    if planner_q:
        return (False, "planner has questions — explicit approval required")
    return (False, "candidate is not promotion-ready")