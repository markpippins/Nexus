"""Tests for the RoleLease frame-scoped evaluation example (v31/v32).

Pins the fail-closed context gate on a "may consume work" proposition:
the claim must refuse (context_required / context_mismatch) unless the
supplied context matches its declared channel frame.
"""

from __future__ import annotations

from solscript import Disposition
from solscript.examples.role_lease import build_role_lease_interpreter


class TestRoleLeaseFrameScope:
    def test_framed_proposition_refuses_without_context(self) -> None:
        interp, prop, _lease = build_role_lease_interpreter()
        disposition, all_passed, status = interp.evaluate_proposition(prop)
        assert disposition is None
        assert all_passed is False
        assert status == "context_required"

    def test_framed_proposition_refuses_on_context_mismatch(self) -> None:
        interp, prop, _lease = build_role_lease_interpreter()
        disposition, all_passed, status = interp.evaluate_proposition(
            prop, context={"channel": "opencode"}
        )
        assert disposition is None
        assert all_passed is False
        assert status == "context_mismatch"

    def test_matching_context_evaluates_to_asserted(self) -> None:
        interp, prop, _lease = build_role_lease_interpreter()
        disposition, all_passed, status = interp.evaluate_proposition(
            prop, context={"channel": "interactive"}
        )
        assert disposition == Disposition.ASSERTED
        assert all_passed is True
        assert status == "scoped"

    def test_matching_context_with_exhausted_budget_rejects(self) -> None:
        interp, prop, lease = build_role_lease_interpreter()
        lease.attributes["consumed_units"] = 5
        disposition, all_passed, status = interp.evaluate_proposition(
            prop, context={"channel": "interactive"}
        )
        assert disposition == Disposition.REJECTED
        assert all_passed is False
        assert status == "scoped"

    def test_unknown_context_key_raises_for_framed_proposition(self) -> None:
        interp, prop, _lease = build_role_lease_interpreter()
        try:
            interp.evaluate_proposition(prop, context={"nonsense": "x"})
        except ValueError as exc:
            assert "names no known frame_dimension" in str(exc)
        else:
            raise AssertionError("expected ValueError for unknown context key")

    def test_refusal_writes_no_disposition(self) -> None:
        interp, prop, _lease = build_role_lease_interpreter()
        before = prop.disposition
        interp.evaluate_proposition(prop)  # context_required refusal
        assert prop.disposition is before


class TestRoleLeaseConsumeTransition:
    def test_consume_guard_blocks_when_budget_exhausted(self) -> None:
        interp, _prop, lease = build_role_lease_interpreter()
        lease.attributes["consumed_units"] = 5
        consume = next(
            t for t in interp.state_transitions.values() if t.name == "consume"
        )
        admitted, results = interp.check_transition_guard(consume, lease)
        assert admitted is False
        assert any(not r["passed"] for r in results)

    def test_consume_guard_admits_with_budget_remaining(self) -> None:
        interp, _prop, lease = build_role_lease_interpreter()
        consume = next(
            t for t in interp.state_transitions.values() if t.name == "consume"
        )
        admitted, _results = interp.check_transition_guard(consume, lease)
        assert admitted is True
