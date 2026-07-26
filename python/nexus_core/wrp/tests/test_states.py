"""
Tests for the canonical WRP state machine (states.py).

Four-path coverage per tester-role mandate:
  Green  — valid transitions, receipt mapping correctness
  Orange — expected failures (invalid/unknown states, edge inputs)
  Red    — internal consistency, cross-reference integrity
  Silent — metamorphic: different states produce different outputs

The adjacency matrix and receipt-to-state mapping are the CANONICAL Python
source for WRP transitions. Drift between this and the TypeScript canonical
is a CRITICAL finding — cross-language drift is checked by the vocabulary
test suite (tests/vocabulary/checks.py).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from nexus_core.wrp.states import (
    WRP_ADJACENCY_MATRIX,
    RECEIPT_TO_WRP_STATE,
    is_valid_transition,
)


# ── Green path: valid transitions ────────────────────────────────────


class TestValidTransitions(unittest.TestCase):
    """Green-path: the adjacency matrix correctly allows/disallows transitions."""

    def test_created_to_intake(self):
        self.assertTrue(is_valid_transition("CREATED", "INTAKE"))

    def test_created_cannot_transition_to_failed(self):
        """Per TS canonical: CREATED → FAILED is NOT valid."""
        self.assertFalse(is_valid_transition("CREATED", "FAILED"))

    def test_intake_to_planning(self):
        self.assertTrue(is_valid_transition("INTAKE", "PLANNING"))

    def test_intake_to_failed(self):
        self.assertTrue(is_valid_transition("INTAKE", "FAILED"))

    def test_planning_to_critique(self):
        self.assertTrue(is_valid_transition("PLANNING", "CRITIQUE"))

    def test_critique_to_specification(self):
        self.assertTrue(is_valid_transition("CRITIQUE", "SPECIFICATION"))

    def test_critique_back_to_planning(self):
        self.assertTrue(is_valid_transition("CRITIQUE", "PLANNING"))

    def test_specification_to_approved(self):
        self.assertTrue(is_valid_transition("SPECIFICATION", "APPROVED"))

    def test_specification_back_to_critique(self):
        self.assertTrue(is_valid_transition("SPECIFICATION", "CRITIQUE"))

    def test_approved_to_queued(self):
        self.assertTrue(is_valid_transition("APPROVED", "QUEUED"))

    def test_approved_back_to_specification(self):
        self.assertTrue(is_valid_transition("APPROVED", "SPECIFICATION"))

    def test_queued_to_executing(self):
        self.assertTrue(is_valid_transition("QUEUED", "EXECUTING"))

    def test_executing_to_completed(self):
        self.assertTrue(is_valid_transition("EXECUTING", "COMPLETED"))

    def test_completed_to_archived(self):
        self.assertTrue(is_valid_transition("COMPLETED", "ARCHIVED"))

    def test_all_states_can_transition_to_failed(self):
        """Every non-terminal state except CREATED should have a path to FAILED.

        Per TS canonical: CREATED → FAILED is not valid.
        """
        non_terminal = (set(WRP_ADJACENCY_MATRIX.keys())
                        - {"COMPLETED", "FAILED", "ARCHIVED", "CREATED"})
        for state in non_terminal:
            self.assertTrue(
                is_valid_transition(state, "FAILED"),
                f"{state} -> FAILED should be valid",
            )


class TestInvalidTransitions(unittest.TestCase):
    """Green-path: transitions that should NOT be allowed."""

    def test_cannot_skip_from_created_to_executing(self):
        self.assertFalse(is_valid_transition("CREATED", "EXECUTING"))

    def test_cannot_jump_from_intake_to_completed(self):
        self.assertFalse(is_valid_transition("INTAKE", "COMPLETED"))

    def test_completed_cannot_fail(self):
        """COMPLETED is terminal success; FAILED is not reachable from it."""
        self.assertFalse(is_valid_transition("COMPLETED", "FAILED"))

    def test_failed_cannot_transition(self):
        """FAILED is a terminal state — no outgoing edges."""
        for state in WRP_ADJACENCY_MATRIX:
            self.assertFalse(
                is_valid_transition("FAILED", state),
                f"FAILED -> {state} should not be valid",
            )

    def test_archived_cannot_transition(self):
        """ARCHIVED is a terminal state — no outgoing edges."""
        for state in WRP_ADJACENCY_MATRIX:
            self.assertFalse(
                is_valid_transition("ARCHIVED", state),
                f"ARCHIVED -> {state} should not be valid",
            )


class TestReceiptToWrpStateMapping(unittest.TestCase):
    """Green-path: receipt types map to the correct WRP states."""

    def test_plan_create_maps_to_planning(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["PLAN_CREATE"], "PLANNING")

    def test_implementation_maps_to_executing(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["IMPLEMENTATION"], "EXECUTING")

    def test_review_pass_maps_to_completed(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["REVIEW_PASS"], "COMPLETED")

    def test_review_reject_maps_back_to_executing(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["REVIEW_REJECT"], "EXECUTING")

    def test_block_maps_to_failed(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["BLOCK"], "FAILED")

    def test_critique_pass_maps_to_specification(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["CRITIQUE_PASS"], "SPECIFICATION")

    def test_critique_reject_maps_back_to_planning(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["CRITIQUE_REJECT"], "PLANNING")

    def test_ccnf_execution_maps_to_executing(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["CCNF_EXECUTION"], "EXECUTING")

    def test_cancelled_maps_to_archived(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["CANCELLED"], "ARCHIVED")

    def test_abandoned_maps_to_failed(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["ABANDONED"], "FAILED")

    def test_api_limit_maps_to_failed(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["API_LIMIT"], "FAILED")

    def test_hold_maps_to_queued(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["HOLD"], "QUEUED")

    def test_requeued_maps_to_queued(self):
        self.assertEqual(RECEIPT_TO_WRP_STATE["REQUEUED"], "QUEUED")

    def test_planning_receipt_maps_to_intake(self):
        """PLANNING receipt (planner begins work) maps to WRP INTAKE state."""
        self.assertEqual(RECEIPT_TO_WRP_STATE["PLANNING"], "INTAKE")


# ── Orange path: expected failures ────────────────────────────────────


class TestUnknownStates(unittest.TestCase):
    """Orange-path: what happens with states not in the adjacency matrix."""

    def test_unknown_from_state(self):
        """is_valid_transition returns False for unknown from-state, not exception."""
        self.assertFalse(is_valid_transition("UNKNOWN_STATE", "FAILED"))

    def test_unknown_to_state(self):
        """is_valid_transition returns False for unknown to-state, not exception."""
        self.assertFalse(is_valid_transition("CREATED", "UNKNOWN_STATE"))

    def test_empty_string_from_state(self):
        """Empty string from-state should return False cleanly."""
        self.assertFalse(is_valid_transition("", "FAILED"))

    def test_empty_string_to_state(self):
        """Empty string to-state should return False cleanly."""
        self.assertFalse(is_valid_transition("CREATED", ""))

    def test_lowercase_state_fails(self):
        """Case matters: 'created' is not 'CREATED'."""
        self.assertFalse(is_valid_transition("created", "INTAKE"))

    def test_mixed_case_state_fails(self):
        self.assertFalse(is_valid_transition("Created", "Intake"))


class TestReceiptMappingEdgeCases(unittest.TestCase):
    """Orange-path: receipt mapping edge cases."""

    def test_unknown_receipt_type_raises_key_error(self):
        """Unknown receipt types should raise KeyError (fail fast)."""
        with self.assertRaises(KeyError):
            _ = RECEIPT_TO_WRP_STATE["NONEXISTENT_RECEIPT"]

    def test_receipt_map_is_not_empty(self):
        """The receipt-to-state mapping must not be empty."""
        self.assertGreater(len(RECEIPT_TO_WRP_STATE), 0)

    def test_proposed_not_in_receipt_map(self):
        """PROPOSED is a lifecycle event, not a conduit pipeline receipt.

        It should NOT be in RECEIPT_TO_WRP_STATE — only pipeline transition
        receipt types belong here.
        """
        self.assertNotIn("PROPOSED", RECEIPT_TO_WRP_STATE)


# ── Red path: internal consistency, cross-reference integrity ─────────


class TestAdjacencyMatrixConsistency(unittest.TestCase):
    """Red-path: every target in the adjacency matrix must be a valid key.

    A silent failure below: a state could have a transition to a target
    that doesn't exist in the matrix — the transition check would return
    is_valid_transition(from, to)==True but the to-state was never defined,
    meaning it can never be transitioned from.
    """

    def test_all_target_states_are_keys(self):
        """Every target state referenced in values must appear as a key."""
        all_states = set(WRP_ADJACENCY_MATRIX.keys())
        for from_state, targets in WRP_ADJACENCY_MATRIX.items():
            for target in targets:
                self.assertIn(
                    target, all_states,
                    f"'{target}' is a target of '{from_state}' but is not "
                    f"a key in WRP_ADJACENCY_MATRIX — this is a dangling "
                    f"reference that silently allows transitions to "
                    f"undefined states",
                )

    def test_no_self_transitions(self):
        """No state should have a self-loop unless explicitly intended."""
        for state, targets in WRP_ADJACENCY_MATRIX.items():
            self.assertNotIn(
                state, targets,
                f"'{state}' has a self-loop — self-transitions are "
                f"usually a modeling error",
            )

    def test_completed_only_goes_to_archived(self):
        """COMPLETED has exactly one successor: ARCHIVED (auto-archival)."""
        self.assertEqual(WRP_ADJACENCY_MATRIX["COMPLETED"], {"ARCHIVED"})

    def test_failed_has_empty_successors(self):
        """FAILED is terminal failure — no outgoing transitions."""
        self.assertEqual(WRP_ADJACENCY_MATRIX["FAILED"], set())

    def test_archived_has_empty_successors(self):
        """ARCHIVED is terminal archive — no outgoing transitions."""
        self.assertEqual(WRP_ADJACENCY_MATRIX["ARCHIVED"], set())

    def test_every_non_terminal_has_outgoing_edges(self):
        """Every non-terminal state must have at least one outgoing edge."""
        for state, targets in WRP_ADJACENCY_MATRIX.items():
            if state in ("COMPLETED", "FAILED", "ARCHIVED"):
                continue
            self.assertGreater(
                len(targets), 0,
                f"Non-terminal state '{state}' has no outgoing edges — "
                f"it is a dead-end state (cannot progress or fail)",
            )

    def test_state_count_is_eleven(self):
        """The WRP state machine has exactly 10 operational + 1 archived = 11 states."""
        self.assertEqual(
            len(WRP_ADJACENCY_MATRIX), 11,
            f"Expected 11 states, got {len(WRP_ADJACENCY_MATRIX)}: "
            f"{sorted(WRP_ADJACENCY_MATRIX.keys())}",
        )


class TestReceiptToStateConsistency(unittest.TestCase):
    """Red-path: every receipt type must map to a valid WRP state."""

    def test_all_receipt_targets_are_valid_states(self):
        """Every value in RECEIPT_TO_WRP_STATE must be a key in the matrix."""
        valid_states = set(WRP_ADJACENCY_MATRIX.keys())
        for receipt_type, wrp_state in RECEIPT_TO_WRP_STATE.items():
            self.assertIn(
                wrp_state, valid_states,
                f"Receipt '{receipt_type}' maps to '{wrp_state}' which is "
                f"not a valid WRP state — every receipt must land in a "
                f"defined state",
            )


# ── Silent failure: metamorphic / differential testing ───────────────


class TestSilentFailureMetamorphic(unittest.TestCase):
    """Silent-failure: detect bugs where a function runs to completion
    but produces a plausible-but-wrong result.

    The tester-role mandate: for any function that claims to discriminate
    between inputs, feed it two inputs that SHOULD produce different outputs
    and assert the outputs actually differ. A function that always returns
    the same thing for all inputs is silently wrong.
    """

    def test_different_receipts_map_to_different_states(self):
        """If all receipt types map to the same state, the mapping is useless."""
        unique_states = set(RECEIPT_TO_WRP_STATE.values())
        self.assertGreater(
            len(unique_states), 1,
            "All receipt types map to the same WRP state — the mapping "
            "is not actually discriminating between receipts",
        )

    def test_different_from_states_have_different_targets(self):
        """Not all states should have identical successor sets."""
        targets_by_state = {
            s: frozenset(t) for s, t in WRP_ADJACENCY_MATRIX.items()
        }
        unique_target_sets = set(targets_by_state.values())
        self.assertGreater(
            len(unique_target_sets), 1,
            "All states have identical target sets — the state machine "
            "is not actually discriminating between states",
        )

    def test_adjacency_is_not_symmetric(self):
        """Transitions should generally be directional."""
        symmetric = 0
        total = 0
        for s1, targets in WRP_ADJACENCY_MATRIX.items():
            for s2 in targets:
                total += 1
                if s2 in WRP_ADJACENCY_MATRIX and s1 in WRP_ADJACENCY_MATRIX[s2]:
                    symmetric += 1
        # Some bi-directional transitions are expected (CRITIQUE<->PLANNING)
        # but not ALL transitions should be symmetric
        self.assertLess(
            symmetric, total,
            "All transitions are symmetric — the state machine has no "
            "direction, which is almost certainly a modeling error",
        )

    def test_critique_to_planning_is_valid_return_path(self):
        """CRITIQUE->PLANNING and PLANNING->CRITIQUE form a valid rework cycle.

        Note: there are also intentional cycles SPECIFICATION<->CRITIQUE and
        APPROVED<->SPECIFICATION (review/rework loops). These represent the
        iterative nature of the planning-review cycle.
        """
        self.assertTrue(is_valid_transition("CRITIQUE", "PLANNING"))
        self.assertTrue(is_valid_transition("PLANNING", "CRITIQUE"))


class TestTransitionIdempotency(unittest.TestCase):
    """Red-path: is_valid_transition must be deterministic and idempotent."""

    def test_same_inputs_same_result(self):
        """Multiple calls with same args must return the same result."""
        for _ in range(10):
            self.assertTrue(is_valid_transition("CREATED", "INTAKE"))
            self.assertFalse(is_valid_transition("COMPLETED", "FAILED"))

    def test_every_non_terminal_reaches_a_terminal(self):
        """From any non-terminal state, a terminal state should be reachable.

        Uses BFS bounded at 20 hops. If a state can never reach COMPLETED,
        FAILED, or ARCHIVED, the plan can never finish — that's a silent
        design flaw in the state machine.
        """
        terminal = {"COMPLETED", "FAILED", "ARCHIVED"}

        def reachable(from_state, max_depth=20):
            visited = set()
            stack = [from_state]
            while stack and len(visited) < max_depth:
                s = stack.pop()
                if s in visited:
                    continue
                visited.add(s)
                stack.extend(WRP_ADJACENCY_MATRIX.get(s, set()))
            return visited

        for start in WRP_ADJACENCY_MATRIX:
            if start in terminal:
                continue
            r = reachable(start)
            self.assertTrue(
                bool(r & terminal),
                f"From '{start}', no terminal state is reachable — "
                f"the plan can never finish. Reachable: {sorted(r)}",
            )


if __name__ == "__main__":
    unittest.main()
