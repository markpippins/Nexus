"""
Tests for the Conduit → WRP projection reducer.

Verifies deterministic, replay-safe projection from Conduit receipt
streams into WRPProjection with stratification and cross-references.

Spec: audit/SPECS/CONDUIT_WRP_BRIDGE.md
Plan: #0174
"""

import unittest
from conduit_wrp_reducer import (
    ConduitReceipt,
    ConduitReceiptType,
    CrossReference,
    StratifiedChunk,
    WRPProjection,
    WRPProjectionBuilder,
    WRPEvent,
    compare_receipts,
    determine_abstraction_level,
    is_valid_transition,
    level_to_visibility_scope,
    receipt_to_wrp_state,
    sort_receipts,
    wrp_state_category,
)


def _receipt(
    type_: str,
    sequence: int = 0,
    created_at: str = "2026-06-27T00:00:00Z",
    receipt_id: str = None,
    plan_id: str = "0174",
) -> ConduitReceipt:
    import uuid
    return ConduitReceipt(
        plan_id=plan_id,
        sequence=sequence,
        created_at=created_at,
        receipt_id=receipt_id or str(uuid.uuid4()),
        type=type_,
        agent_role="planner" if type_ in ("PROPOSED", "PLANNING", "PLAN_CREATE") else "builder",
        summary=f"Receipt {type_} for {plan_id}",
    )


class TestReceiptToWrpState(unittest.TestCase):
    def test_proposed_to_created(self):
        self.assertEqual(receipt_to_wrp_state("PROPOSED"), "CREATED")

    def test_planning_to_intake(self):
        self.assertEqual(receipt_to_wrp_state("PLANNING"), "INTAKE")

    def test_plan_create_to_planning(self):
        self.assertEqual(receipt_to_wrp_state("PLAN_CREATE"), "PLANNING")

    def test_critique_to_critique(self):
        self.assertEqual(receipt_to_wrp_state("CRITIQUE"), "CRITIQUE")

    def test_critique_pass_to_specification(self):
        self.assertEqual(receipt_to_wrp_state("CRITIQUE_PASS"), "SPECIFICATION")

    def test_critique_reject_to_planning(self):
        self.assertEqual(receipt_to_wrp_state("CRITIQUE_REJECT"), "PLANNING")

    def test_implementation_to_executing(self):
        self.assertEqual(receipt_to_wrp_state("IMPLEMENTATION"), "EXECUTING")

    def test_review_to_approved(self):
        self.assertEqual(receipt_to_wrp_state("REVIEW"), "APPROVED")

    def test_review_pass_to_completed(self):
        self.assertEqual(receipt_to_wrp_state("REVIEW_PASS"), "COMPLETED")

    def test_review_reject_to_executing(self):
        self.assertEqual(receipt_to_wrp_state("REVIEW_REJECT"), "EXECUTING")

    def test_block_to_failed(self):
        self.assertEqual(receipt_to_wrp_state("BLOCK"), "FAILED")

    def test_plan_block_to_failed(self):
        self.assertEqual(receipt_to_wrp_state("PLAN_BLOCK"), "FAILED")

    def test_api_limit_to_failed(self):
        self.assertEqual(receipt_to_wrp_state("API_LIMIT"), "FAILED")

    def test_requeued_to_queued(self):
        self.assertEqual(receipt_to_wrp_state("REQUEUED"), "QUEUED")

    def test_cancelled_to_archived(self):
        self.assertEqual(receipt_to_wrp_state("CANCELLED"), "ARCHIVED")

    def test_abandoned_to_failed(self):
        self.assertEqual(receipt_to_wrp_state("ABANDONED"), "FAILED")

    def test_unknown_type_defaults_to_created(self):
        self.assertEqual(receipt_to_wrp_state("UNKNOWN"), "CREATED")


class TestIsValidTransition(unittest.TestCase):
    def test_created_to_intake_valid(self):
        self.assertTrue(is_valid_transition("CREATED", "INTAKE"))

    def test_created_to_planning_invalid(self):
        self.assertFalse(is_valid_transition("CREATED", "PLANNING"))

    def test_intake_to_planning_valid(self):
        self.assertTrue(is_valid_transition("INTAKE", "PLANNING"))

    def test_executing_to_completed_valid(self):
        self.assertTrue(is_valid_transition("EXECUTING", "COMPLETED"))

    def test_completed_to_archived_valid(self):
        self.assertTrue(is_valid_transition("COMPLETED", "ARCHIVED"))

    def test_terminal_has_no_outgoing(self):
        for state in ("COMPLETED", "ARCHIVED", "FAILED"):
            with self.subTest(state=state):
                self.assertFalse(is_valid_transition(state, "CREATED"))

    def test_created_cannot_fail_directly(self):
        self.assertFalse(is_valid_transition("CREATED", "FAILED"))

    def test_active_states_can_fail(self):
        for state in ("INTAKE", "PLANNING", "CRITIQUE",
                       "SPECIFICATION", "APPROVED", "QUEUED", "EXECUTING"):
            with self.subTest(state=state):
                self.assertTrue(is_valid_transition(state, "FAILED"))


class TestWrpStateCategory(unittest.TestCase):
    def test_created_is_initial(self):
        self.assertEqual(wrp_state_category("CREATED"), "initial")

    def test_active_states(self):
        for state in ("INTAKE", "PLANNING", "CRITIQUE", "SPECIFICATION",
                       "QUEUED", "EXECUTING"):
            with self.subTest(state=state):
                self.assertEqual(wrp_state_category(state), "active")

    def test_approved_is_gate(self):
        self.assertEqual(wrp_state_category("APPROVED"), "gate")

    def test_terminal_states(self):
        for state in ("COMPLETED", "ARCHIVED", "FAILED"):
            with self.subTest(state=state):
                self.assertEqual(wrp_state_category(state), "terminal")


class TestCanonicalOrdering(unittest.TestCase):
    def test_sort_by_sequence(self):
        a = _receipt("PROPOSED", sequence=1)
        b = _receipt("PLAN_CREATE", sequence=0)
        result = sort_receipts([a, b])
        self.assertEqual(result[0].sequence, 0)
        self.assertEqual(result[1].sequence, 1)

    def test_sort_by_created_at(self):
        a = _receipt("PROPOSED", sequence=0, created_at="2026-06-27T02:00:00Z")
        b = _receipt("PLAN_CREATE", sequence=0, created_at="2026-06-27T01:00:00Z")
        result = sort_receipts([a, b])
        self.assertEqual(result[0].created_at, "2026-06-27T01:00:00Z")

    def test_sort_tiebreaker_by_id(self):
        a = _receipt("PROPOSED", sequence=0, receipt_id="b-0001")
        b = _receipt("PLAN_CREATE", sequence=0, receipt_id="a-0001")
        result = sort_receipts([a, b])
        self.assertLess(result[0].receipt_id, result[1].receipt_id)

    def test_empty_list(self):
        self.assertEqual(sort_receipts([]), [])


class TestDetermineAbstractionLevel(unittest.TestCase):
    def test_l1_early_states(self):
        for state in ("CREATED", "INTAKE", "PLANNING", "CRITIQUE", "QUEUED"):
            with self.subTest(state=state):
                self.assertEqual(determine_abstraction_level(state), "L1")

    def test_l2_structural_states(self):
        for state in ("SPECIFICATION", "EXECUTING"):
            with self.subTest(state=state):
                self.assertEqual(determine_abstraction_level(state), "L2")

    def test_l3_archival_states(self):
        for state in ("APPROVED", "COMPLETED"):
            with self.subTest(state=state):
                self.assertEqual(determine_abstraction_level(state), "L3")

    def test_l4_terminal_exception_states(self):
        for state in ("ARCHIVED", "FAILED"):
            with self.subTest(state=state):
                self.assertEqual(determine_abstraction_level(state), "L4")

    def test_l4_cross_system_impact(self):
        level = determine_abstraction_level("EXECUTING", has_cross_system_impact=True)
        self.assertEqual(level, "L4")

    def test_l3_architectural_content(self):
        level = determine_abstraction_level("PLANNING", has_architectural_content=True)
        self.assertEqual(level, "L3")

    def test_l2_structural_content(self):
        level = determine_abstraction_level("PLANNING", has_structural_content=True)
        self.assertEqual(level, "L2")


class TestLevelToVisibilityScope(unittest.TestCase):
    def test_l1_builder(self):
        self.assertEqual(level_to_visibility_scope("L1"), "builder")

    def test_l2_all(self):
        self.assertEqual(level_to_visibility_scope("L2"), "all")

    def test_l3_architect(self):
        self.assertEqual(level_to_visibility_scope("L3"), "architect")

    def test_l4_architect(self):
        self.assertEqual(level_to_visibility_scope("L4"), "architect")


class TestWRPProjectionBuilder(unittest.TestCase):
    def test_empty_receipts_creates_partial_projection(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174",
            title="Test",
            project="nexus",
            goal="",
            files_affected=[],
            acceptance_criteria=[],
            dependencies=[],
            receipts=[],
        )
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertTrue(proj.partial)
        self.assertEqual(proj.total_receipts, 0)

    def test_single_proposed_receipt(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174",
            title="Test",
            project="nexus",
            goal="",
            files_affected=[],
            acceptance_criteria=[],
            dependencies=[],
            receipts=[_receipt("PROPOSED", sequence=0)],
        )
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertEqual(proj.total_receipts, 1)

    def test_full_lifecycle(self):
        receipts = [
            _receipt("PROPOSED", sequence=0),      # → CREATED (self-loop, skipped)
            _receipt("PLANNING", sequence=1),        # CREATED → INTAKE
            _receipt("PLAN_CREATE", sequence=2),     # INTAKE → PLANNING
            _receipt("CRITIQUE", sequence=3),        # PLANNING → CRITIQUE
            _receipt("CRITIQUE_PASS", sequence=4),   # CRITIQUE → SPECIFICATION
            _receipt("REVIEW", sequence=5),          # SPECIFICATION → APPROVED
            _receipt("REQUEUED", sequence=6),        # APPROVED → QUEUED
            _receipt("IMPLEMENTATION", sequence=7),  # QUEUED → EXECUTING
            _receipt("REVIEW_PASS", sequence=8),     # EXECUTING → COMPLETED
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174",
            title="Lifecycle Test",
            project="nexus",
            goal="Test full lifecycle",
            files_affected=["file_a.py"],
            acceptance_criteria=["AC1", "AC2"],
            dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "COMPLETED")
        self.assertEqual(proj.total_receipts, 9)
        self.assertFalse(proj.partial)

    def test_invalid_transitions_are_skipped(self):
        receipts = [
            _receipt("PLANNING", sequence=0),        # CREATED → INTAKE (valid)
            _receipt("PLAN_CREATE", sequence=1),     # INTAKE → PLANNING (valid)
            _receipt("PROPOSED", sequence=2),        # PLANNING → CREATED (invalid)
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174",
            title="Skip Test",
            project="nexus",
            goal="",
            files_affected=[],
            acceptance_criteria=[],
            dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "PLANNING")
        self.assertEqual(proj.skipped_receipts, 1)
        self.assertEqual(len(proj.errors), 1)

    def test_determinism(self):
        receipts = [
            _receipt("PROPOSED", sequence=0),
            _receipt("PLANNING", sequence=1),
            _receipt("PLAN_CREATE", sequence=2),
        ]
        p1 = WRPProjectionBuilder.reduce(
            plan_id="0174", title="D", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        p2 = WRPProjectionBuilder.reduce(
            plan_id="0174", title="D", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(p1.wrp_state, p2.wrp_state)
        self.assertEqual(p1.applied_receipt_ids, p2.applied_receipt_ids)
        self.assertEqual(p1.errors, p2.errors)

    def test_state_history_length(self):
        receipts = [
            _receipt("PROPOSED", sequence=0),
            _receipt("PLANNING", sequence=1),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="H", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(len(proj.state_history), 2)

    def test_applied_receipt_ids(self):
        receipts = [
            _receipt("PLANNING", sequence=0, receipt_id="aaa-001"),     # CREATED→INTAKE (applied)
            _receipt("PLAN_CREATE", sequence=1, receipt_id="bbb-002"),  # INTAKE→PLANNING (applied)
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="A", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertIn("aaa-001", proj.applied_receipt_ids)
        self.assertIn("bbb-002", proj.applied_receipt_ids)
        self.assertEqual(len(proj.applied_receipt_ids), 2)

    def test_state_history_tracks_valid_flag(self):
        receipts = [
            _receipt("PROPOSED", sequence=0),        # Invalid: CREATED→CREATED (self-loop)
            _receipt("PLANNING", sequence=1),         # Valid: CREATED→INTAKE
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="V", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(proj.state_history[0].valid, False)  # CREATED→CREATED self-loop invalid
        self.assertEqual(proj.state_history[1].valid, True)   # CREATED→INTAKE valid

    def test_incomplete_start_flag(self):
        receipts = [
            _receipt("PLANNING", sequence=1),  # Not starting at 0
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="I", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertTrue(proj.incomplete_start)

    def test_chunks_includes_overview(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="Chunk Test", project="nx", goal="A goal",
            files_affected=["f1"], acceptance_criteria=["AC1"], dependencies=[],
            receipts=[_receipt("PROPOSED", sequence=0)],
        )
        kinds = [c.chunk_kind for c in proj.chunks]
        self.assertIn("OVERVIEW", kinds)
        self.assertIn("DEFINITION", kinds)
        self.assertIn("CONFIGURATION", kinds)
        self.assertIn("CONSTRAINTS", kinds)

    def test_failed_state_adds_error_chunk(self):
        receipts = [
            _receipt("PLANNING", sequence=0),   # CREATED → INTAKE
            _receipt("BLOCK", sequence=1),       # INTAKE → FAILED
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="F", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        kinds = [c.chunk_kind for c in proj.chunks]
        self.assertIn("ERROR", kinds)

    def test_cross_references_from_dependencies(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="X", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=["0161", "#0181"],
            receipts=[_receipt("PROPOSED", sequence=0)],
        )
        self.assertEqual(len(proj.cross_references), 2)
        for ref in proj.cross_references:
            self.assertEqual(ref.rel_type, "wrp:depends_on")
            self.assertEqual(ref.source_id, "0174")


class TestWRPProjectionDataclass(unittest.TestCase):
    def test_immutable_fields(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="T", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=[_receipt("PROPOSED", sequence=0)],
        )
        self.assertIsInstance(proj, WRPProjection)
        self.assertEqual(proj.plan_id, "0174")

    def test_error_format(self):
        receipts = [
            _receipt("PLANNING", sequence=0),       # CREATED → INTAKE (valid → no error)
            _receipt("IMPLEMENTATION", sequence=1),  # INTAKE → EXECUTING (invalid)
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0174", title="E", project="nx", goal="",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        self.assertEqual(len(proj.errors), 1)
        err = proj.errors[0]
        self.assertIn("receiptId", err)
        self.assertIn("message", err)
        self.assertGreater(len(err["message"]), 0)


if __name__ == "__main__":
    unittest.main()
