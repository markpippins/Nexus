"""sol_gate.py — SOL-framed turn-dispatch gate for the cascade subscriber.

Replaces the imperative ``_lease_valid`` / ``_lease_failure_reason`` pair
with a frame-scoped SOL proposition.  The gate now uses the same vocabulary
the resolution schema reasons with — adding a new frame dimension (e.g.
"jurisdiction") to a lease automatically gates dispatch, and the proposition
is auditable from any path (Duality UI, PEB admission, etc.).

Interface is deliberately a drop-in for the old pair::

    from cascade.sol_gate import evaluate_lease_dispatch

    admitted, reason = evaluate_lease_dispatch(lease)
    if not admitted:
        ...  # same shape as _lease_valid / _lease_failure_reason

Built once at module load; each ``evaluate_lease_dispatch()`` call creates a
fresh entity reflecting the caller's lease dict, evaluates against the
singleton proposition, and returns (admitted, reason).
"""

from __future__ import annotations

from typing import Any

# ── Lazy import so sol_gate doesn't import SOLScript until first use ──
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


# ── Fixed IDs (no UUID generation — built once, reused forever) ──────

_LEASE_CONCEPT_ID       = "sol-gate:RoleLease"
_STATUS_ATTR_ID         = "sol-gate:status"
_BUDGET_ATTR_ID         = "sol-gate:budget_units"
_CONSUMED_ATTR_ID       = "sol-gate:consumed_units"
_CHANNEL_DIM_ID         = "sol-gate:channel"
_CHANNEL_INTERACTIVE_ID = "sol-gate:channel:interactive"
_CHANNEL_OPENCODE_ID    = "sol-gate:channel:opencode"
_PROPOSITION_ID         = "sol-gate:may-dispatch-turn"
_FRAME_ID               = "sol-gate:may-dispatch-turn:frame"
_ENTITY_ID              = "sol-gate:dispatch-lease"
_ASSERTION_RULE_ID      = "sol-gate:assertion"
_STATUS_EQ_EXPR_ID      = "sol-gate:expr:status-eq"
_ACTIVE_LIT_EXPR_ID     = "sol-gate:expr:active-lit"
_CONSUMED_REF_EXPR_ID   = "sol-gate:expr:consumed-ref"
_BUDGET_REF_EXPR_ID     = "sol-gate:expr:budget-ref"
_BUDGET_LT_EXPR_ID      = "sol-gate:expr:budget-lt"
_AND_EXPR_ID            = "sol-gate:expr:and"

# ── Singleton state ───────────────────────────────────────────────────

_interp = None   # ResolutionInterpreter
_prop  = None    # Proposition


# ── Builder ───────────────────────────────────────────────────────────

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

    # ── RoleLease concept ─────────────────────────────────────────

    lease_concept = Concept(
        id=_LEASE_CONCEPT_ID,
        name="RoleLease",
        description="Role lease for turn-dispatch gate",
    )
    interp.add_concept(lease_concept)

    status_attr = ConceptAttribute(
        id=_STATUS_ATTR_ID,
        concept_id=_LEASE_CONCEPT_ID,
        name="status",
        description="Lease lifecycle status",
        value_type="text",
        is_state_attribute=True,
        allowed_values=["ACTIVE", "EXPIRED", "RELEASED"],
    )
    lease_concept.attributes[status_attr.id] = status_attr

    budget_attr = ConceptAttribute(
        id=_BUDGET_ATTR_ID,
        concept_id=_LEASE_CONCEPT_ID,
        name="budget_units",
        description="Turn budget granted by the lease",
        value_type="integer",
        is_state_attribute=False,
    )
    lease_concept.attributes[budget_attr.id] = budget_attr

    consumed_attr = ConceptAttribute(
        id=_CONSUMED_ATTR_ID,
        concept_id=_LEASE_CONCEPT_ID,
        name="consumed_units",
        description="Turns consumed against the lease",
        value_type="integer",
        is_state_attribute=False,
    )
    lease_concept.attributes[consumed_attr.id] = consumed_attr

    # ── channel frame dimension ───────────────────────────────────

    channel_dim = FrameDimension(
        id=_CHANNEL_DIM_ID,
        name="channel",
        description="Execution channel the lease authorizes",
        value_kind="governed_reference",
    )
    interp.add_frame_dimension(channel_dim)

    interp.add_frame_dimension_value(FrameDimensionValue(
        id=_CHANNEL_INTERACTIVE_ID,
        dimension_id=_CHANNEL_DIM_ID,
        value="interactive",
    ))
    interp.add_frame_dimension_value(FrameDimensionValue(
        id=_CHANNEL_OPENCODE_ID,
        dimension_id=_CHANNEL_DIM_ID,
        value="opencode",
    ))

    # ── Assertion: status = ACTIVE AND consumed < budget ──────────

    status_eq = Expression(
        id=_STATUS_EQ_EXPR_ID,
        kind=ExpressionKind.OPERATOR,
        operator=Operator.EQ,
        return_type="boolean",
        operands=[
            Expression(
                id="sol-gate:expr:status-ref",
                kind=ExpressionKind.ATTRIBUTE_REF,
                return_type="text",
                attribute_id=_STATUS_ATTR_ID,
            ),
            Expression(
                id=_ACTIVE_LIT_EXPR_ID,
                kind=ExpressionKind.LITERAL,
                return_type="text",
                literal_value="ACTIVE",
            ),
        ],
    )

    budget_lt = Expression(
        id=_BUDGET_LT_EXPR_ID,
        kind=ExpressionKind.OPERATOR,
        operator=Operator.LT,
        return_type="boolean",
        operands=[
            Expression(
                id=_CONSUMED_REF_EXPR_ID,
                kind=ExpressionKind.ATTRIBUTE_REF,
                return_type="integer",
                attribute_id=_CONSUMED_ATTR_ID,
            ),
            Expression(
                id=_BUDGET_REF_EXPR_ID,
                kind=ExpressionKind.ATTRIBUTE_REF,
                return_type="integer",
                attribute_id=_BUDGET_ATTR_ID,
            ),
        ],
    )

    assertion = Rule(
        id=_ASSERTION_RULE_ID,
        name="lease active and budget remaining",
        rule_type=RuleType.INVARIANT,
        expression=Expression(
            id=_AND_EXPR_ID,
            kind=ExpressionKind.OPERATOR,
            operator=Operator.AND,
            return_type="boolean",
            operands=[status_eq, budget_lt],
        ),
        severity=Severity.HARD,
        concept_id=_LEASE_CONCEPT_ID,
    )
    lease_concept.invariants.append(assertion)
    interp.rules[assertion.id] = assertion

    # ── Framed proposition ────────────────────────────────────────

    prop = Proposition(
        id=_PROPOSITION_ID,
        title="role may dispatch turn",
        description="The active lease authorizes a turn dispatch on its channel",
        asset_concept_id=_LEASE_CONCEPT_ID,
        subject_entity_id=_ENTITY_ID,
        disposition=Disposition.PENDING,
        assertions=[assertion],
    )
    interp.add_proposition(prop)

    interp.add_proposition_frame_value(PropositionFrameValue(
        id=_FRAME_ID,
        proposition_id=_PROPOSITION_ID,
        dimension_id=_CHANNEL_DIM_ID,
        reference_value_id=_CHANNEL_INTERACTIVE_ID,
        scalar_value=None,
    ))

    _interp = interp
    _prop = prop


# ── Public API ────────────────────────────────────────────────────────

def evaluate_lease_dispatch(lease: dict[str, Any] | None) -> tuple[bool, str]:
    """Evaluate whether this lease authorizes a turn dispatch.

    Returns ``(admitted, reason)`` — drop-in for ``_lease_valid`` /
    ``_lease_failure_reason``.

    The SOL proposition is framed on ``channel = interactive``, so
    leases from other channels (opencode, ollama) are refused with
    ``context_mismatch``.  Within the interactive channel, the
    assertions check status=ACTIVE and consumed < budget.
    """
    global _interp, _prop

    if _interp is None:
        _build()

    from SOLScript.solscript.models import Entity  # type: ignore[import-untyped]

    # ── Pre-flight: caller passes None → immediate refusal ────────
    if lease is None:
        return (False, "No active role lease")

    # ── Build entity from live lease dict ─────────────────────────
    entity = Entity(
        id=_ENTITY_ID,
        concept_id=_LEASE_CONCEPT_ID,
        attributes={
            "status":        lease.get("status", "EXPIRED"),
            "budget_units":  lease.get("budget_units", 0),
            "consumed_units": lease.get("consumed_units", 0),
        },
        external_id=str(lease.get("id", "")),
    )
    _interp.entities[_ENTITY_ID] = entity

    # ── Evaluate ──────────────────────────────────────────────────
    channel = lease.get("channel", "")
    disposition, all_passed, context_status = _interp.evaluate_proposition(
        _prop,
        context={"channel": channel} if channel else None,
    )

    # ── Translate SOL outcome → (admitted, reason) ────────────────
    if context_status == "context_required":
        return (False, "No active role lease — no channel to scope dispatch")
    if context_status == "context_mismatch":
        return (False,
                f"Role lease channel {channel!r} not authorized — "
                f"dispatch is scoped to channel=interactive")

    # scoped — assertion results determine admission
    if all_passed:
        return (True, "")

    # Build a specific reason mirroring the old _lease_failure_reason
    status = lease.get("status", "")
    if status in ("EXPIRED", "RELEASED"):
        return (False, f"Role lease status={status}")
    budget = lease.get("budget_units") or 0
    consumed = lease.get("consumed_units") or 0
    if budget > 0 and consumed >= budget:
        return (False, f"Role lease exhausted ({consumed}/{budget} units consumed)")
    return (False, "Role lease not valid")


def gate_check(lease: dict[str, Any] | None) -> bool:
    """Convenience: return True when the lease passes the gate.

    Equivalent to the old ``_lease_valid(lease)`` — returns bool only.
    """
    admitted, _ = evaluate_lease_dispatch(lease)
    return admitted