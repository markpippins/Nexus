"""
Reducer-level contract tests: Python WRPProjectionBuilder vs TS reduceToProjection.

These tests verify that the Python reducer produces identical output for
canonical receipt sequences. The TS reducer is the authoritative source;
these tests encode its expected behavior as assertions.

Parity fields tested:
  - wrpState (final resolved state)
  - stateHistory (from_state, to_state, valid for each receipt)
  - appliedReceiptIds (which receipts were applied)
  - skippedReceipts (count of skipped receipts)
  - abstractionLevel / visibilityScope (stratification)
  - errors (error messages for invalid transitions)

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_reducer_parity.py -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from nexus_core.wrp.conduit_wrp_reducer import (
    WRPProjectionBuilder,
    ConduitReceipt,
    sort_receipts,
    receipt_to_wrp_state,
    is_valid_transition,
    determine_abstraction_level,
    level_to_visibility_scope,
)


def _make_receipt(
    plan_id: str,
    seq: int,
    receipt_type: str,
    receipt_id: str = "",
    created_at: str = "2026-01-01T00:00:00Z",
    agent_role: str = "planner",
    summary: str = "",
) -> ConduitReceipt:
    """Helper to create a ConduitReceipt with sensible defaults."""
    return ConduitReceipt(
        plan_id=plan_id,
        sequence=seq,
        created_at=created_at,
        receipt_id=receipt_id or f"r-{plan_id}-{seq:03d}",
        type=receipt_type,
        agent_role=agent_role,
        summary=summary or f"{receipt_type} receipt",
    )


# ══════════════════════════════════════════════════════════════════════
# Canonical receipt sequences with expected outputs
# ══════════════════════════════════════════════════════════════════════


class TestHappyPathLifecycle(unittest.TestCase):
    """Full happy path: CREATED → INTAKE → PLANNING → CRITIQUE →
    SPECIFICATION → APPROVED → QUEUED → EXECUTING → COMPLETED.

    This is the canonical 8-receipt lifecycle. Each receipt must form a
    valid transition with the adjacency matrix.
    """

    @classmethod
    def setUpClass(cls):
        cls.plan_id = "0053"
        cls.receipts = [
            _make_receipt(cls.plan_id, 0, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt(cls.plan_id, 1, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
            _make_receipt(cls.plan_id, 2, "CRITIQUE", created_at="2026-01-01T00:02:00Z"),
            _make_receipt(cls.plan_id, 3, "CRITIQUE_PASS", created_at="2026-01-01T00:03:00Z"),
            _make_receipt(cls.plan_id, 4, "REVIEW", created_at="2026-01-01T00:04:00Z"),
            _make_receipt(cls.plan_id, 5, "HOLD", created_at="2026-01-01T00:05:00Z"),
            _make_receipt(cls.plan_id, 6, "IMPLEMENTATION", created_at="2026-01-01T00:06:00Z"),
            _make_receipt(cls.plan_id, 7, "REVIEW_PASS", created_at="2026-01-01T00:07:00Z"),
        ]
        cls.projection = WRPProjectionBuilder.reduce(
            plan_id=cls.plan_id,
            title="Test Plan 0053",
            project="test-project",
            goal="Test the happy path lifecycle",
            files_affected=["test/file.py"],
            acceptance_criteria=["All tests pass"],
            dependencies=[],
            receipts=cls.receipts,
        )

    def test_final_state_is_completed(self):
        """REVIEW_PASS → COMPLETED."""
        self.assertEqual(self.projection.wrp_state, "COMPLETED")

    def test_all_receipts_applied(self):
        """All 8 receipts should be applied (all transitions are valid)."""
        self.assertEqual(len(self.projection.applied_receipt_ids), 8)
        self.assertEqual(self.projection.skipped_receipts, 0)

    def test_total_receipts_count(self):
        self.assertEqual(self.projection.total_receipts, 8)

    def test_state_history_length(self):
        self.assertEqual(len(self.projection.state_history), 8)

    def test_state_history_trace(self):
        """Verify the exact state trace for the happy path."""
        expected_trace = [
            ("CREATED", "INTAKE", True),        # PLANNING → INTAKE
            ("INTAKE", "PLANNING", True),        # PLAN_CREATE → PLANNING
            ("PLANNING", "CRITIQUE", True),      # CRITIQUE → CRITIQUE
            ("CRITIQUE", "SPECIFICATION", True),  # CRITIQUE_PASS → SPECIFICATION
            ("SPECIFICATION", "APPROVED", True),  # REVIEW → APPROVED
            ("APPROVED", "QUEUED", True),         # HOLD → QUEUED
            ("QUEUED", "EXECUTING", True),        # IMPLEMENTATION → EXECUTING
            ("EXECUTING", "COMPLETED", True),     # REVIEW_PASS → COMPLETED
        ]
        for i, (from_s, to_s, valid) in enumerate(expected_trace):
            event = self.projection.state_history[i]
            self.assertEqual(event.from_state, from_s,
                             f"History[{i}].from_state: expected {from_s}, got {event.from_state}")
            self.assertEqual(event.to_state, to_s,
                             f"History[{i}].to_state: expected {to_s}, got {event.to_state}")
            self.assertEqual(event.valid, valid,
                             f"History[{i}].valid: expected {valid}, got {event.valid}")

    def test_no_errors(self):
        self.assertEqual(len(self.projection.errors), 0)

    def test_not_partial(self):
        self.assertFalse(self.projection.partial)

    def test_incomplete_start_false(self):
        """First receipt has sequence 0 — not incomplete."""
        self.assertFalse(self.projection.incomplete_start)

    def test_abstraction_level(self):
        """COMPLETED state → L3 per determineAbstractionLevel."""
        self.assertEqual(self.projection.abstraction_level, "L3")

    def test_visibility_scope(self):
        """L3 maps to architect."""
        self.assertEqual(self.projection.visibility_scope, "architect")


class TestRejectionAndRework(unittest.TestCase):
    """Rejection path: PLANNING → PLAN_CREATE → CRITIQUE → CRITIQUE_REJECT → PLAN_CREATE.

    The second PLAN_CREATE after rework maps to PLANNING, but PLANNING→PLANNING
    is not a valid transition, so it's skipped (convergence semantics).
    """

    @classmethod
    def setUpClass(cls):
        cls.plan_id = "0060"
        cls.receipts = [
            _make_receipt(cls.plan_id, 0, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt(cls.plan_id, 1, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
            _make_receipt(cls.plan_id, 2, "CRITIQUE", created_at="2026-01-01T00:02:00Z"),
            _make_receipt(cls.plan_id, 3, "CRITIQUE_REJECT", created_at="2026-01-01T00:03:00Z"),
            _make_receipt(cls.plan_id, 4, "PLAN_CREATE", created_at="2026-01-01T00:04:00Z"),
        ]
        cls.projection = WRPProjectionBuilder.reduce(
            plan_id=cls.plan_id,
            title="Rework Plan",
            project="test-project",
            goal="Test rejection and rework",
            files_affected=[],
            acceptance_criteria=[],
            dependencies=[],
            receipts=cls.receipts,
        )

    def test_final_state_is_planning(self):
        """After CRITIQUE_REJECT → PLANNING, then PLAN_CREATE → PLANNING (skipped)."""
        self.assertEqual(self.projection.wrp_state, "PLANNING")

    def test_one_receipt_skipped(self):
        """The 5th receipt (PLAN_CREATE → PLANNING) is skipped because
        PLANNING→PLANNING is not a valid transition.
        """
        self.assertEqual(len(self.projection.applied_receipt_ids), 4)
        self.assertEqual(self.projection.skipped_receipts, 1)
        self.assertEqual(len(self.projection.errors), 1)

    def test_canonical_rework_lifecycle(self):
        """The correct rework sequence produces PLANNING as final state."""
        self.assertEqual(self.projection.wrp_state, "PLANNING")


class TestSkippedReceipt(unittest.TestCase):
    """Receipts that don't form valid transitions are skipped (convergence semantics)."""

    def test_block_from_created_is_skipped(self):
        """BLOCK → FAILED, but CREATED → FAILED is not valid per TS canonical."""
        receipts = [
            _make_receipt("0099", 0, "BLOCK", created_at="2026-01-01T00:00:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0099", title="Block Test", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=receipts,
        )
        # BLOCK maps to FAILED. From CREATED, valid = {INTAKE}. FAILED not in {INTAKE}.
        # So the receipt is skipped. State remains CREATED.
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertEqual(proj.skipped_receipts, 1)
        self.assertEqual(len(proj.applied_receipt_ids), 0)

    def test_implementation_from_created_is_skipped(self):
        """IMPLEMENTATION → EXECUTING, but CREATED → EXECUTING is not valid."""
        receipts = [
            _make_receipt("0100", 0, "IMPLEMENTATION", created_at="2026-01-01T00:00:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0100", title="Impl Test", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertEqual(proj.skipped_receipts, 1)


class TestEmptyReceiptStream(unittest.TestCase):
    """Empty receipt stream produces a partial CREATED projection."""

    def test_empty_produces_partial_created(self):
        proj = WRPProjectionBuilder.reduce(
            plan_id="0101", title="Empty", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=[],
        )
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertTrue(proj.partial)
        self.assertEqual(proj.total_receipts, 0)
        self.assertEqual(proj.skipped_receipts, 0)
        self.assertEqual(len(proj.applied_receipt_ids), 0)


class TestIncompleteStart(unittest.TestCase):
    """Receipts starting with sequence > 0 indicate an incomplete stream."""

    def test_incomplete_start_detected(self):
        receipts = [
            _make_receipt("0102", 5, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt("0102", 6, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0102", title="Incomplete", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=receipts,
        )
        self.assertTrue(proj.incomplete_start)
        self.assertEqual(proj.wrp_state, "PLANNING")


class TestStratificationParity(unittest.TestCase):
    """Verify stratification logic matches TS reduceToProjection."""

    def test_failed_state_gives_l4(self):
        """FAILED state → L4 (cross-system governance boundary)."""
        receipts = [
            _make_receipt("0103", 0, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt("0103", 1, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
            _make_receipt("0103", 2, "BLOCK", created_at="2026-01-01T00:02:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0103", title="Failed", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "FAILED")
        self.assertEqual(proj.abstraction_level, "L4")
        self.assertEqual(proj.visibility_scope, "architect")

    def test_executing_with_files_gives_l2(self):
        """EXECUTING state with files_affected → L2."""
        receipts = [
            _make_receipt("0104", 0, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt("0104", 1, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
            _make_receipt("0104", 2, "CRITIQUE", created_at="2026-01-01T00:02:00Z"),
            _make_receipt("0104", 3, "CRITIQUE_PASS", created_at="2026-01-01T00:03:00Z"),
            _make_receipt("0104", 4, "REVIEW", created_at="2026-01-01T00:04:00Z"),
            _make_receipt("0104", 5, "HOLD", created_at="2026-01-01T00:05:00Z"),
            _make_receipt("0104", 6, "IMPLEMENTATION", created_at="2026-01-01T00:06:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0104", title="Exec", project="p",
            goal="short goal", files_affected=["src/main.py"],
            acceptance_criteria=[], dependencies=[], receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "EXECUTING")
        # EXECUTING is in ("SPECIFICATION", "EXECUTING") → L2
        self.assertEqual(proj.abstraction_level, "L2")
        self.assertEqual(proj.visibility_scope, "all")

    def test_architectural_goal_gives_l3(self):
        """Goal containing 'architecture' → has_architectural_content → L3."""
        receipts = [
            _make_receipt("0105", 0, "PLANNING", created_at="2026-01-01T00:00:00Z"),
            _make_receipt("0105", 1, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0105", title="Arch", project="p",
            goal="Architecture redesign for the system",
            files_affected=[], acceptance_criteria=[], dependencies=[],
            receipts=receipts,
        )
        # PLANNING → L1 by default, but "architecture" in goal → has_architectural_content → L3
        # Wait — PLANNING is not in ("APPROVED", "COMPLETED") so the state check doesn't trigger.
        # But has_architectural_content=True → L3.
        self.assertEqual(proj.abstraction_level, "L3")


class TestReceiptSortingParity(unittest.TestCase):
    """Canonical ordering: (sequence, created_at, receipt_id)."""

    def test_sort_by_sequence(self):
        r1 = _make_receipt("p", 2, "BLOCK", created_at="2026-01-01T00:00:00Z")
        r2 = _make_receipt("p", 0, "PLANNING", created_at="2026-01-01T00:00:00Z")
        r3 = _make_receipt("p", 1, "PLAN_CREATE", created_at="2026-01-01T00:00:00Z")
        sorted_r = sort_receipts([r1, r2, r3])
        self.assertEqual(sorted_r[0].sequence, 0)
        self.assertEqual(sorted_r[1].sequence, 1)
        self.assertEqual(sorted_r[2].sequence, 2)

    def test_sort_by_created_at_when_same_sequence(self):
        r1 = _make_receipt("p", 0, "BLOCK", created_at="2026-01-01T00:02:00Z", receipt_id="r1")
        r2 = _make_receipt("p", 0, "PLANNING", created_at="2026-01-01T00:00:00Z", receipt_id="r2")
        r3 = _make_receipt("p", 0, "PLAN_CREATE", created_at="2026-01-01T00:01:00Z", receipt_id="r3")
        sorted_r = sort_receipts([r1, r2, r3])
        self.assertEqual(sorted_r[0].receipt_id, "r2")  # earliest created_at
        self.assertEqual(sorted_r[1].receipt_id, "r3")
        self.assertEqual(sorted_r[2].receipt_id, "r1")

    def test_sort_by_receipt_id_when_same_sequence_and_time(self):
        r1 = _make_receipt("p", 0, "BLOCK", created_at="2026-01-01T00:00:00Z", receipt_id="r-002")
        r2 = _make_receipt("p", 0, "PLANNING", created_at="2026-01-01T00:00:00Z", receipt_id="r-001")
        sorted_r = sort_receipts([r1, r2])
        self.assertEqual(sorted_r[0].receipt_id, "r-001")
        self.assertEqual(sorted_r[1].receipt_id, "r-002")


class TestMultipleSkippedReceipts(unittest.TestCase):
    """Multiple invalid transitions in a row are all skipped."""

    def test_two_blocks_from_created(self):
        receipts = [
            _make_receipt("0106", 0, "BLOCK", created_at="2026-01-01T00:00:00Z"),
            _make_receipt("0106", 1, "BLOCK", created_at="2026-01-01T00:01:00Z"),
        ]
        proj = WRPProjectionBuilder.reduce(
            plan_id="0106", title="MultiBlock", project="p",
            goal="g", files_affected=[], acceptance_criteria=[],
            dependencies=[], receipts=receipts,
        )
        self.assertEqual(proj.wrp_state, "CREATED")
        self.assertEqual(proj.skipped_receipts, 2)
        self.assertEqual(len(proj.errors), 2)


class TestReceiptToWrpStateParity(unittest.TestCase):
    """Verify every receipt type maps to the same WRP state as the TS canonical."""

    EXPECTED_MAPPINGS = {
        "PLANNING": "INTAKE",
        "PLAN_CREATE": "PLANNING",
        "CRITIQUE": "CRITIQUE",
        "CRITIQUE_PASS": "SPECIFICATION",
        "CRITIQUE_REJECT": "PLANNING",
        "IMPLEMENTATION": "EXECUTING",
        "CCNF_EXECUTION": "EXECUTING",
        "REVIEW": "APPROVED",
        "REVIEW_PASS": "COMPLETED",
        "REVIEW_REJECT": "EXECUTING",
        "BLOCK": "FAILED",
        "PLAN_BLOCK": "FAILED",
        "API_LIMIT": "FAILED",
        "HOLD": "QUEUED",
        "REQUEUED": "QUEUED",
        "CANCELLED": "ARCHIVED",
        "ABANDONED": "FAILED",
    }

    def test_all_mappings_match(self):
        for receipt_type, expected_state in self.EXPECTED_MAPPINGS.items():
            actual = receipt_to_wrp_state(receipt_type)
            self.assertEqual(
                actual, expected_state,
                f"receiptToWrpState('{receipt_type}'): expected '{expected_state}', got '{actual}'",
            )


if __name__ == "__main__":
    unittest.main()
