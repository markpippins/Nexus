"""
CIR-SDM enforcement caller (T23 Step 7) — per-family enforcement gate.

This is the *enforcement* side of the shadow-mode doctrine: a thin caller
around :func:`nexus_core.wrp.cir_sdm.evaluate` that decides which rule
families are blocking-eligible based on the ``CIR_SDM_ENFORCE`` env flag. The
pure ``evaluate()`` is unchanged — this module only supplies the
``enforced_rules`` set and renders the startup audit state.

Binding contract (architect ruling 4a57c089, 2026-08-16):

1. **Initial enforced set** = ``{"cir-sdm.one-way-gate"}`` — the only family
   with a *measured* zero-FP-blocking window (77-event stream: 2 warnings /
   0 blocking; FN self-check caught; R-A-011). Every other family stays
   shadow until it demonstrates its own zero-FP window and receives explicit
   per-family approval.
2. **``CIR_SDM_ENFORCE`` env flag** (read by the enforcement caller, NEVER
   inside the pure ``evaluate()``):

   * ``"0"``  → ``frozenset()`` — full rollback to shadow (nothing blocks).
   * unset or ``"1"`` (any non-``"0"`` value) → enforced set active.

3. **Warnings never block.** ``blocking=True`` applies only to
   blocking-severity violations in the enforced set (pure-function semantics).
   Cold-start warnings surface for review at dispatch (post + notify), never
   auto-block (R-A-011 fold).
4. **Per-family additions** only via explicit architect decision after a
   measured zero-FP window — this module exposes no mutating API, so there is
   no silent-addition path.
5. **Reject/override** of an enforcement outcome goes through a
   ``type:decision`` thread (owning-role decision, I1/I2) — never a silent
   bypass.

Design (mirrors the zero-dependency rule of ``cir_sdm.py``):

* ``resolve_enforced_rules`` / ``enforce`` are pure functions — the only
  environment input is the ``CIR_SDM_ENFORCE`` value, passed in explicitly by
  the dispatch caller. The module never touches ``os.environ``, keeping it
  cross-kernel-safe and trivially testable.
* ``render_enforcement_state`` produces the startup audit line the dispatch
  service logs once at boot (shadow vs enforced + the active rule set).

Usage (dispatch path)::

    import os
    from nexus_core.wrp.enforcement import (
        ENFORCED_RULES_KEY, enforce, render_enforcement_state,
    )

    env_value = os.environ.get(ENFORCED_RULES_KEY)
    log.info(render_enforcement_state(env_value))   # startup audit line
    violations = enforce(events, env_value=env_value)
"""

from __future__ import annotations

from typing import Any, Dict, FrozenSet, Iterable, List, Optional

from nexus_core.wrp.cir_sdm import (
    CIRViolation,
    RULE_ONE_WAY_GATE,
    evaluate,
)

__all__ = [
    "ENFORCED_RULES_KEY",
    "DEFAULT_ENFORCED_RULES",
    "resolve_enforced_rules",
    "enforce",
    "render_enforcement_state",
    "governed_decisions",
    "violation_to_row",
]

# Env flag the enforcement caller reads (never inside the pure evaluate()).
ENFORCED_RULES_KEY = "CIR_SDM_ENFORCE"

# Initial enforced set (architect ruling 4a57c089): one-way-gate is the only
# family with a measured zero-FP-blocking window. Every other family stays
# shadow until its own window + explicit per-family approval.
DEFAULT_ENFORCED_RULES: FrozenSet[str] = frozenset({RULE_ONE_WAY_GATE})


def resolve_enforced_rules(env_value: Optional[str]) -> FrozenSet[str]:
    """Map the ``CIR_SDM_ENFORCE`` value to the enforced-rule set.

    ``"0"`` → ``frozenset()`` (full rollback to shadow); unset/``None``/
    ``"1"``/any other value → :data:`DEFAULT_ENFORCED_RULES` (enforced
    active). The dispatch caller reads the env and passes the value in; this
    function stays pure.
    """
    if env_value is not None and env_value.strip() == "0":
        return frozenset()
    return DEFAULT_ENFORCED_RULES


def enforce(
    events: Iterable[Any],
    *,
    env_value: Optional[str] = None,
) -> List[CIRViolation]:
    """Evaluate the stream under the resolved per-family enforcement set.

    Thin caller over the pure ``evaluate()``: resolves ``enforced_rules`` from
    the supplied env value and delegates. Warnings never block (``evaluate``
    applies ``blocking=True`` only to blocking-severity violations whose rule
    is in the enforced set), so cold-start and IR-payload warnings surface
    non-blocking even in enforced mode.
    """
    return evaluate(events, enforced_rules=resolve_enforced_rules(env_value))


def render_enforcement_state(env_value: Optional[str]) -> str:
    """Startup audit line — logs shadow vs enforced plus the active rule set.

    The dispatch service logs this once at boot so the enforcement posture is
    auditable (architect caveat 4a57c089). Pure — no I/O, no wall clock.
    """
    rules = resolve_enforced_rules(env_value)
    if not rules:
        return (
            "CIR-SDM enforcement: shadow "
            "(CIR_SDM_ENFORCE=0 — nothing blocks)"
        )
    return (
        "CIR-SDM enforcement: enforced "
        f"(rules: {', '.join(sorted(rules))})"
    )


def governed_decisions(violations: Iterable[CIRViolation]) -> List[CIRViolation]:
    """The blocking violations an enforcement outcome must reject or record.

    A "governed decision" is a blocking violation (``blocking=True``) — the
    dispatch path either rejects the transition or records the decision in
    ``peb.cir_violations``; it never silently alters canonical state (T23
    Step 8). Warnings and shadow-mode violations are excluded: they surface
    for review at dispatch, never auto-block.
    """
    return [v for v in violations if v.blocking]


def violation_to_row(v: CIRViolation) -> Dict[str, Any]:
    """Map a :class:`CIRViolation` to a ``peb.cir_violations`` row dict.

    Pure and deterministic — no DB, no wall clock. ``detected_at`` is the
    offending event's epoch seconds (``0`` → ``None``, the "unknown"
    sentinel); the persistence caller converts it to a ``TIMESTAMPTZ``.
    ``created_at`` is deliberately unset (housekeeping — DB default ``now()``).
    """
    return {
        "violation_id": v.violation_id,
        "cer_id": v.cer_id,
        "event_id": v.event_id,
        "rule_id": v.rule_id,
        "rule_version": v.rule_version,
        "severity": v.severity,
        "description": v.description,
        "detected_at": v.detected_at or None,
        "blocking": v.blocking,
    }
