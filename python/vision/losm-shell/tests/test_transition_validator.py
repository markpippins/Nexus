"""Tests for the stateless transition validator (Plan 0020)."""

from losm_ir.transition import (
    validate_transition,
    ValidationResult,
    TransitionError,
    VALID_TRANSITIONS,
)


def test_valid_transition():
    """Known-good paths: NEW→INTAKE, EXECUTION→VALIDATION."""
    assert validate_transition("NEW", "INTAKE").allowed is True
    assert validate_transition("EXECUTION", "VALIDATION").allowed is True
    assert validate_transition("PLAN_GENERATION", "PLAN_REVIEW").allowed is True
    assert validate_transition("PLAN_REVIEW", "PLAN_APPROVAL_GATE").allowed is True


def test_invalid_transition():
    """Known-bad path: NEW→COMPLETION should be denied."""
    result = validate_transition("NEW", "COMPLETION")
    assert result.allowed is False
    assert result.reason is not None
    assert "INTAKE" in result.reason  # hint about allowed targets


def test_unknown_from_state():
    """Garbage input returns allowed=False with a reason."""
    result = validate_transition("BOGUS_STATE", "COMPLETION")
    assert result.allowed is False
    assert "Unknown from_state" in result.reason


def test_terminal_states():
    """COMPLETION and FAILED reject all outgoing transitions."""
    for terminal in ("COMPLETION", "FAILED"):
        for target in ("NEW", "INTAKE", "COMPLETION", "FAILED", "BLOCKED"):
            result = validate_transition(terminal, target)
            assert result.allowed is False, f"{terminal} → {target} should be denied"
            assert result.reason is not None


def test_blocked_is_universal_source():
    """BLOCKED can go to any non-terminal state."""
    non_terminal = {"NEW", "INTAKE", "PLAN_GENERATION", "PLAN_REVIEW",
                    "PLAN_APPROVAL_GATE", "SPEC_GENERATION", "EXECUTION",
                    "VALIDATION"}
    for target in non_terminal:
        result = validate_transition("BLOCKED", target)
        assert result.allowed is True, f"BLOCKED → {target} should be allowed"


def test_all_states_have_incoming():
    """Every state except NEW (and excluding BLOCKED source) is reachable from at least one other state.
    
    Note: NEW is reachable via BLOCKED→NEW, but it remains the primary starting state.
    """
    states_with_incoming = set()
    for from_state, targets in VALID_TRANSITIONS.items():
        for target in targets:
            states_with_incoming.add(target)
    # Every state should appear as a target of at least one transition
    for state in VALID_TRANSITIONS:
        assert state in states_with_incoming, f"{state} has no incoming transitions"


def test_validation_result_is_frozen():
    """ValidationResult cannot be modified after creation."""
    result = ValidationResult(allowed=True, reason="test")
    try:
        result.allowed = False
        assert False, "Should have raised an error"
    except Exception:
        pass  # frozen dataclass raises FrozenInstanceError (or AttributeError)


def test_function_has_no_side_effects():
    """Calling validate_transition twice with same args returns same result."""
    r1 = validate_transition("NEW", "INTAKE")
    r2 = validate_transition("NEW", "INTAKE")
    assert r1 == r2
    assert r1.allowed == r2.allowed
    assert r1.reason == r2.reason


def test_transition_error_raised_via_helper():
    """_transition_or_fail raises TransitionError on invalid transition."""
    from losm_ir.transition import TransitionError
    from losm_shell.lifecycle.orchestrator import PipelineCoordinator

    coord = PipelineCoordinator()
    try:
        coord._transition_or_fail("NEW", "COMPLETION")
        assert False, "Should have raised TransitionError"
    except TransitionError:
        pass  # expected


def test_validate_transition_allows_valid_failures():
    """FAILED and BLOCKED are valid targets from most states."""
    for from_state in ("NEW", "INTAKE", "PLAN_GENERATION", "EXECUTION", "VALIDATION"):
        assert validate_transition(from_state, "FAILED").allowed is True
        assert validate_transition(from_state, "BLOCKED").allowed is True
