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
        _expr_lit(0.7, "numeric"),
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
    try:
        url = f"{_ASSEMBLY_URL}/api/forums/threads/{thread_id}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        comments = data.get("comments") or []
        for c in comments:
            author = c.get("postedById") or (c.get("author") or {}).get("id") or ""
            if author == _PLANNER_UUID:
                return True
        return False
    except Exception:
        # Assembly unreachable → assume no questions (fail-open:
        # loss of Assembly visibility should not block promotion)
        return False


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
    system_name = candidate.get("system_name") or "(none)"
    has_mapping = system_name != "(none)"
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
    if float(readiness) < 0.7:
        return (False,
                f"compilation_readiness {float(readiness):.2f} below 0.7 threshold")
    if planner_q:
        return (False, "planner has questions — explicit approval required")
    return (False, "candidate is not promotion-ready")