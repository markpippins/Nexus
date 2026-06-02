"""
Tests for the semantic projection layer and SemanticProjectionBuilder.

Verifies deterministic, replay-safe projection from IR_EventEnvelope streams
into SemanticProjection artifacts consumed by the context assembler.
"""

import unittest
from graph_models import IR_EventEnvelope, SemanticReplayResult
from semantic_projection import SemanticProjection, SemanticProjectionBuilder
from replay_kernel import ReplayEngine


class TestSemanticProjectionBuilder(unittest.TestCase):
    """Unit tests for SemanticProjectionBuilder.from_envelopes()."""

    # ── Test 1: Added nodes appear in resolved_concepts ──────────────
    def test_added_nodes_in_resolved_concepts(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                added_nodes=["concept_a", "concept_b"],
                schema_version="v1",
                timestep_sequence=1,
            )
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertEqual(proj.resolved_concepts, {"concept_a", "concept_b"})

    # ── Test 2: Removed nodes are absent from resolved_concepts ──────
    def test_removed_nodes_absent(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                added_nodes=["a", "b"],
                timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg2",
                removed_nodes=["a"],
                timestep_sequence=2,
            ),
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertEqual(proj.resolved_concepts, {"b"})

    # ── Test 3: Reintroduced nodes are re-added ──────────────────────
    def test_reintroduced_nodes(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                added_nodes=["a"],
                timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg2",
                removed_nodes=["a"],
                timestep_sequence=2,
            ),
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg3",
                reintroduced_nodes=["a"],
                timestep_sequence=3,
            ),
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertIn("a", proj.resolved_concepts)

    # ── Test 4: Modified nodes are added to resolved_concepts ────────
    def test_modified_nodes_added(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                modified_nodes=["x"],
                timestep_sequence=1,
            )
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertIn("x", proj.resolved_concepts)

    # ── Test 5: Emitted edges are preserved in order ─────────────────
    def test_edges_preserved(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                emitted_edges=[("a", "b")],
                timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg2",
                emitted_edges=[("c", "d")],
                timestep_sequence=2,
            ),
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertEqual(proj.resolves_edges, [("a", "b"), ("c", "d")])

    # ── Test 6: Determinism — same input → same output ───────────────
    def test_determinism(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="msg1",
                added_nodes=["a"],
                emitted_edges=[("x", "y")],
                timestep_sequence=1,
            )
        ]
        p1 = SemanticProjectionBuilder.from_envelopes(envelopes)
        p2 = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertEqual(p1, p2)
        self.assertEqual(p1.resolved_concepts, p2.resolved_concepts)
        self.assertEqual(p1.resolves_edges, p2.resolves_edges)

    # ── Test 7: Multiple trajectories produce merged projection ──────
    def test_multiple_trajectories(self):
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="m1",
                added_nodes=["a"],
                timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t2",
                timestep_msg_id="m2",
                added_nodes=["b"],
                timestep_sequence=2,
            ),
        ]
        proj = SemanticProjectionBuilder.from_envelopes(envelopes)
        self.assertEqual(proj.resolved_concepts, {"a", "b"})

    # ── Test 8: Empty envelopes produce empty projection ─────────────
    def test_empty_envelopes(self):
        proj = SemanticProjectionBuilder.from_envelopes([])
        self.assertEqual(proj.resolved_concepts, set())
        self.assertEqual(proj.resolves_edges, [])


class TestReplayKernelBoundary(unittest.TestCase):
    """Tests verifying replay_kernel.py boundary contract."""

    def test_replay_returns_semantic_result(self):
        engine = ReplayEngine()
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="m1",
                added_nodes=["x"],
                timestep_sequence=1,
            )
        ]
        result = engine.replay("test_run", "v1", envelopes)
        self.assertIsInstance(result, SemanticReplayResult)
        self.assertIsNotNone(result.semantic_projection)
        self.assertIn("x", result.semantic_projection.resolved_concepts)

    def test_semantic_replay_result_has_trajectory_states(self):
        engine = ReplayEngine()
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1",
                timestep_msg_id="m1",
                added_nodes=["x"],
                timestep_sequence=1,
            )
        ]
        result = engine.replay("test_run", "v1", envelopes)
        self.assertIsInstance(result.trajectory_states, dict)


if __name__ == "__main__":
    unittest.main()
