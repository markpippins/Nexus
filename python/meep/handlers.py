"""Handler registry and execution dispatch for the MEEP scheduler.

Each handler is a pure function ``(node_id, config) -> dict`` that
simulates a unit of work.  In v1 all handlers are simulated — they
return a fixed success payload with no side effects.

The registry maps handler name strings (from the ExecutionGraph node's
``handler`` field) to callables.  This indirection allows handlers to
be swapped or replaced in Phase 2+ without changing the scheduler.
"""

from __future__ import annotations

from typing import Any, Callable

# Handler signature: (node_id: str, config: dict) -> dict
HandlerFn = Callable[[str, dict[str, Any]], dict[str, Any]]


# ── Simulated handlers ───────────────────────────────────────────────


def _simulated_handler(node_id: str, config: dict[str, Any]) -> dict[str, Any]:
    """Generic simulated handler — returns success with no side effects."""
    return {
        "status": "ok",
        "node_id": node_id,
        "handler": "simulated",
    }


# ── Handler registry ─────────────────────────────────────────────────
# Maps handler name → handler function.
# All handlers in v1 use the same simulated implementation.

_REGISTRY: dict[str, HandlerFn] = {}

# Register all known handlers from the lowering pass.
_HANDLER_NAMES: tuple[str, ...] = (
    # CONSTRUCTION
    "specify_handler", "construct_handler", "verify_handler",
    # EXECUTION
    "prepare_handler", "execute_handler", "collect_results_handler",
    # REFLECTION
    "gather_context_handler", "analyze_handler", "report_findings_handler",
    # RECONCILIATION
    "identify_conflicts_handler", "propose_resolution_handler",
    "apply_reconciliation_handler",
    # REVISION
    "identify_issue_handler", "plan_change_handler", "apply_change_handler",
    "verify_fix_handler",
    # COUNTERFACTUAL
    "define_scenario_handler", "explore_alternative_handler",
    "compare_outcomes_handler",
    # AUDIT
    "collect_evidence_handler", "evaluate_compliance_handler",
    "report_audit_findings_handler",
    # COMPRESSION
    "scan_input_handler", "extract_key_points_handler",
    "produce_summary_handler",
    # CONSTRAINT_INJECTION
    "analyze_constraints_handler", "modify_behavior_handler",
    "validate_constraints_handler",
    # DEFAULT + fallback
    "clarify_intent_handler", "generic_handler",
)

for _name in _HANDLER_NAMES:
    _REGISTRY[_name] = _simulated_handler


def execute_handler(
    name: str,
    node_id: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Look up *name* in the registry and call it with *node_id*.

    Args:
        name: Handler name (e.g. ``"execute_handler"``).
        node_id: The node being executed.
        config: Optional configuration dict.

    Returns:
        The handler's result dict.

    Raises:
        KeyError: If *name* is not registered.
    """
    if config is None:
        config = {}
    fn = _REGISTRY[name]
    return fn(node_id, config)


def register_handler(name: str, fn: HandlerFn) -> None:
    """Register a custom handler function.

    Used in tests to inject mock handlers, and in Phase 2+ to replace
    simulated handlers with real implementations.
    """
    _REGISTRY[name] = fn


def reset_registry() -> None:
    """Reset the registry to v1 defaults (simulated handlers only).

    Useful for test isolation.
    """
    _REGISTRY.clear()
    for _name in _HANDLER_NAMES:
        _REGISTRY[_name] = _simulated_handler
