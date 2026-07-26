"""
Tests for WRP kernel data types (kernel.py).

Four-path coverage per tester-role mandate:
  Green  — create data classes, compute properties, happy path
  Orange — validation guards, expected rejections
  Red    — frozen immutability, design-invariant verification
  Silent — metamorphic: edge cases that could produce plausible-but-wrong results

These types are the canonical Python kernel primitives. They have ZERO
dependencies on conduit or tackle internals. Tests here must remain pure
and not import anything from outside nexus_core.
"""

import os
import sys
import unittest
from dataclasses import FrozenInstanceError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from nexus_core.wrp.kernel import (
    KernelDelta,
    KernelDeltaBatch,
    KernelError,
    KernelResult,
    KernelSnapshot,
)


# ── Green path: creation and properties ───────────────────────────────


class TestKernelDeltaCreation(unittest.TestCase):
    """Green-path: KernelDelta creation with valid fields."""

    def test_minimal_delta(self):
        d = KernelDelta(delta_id="d-1", batch_id="b-1")
        self.assertEqual(d.delta_id, "d-1")
        self.assertEqual(d.batch_id, "b-1")
        self.assertEqual(d.receipts, [])
        self.assertEqual(d.affected_plans, set())
        self.assertEqual(d.invalidated_plans, set())
        self.assertEqual(d.version, 0)

    def test_full_delta(self):
        d = KernelDelta(
            delta_id="d-full",
            batch_id="b-full",
            receipts=[{"type": "PLAN_CREATE", "plan_id": "p1"}],
            affected_plans={"p1", "p2"},
            invalidated_plans={"p3"},
            version=42,
        )
        self.assertEqual(d.delta_id, "d-full")
        self.assertEqual(len(d.receipts), 1)
        self.assertEqual(d.affected_plans, {"p1", "p2"})
        self.assertEqual(d.invalidated_plans, {"p3"})
        self.assertEqual(d.version, 42)

    def test_defaults_are_distinct_instances(self):
        """Default list/set fields should be fresh per instance (no shared mutability)."""
        d1 = KernelDelta(delta_id="a", batch_id="x")
        d2 = KernelDelta(delta_id="b", batch_id="y")
        self.assertIsNot(d1.receipts, d2.receipts)
        self.assertIsNot(d1.affected_plans, d2.affected_plans)
        self.assertIsNot(d1.invalidated_plans, d2.invalidated_plans)


class TestKernelDeltaBatch(unittest.TestCase):
    """Green-path: KernelDeltaBatch creation and computed properties."""

    def test_empty_batch(self):
        batch = KernelDeltaBatch(batch_id="b-empty")
        self.assertEqual(batch.batch_id, "b-empty")
        self.assertEqual(batch.deltas, [])
        self.assertIsNone(batch.source_hash)
        self.assertEqual(batch.total_receipts(), 0)

    def test_batch_with_deltas(self):
        d1 = KernelDelta(delta_id="d1", batch_id="b",
                         receipts=[{"type": "A"}, {"type": "B"}])
        d2 = KernelDelta(delta_id="d2", batch_id="b",
                         receipts=[{"type": "C"}])
        batch = KernelDeltaBatch(
            batch_id="b",
            deltas=[d1, d2],
            source_hash="abc123",
        )
        self.assertEqual(batch.total_receipts(), 3)
        self.assertEqual(batch.source_hash, "abc123")

    def test_total_receipts_is_sum(self):
        """total_receipts() should be the sum across all deltas."""
        deltas = [
            KernelDelta(delta_id=f"d{i}", batch_id="b",
                        receipts=[{}] * i)
            for i in range(5)
        ]
        batch = KernelDeltaBatch(batch_id="b", deltas=deltas)
        self.assertEqual(batch.total_receipts(), 0 + 1 + 2 + 3 + 4)


class TestKernelError(unittest.TestCase):
    """Green-path: KernelError creation and defaults."""

    def test_default_error(self):
        e = KernelError()
        self.assertEqual(e.type, "INVARIANT_VIOLATION")
        self.assertEqual(e.message, "")
        self.assertEqual(e.affected_nodes, [])
        self.assertFalse(e.recoverable)
        self.assertEqual(e.step, "unknown")

    def test_full_error(self):
        e = KernelError(
            type="INVALID_TRANSITION",
            message="Cannot go from COMPLETED to FAILED",
            affected_nodes=["plan-1", "receipt-2"],
            recoverable=True,
            step="reduce_validate",
        )
        self.assertEqual(e.type, "INVALID_TRANSITION")
        self.assertEqual(e.message, "Cannot go from COMPLETED to FAILED")
        self.assertEqual(e.affected_nodes, ["plan-1", "receipt-2"])
        self.assertTrue(e.recoverable)
        self.assertEqual(e.step, "reduce_validate")


class TestKernelResult(unittest.TestCase):
    """Green-path: KernelResult creation and is_ok/is_error."""

    def test_ok_result(self):
        r = KernelResult(value={"state": "ok"}, lineage_event_id="evt-1")
        self.assertTrue(r.is_ok)
        self.assertFalse(r.is_error)
        self.assertEqual(r.value, {"state": "ok"})
        self.assertIsNone(r.error)

    def test_error_result(self):
        e = KernelError(type="GRAPH_CYCLE", message="Cycle detected")
        r = KernelResult(error=e, lineage_event_id="evt-2")
        self.assertFalse(r.is_ok)
        self.assertTrue(r.is_error)
        self.assertIsNone(r.value)
        self.assertEqual(r.error.type, "GRAPH_CYCLE")

    def test_default_result(self):
        r = KernelResult()
        self.assertIsNone(r.value)
        self.assertIsNone(r.error)
        self.assertIsNone(r.lineage_event_id)
        # Both None: not ok (no value) and not error (no error)
        self.assertFalse(r.is_ok)
        self.assertFalse(r.is_error)


class TestKernelSnapshot(unittest.TestCase):
    """Green-path: KernelSnapshot creation."""

    def test_minimal_snapshot(self):
        s = KernelSnapshot(version=1)
        self.assertEqual(s.version, 1)
        self.assertEqual(s.state, {})
        self.assertIsNone(s.identity_hash)
        self.assertIsNone(s.graph_hash)
        self.assertIsNone(s.lineage_cursor)
        self.assertIsNone(s.metadata)

    def test_full_snapshot(self):
        s = KernelSnapshot(
            version=100,
            state={"plans": {"p1": "CREATED"}},
            identity_hash="idhash-1",
            graph_hash="ghash-1",
            lineage_cursor=99,
            metadata={"timestamp": "2026-07-26T00:00:00Z"},
        )
        self.assertEqual(s.version, 100)
        self.assertEqual(s.state, {"plans": {"p1": "CREATED"}})
        self.assertEqual(s.identity_hash, "idhash-1")
        self.assertEqual(s.graph_hash, "ghash-1")
        self.assertEqual(s.lineage_cursor, 99)
        self.assertEqual(s.metadata, {"timestamp": "2026-07-26T00:00:00Z"})


# ── Orange path: validation errors ────────────────────────────────────


class TestKernelDeltaValidation(unittest.TestCase):
    """Orange-path: KernelDelta rejects invalid inputs."""

    def test_empty_delta_id_raises(self):
        with self.assertRaises(ValueError) as ctx:
            KernelDelta(delta_id="", batch_id="b")
        self.assertIn("delta_id", str(ctx.exception).lower())

    def test_negative_version_raises(self):
        with self.assertRaises(ValueError) as ctx:
            KernelDelta(delta_id="d", batch_id="b", version=-1)
        self.assertIn("version", str(ctx.exception).lower())

    def test_zero_version_is_valid(self):
        """Version 0 is the initial version — must be allowed."""
        d = KernelDelta(delta_id="d", batch_id="b", version=0)
        self.assertEqual(d.version, 0)

    def test_empty_batch_id_is_allowed(self):
        """batch_id is not validated (only delta_id is required)."""
        d = KernelDelta(delta_id="d", batch_id="")
        self.assertEqual(d.batch_id, "")


# ── Red path: immutability ────────────────────────────────────────────


class TestKernelDeltaImmutability(unittest.TestCase):
    """Red-path: KernelDelta is frozen — mutation attempts must fail loudly.

    Frozen dataclasses protect against accidental mutation in concurrent
    or retry scenarios. If a KernelDelta can be mutated after creation,
    idempotency guarantees are silently broken.
    """

    def test_cannot_set_attribute(self):
        d = KernelDelta(delta_id="d", batch_id="b")
        with self.assertRaises(FrozenInstanceError):
            d.delta_id = "new-id"

    def test_cannot_set_version(self):
        d = KernelDelta(delta_id="d", batch_id="b", version=5)
        with self.assertRaises(FrozenInstanceError):
            d.version = 10

    def test_cannot_mutate_receipts_via_attribute(self):
        d = KernelDelta(delta_id="d", batch_id="b")
        with self.assertRaises(FrozenInstanceError):
            d.receipts = [{"bad": True}]

    def test_mutable_fields_can_still_be_mutated_in_place(self):
        """GAP: frozen=True only prevents attribute REASSIGNMENT, not
        in-place mutation of mutable field values.

        d.receipts.append(...) silently succeeds — this means a
        "frozen" KernelDelta can be corrupted without any error.
        Frozen dataclasses with mutable default fields are not truly
        immutable unless the mutable values are replaced with tuples
        or frozen types on construction.

        Applies to ALL mutable fields: receipts (list), affected_plans
        (set), and invalidated_plans (set).
        """
        d = KernelDelta(delta_id="d", batch_id="b")
        d.receipts.append({"malicious": True})
        d.affected_plans.add("ghost-plan")
        self.assertEqual(len(d.receipts), 1)
        self.assertEqual(d.receipts[0], {"malicious": True})
        self.assertIn("ghost-plan", d.affected_plans)

    def test_equality(self):
        """Equal deltas should compare equal (structural equality)."""
        d1 = KernelDelta(delta_id="d", batch_id="b", receipts=[{"a": 1}],
                         affected_plans={"p1"}, invalidated_plans={"p2"})
        d2 = KernelDelta(delta_id="d", batch_id="b", receipts=[{"a": 1}],
                         affected_plans={"p1"}, invalidated_plans={"p2"})
        self.assertEqual(d1, d2)

    def test_different_deltas_not_equal(self):
        """Different delta_id = different delta."""
        d1 = KernelDelta(delta_id="d1", batch_id="b")
        d2 = KernelDelta(delta_id="d2", batch_id="b")
        self.assertNotEqual(d1, d2)

    def test_not_hashable(self):
        """GAP: KernelDelta contains unhashable fields (List[dict], Set[str])
        so it cannot be used as a dict key despite being frozen.

        This is a known design trade-off: receipts must be an ordered list
        of dicts, which are unhashable. If hashability is needed (e.g. for
        deduplication sets), consider adding a deterministic hash computed
        from delta_id + version.
        """
        d = KernelDelta(delta_id="d", batch_id="b")
        with self.assertRaises(TypeError):
            hash(d)


class TestKernelErrorImmutability(unittest.TestCase):
    """Red-path: KernelError is frozen — errors must not be silently mutated."""

    def test_cannot_set_type(self):
        e = KernelError(type="INVARIANT_VIOLATION")
        with self.assertRaises(FrozenInstanceError):
            e.type = "GRAPH_CYCLE"

    def test_equality(self):
        e1 = KernelError(type="GRAPH_CYCLE", message="Cycle detected",
                         affected_nodes=["n1"])
        e2 = KernelError(type="GRAPH_CYCLE", message="Cycle detected",
                         affected_nodes=["n1"])
        self.assertEqual(e1, e2)

    def test_not_hashable(self):
        """GAP: KernelError contains unhashable field affected_nodes (List[str])."""
        e = KernelError(affected_nodes=["n1"])
        with self.assertRaises(TypeError):
            hash(e)


class TestKernelDeltaBatchImmutability(unittest.TestCase):
    """Red-path: KernelDeltaBatch is NOT frozen but individual deltas are."""

    def test_delta_in_batch_is_still_frozen(self):
        d = KernelDelta(delta_id="d", batch_id="b")
        batch = KernelDeltaBatch(batch_id="b", deltas=[d])
        with self.assertRaises(FrozenInstanceError):
            batch.deltas[0].version = 999


# ── Silent failure: edge cases that produce plausible-but-wrong results ─


class TestKernelResultInvariant(unittest.TestCase):
    """Silent-failure: KernelResult's documented invariant check.

    The docstring says "Either value or error is set, never both."
    Tests below verify that the is_ok/is_error properties correctly
    handle edge cases, including the "both set" scenario.
    """

    def test_both_set_is_error_not_ok(self):
        """When both value and error are set, is_ok=False, is_error=True.

        is_ok checks: value is not None AND error is None.
        So when both are set, is_ok correctly returns False.
        The error dominates — this is the correct behavior.
        """
        e = KernelError(type="VERSION_MISMATCH")
        r = KernelResult(value={"state": "ok"}, error=e)
        self.assertFalse(r.is_ok)
        self.assertTrue(r.is_error)

    def test_neither_set_is_neither_ok_nor_error(self):
        """Default-constructed result: no value, no error."""
        r = KernelResult()
        self.assertFalse(r.is_ok)
        self.assertFalse(r.is_error)

    def test_only_value_set_is_ok(self):
        r = KernelResult(value={"plans": []})
        self.assertTrue(r.is_ok)
        self.assertFalse(r.is_error)

    def test_only_error_set_is_error(self):
        r = KernelResult(error=KernelError(type="GRAPH_CYCLE"))
        self.assertFalse(r.is_ok)
        self.assertTrue(r.is_error)

    def test_none_value_not_ok(self):
        """None is not a valid value. is_ok should be False."""
        r = KernelResult(value=None, error=None)
        self.assertFalse(r.is_ok)
        self.assertFalse(r.is_error)


class TestKernelDeltaIdempotencyDesign(unittest.TestCase):
    """Silent-failure: verify the design invariant that two deltas with
    same delta_id + receipts compare equal (idempotency promise).

    Equality (not hashability) is what matters for idempotent replay:
    two deltas with the same logical content should be ==.
    """

    def test_same_fields_are_equal(self):
        """Same delta_id, batch_id, receipts, version → equal."""
        r = [{"type": "PLAN_CREATE"}]
        d1 = KernelDelta(delta_id="d", batch_id="b", receipts=r, version=1,
                         affected_plans={"p1"})
        d2 = KernelDelta(delta_id="d", batch_id="b", receipts=r, version=1,
                         affected_plans={"p1"})
        self.assertEqual(d1, d2)

    def test_different_receipts_not_equal(self):
        """Different receipts → not equal."""
        d1 = KernelDelta(delta_id="d", batch_id="b",
                         receipts=[{"type": "PLAN_CREATE"}])
        d2 = KernelDelta(delta_id="d", batch_id="b",
                         receipts=[{"type": "IMPLEMENTATION"}])
        self.assertNotEqual(d1, d2)

    def test_different_version_not_equal(self):
        """Different version → not equal."""
        d1 = KernelDelta(delta_id="d", batch_id="b", version=1)
        d2 = KernelDelta(delta_id="d", batch_id="b", version=2)
        self.assertNotEqual(d1, d2)


if __name__ == "__main__":
    unittest.main()
