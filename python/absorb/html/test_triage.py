"""
Tests for the Pipeline Triage Tool (triage.py).

Covers:
  - Fingerprint extraction from each layer
  - Layer comparison (identical vs divergent)
  - Full triage (pass and fail scenarios)
  - Known-drift exemption
  - CLI entry point
"""

import json
import os
import tempfile
import unittest
from dataclasses import dataclass
from typing import Dict, List, Optional, Any

from triage import (
    PipelineSnapshot,
    capture_snapshot,
    fingerprint_snapshot,
    fingerprint_messages,
    fingerprint_graph,
    fingerprint_trajectories,
    fingerprint_projection,
    fingerprint_graph_state,
    fingerprint_ccnf,
    compare_layer,
    LayerDiff,
    triage,
    TriageReport,
    save_snapshot,
    load_snapshot,
    save_report,
    LAYER_ORDER,
)


# ═══════════════════════════════════════════════════════════════════
# Mock objects for testing fingerprint functions
# ═══════════════════════════════════════════════════════════════════

@dataclass
class MockMessage:
    text: str
    speaker: str
    turn_index: int
    id: str = ""


@dataclass
class MockTrajectory:
    id: str
    state: str


@dataclass
class MockGraphState:
    nodes: Dict
    edges: Dict

    def ccnf_hash(self) -> str:
        return "abcdef0123456789"


# ═══════════════════════════════════════════════════════════════════
# Tests: Fingerprint Generation
# ═══════════════════════════════════════════════════════════════════

class TestFingerprints(unittest.TestCase):
    """Each layer produces a stable, hashable fingerprint."""

    def test_fingerprint_messages(self):
        msgs = [
            MockMessage(text="hello", speaker="alice", turn_index=0),
            MockMessage(text="world", speaker="bob", turn_index=1),
        ]
        fp = fingerprint_messages(msgs)
        self.assertEqual(fp["message_count"], 2)
        self.assertEqual(fp["speakers"], ["alice", "bob"])
        self.assertEqual(fp["first_turn"], 0)
        self.assertEqual(fp["last_turn"], 1)

    def test_fingerprint_messages_empty(self):
        fp = fingerprint_messages([])
        self.assertEqual(fp["message_count"], 0)
        self.assertEqual(fp["speakers"], [])

    def test_fingerprint_messages_none(self):
        fp = fingerprint_messages(None)
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_graph(self):
        # Simulate a graph-like object with duck-typing
        class MockGraph:
            messages = {"a": 1, "b": 2}
            relationships = [1, 2, 3]
            concepts = {"x": 1}
            trajectories = {"t1": 1}
            questions = {}
            observations = []

        fp = fingerprint_graph(MockGraph())
        self.assertEqual(fp["nodes"], 2)
        self.assertEqual(fp["edges"], 3)
        self.assertEqual(fp["concepts"], 1)
        self.assertEqual(fp["trajectories"], 1)
        self.assertEqual(fp["questions"], 0)
        self.assertEqual(fp["observations"], 0)

    def test_fingerprint_graph_none(self):
        fp = fingerprint_graph(None)
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_trajectories(self):
        trajs = {
            "t1": MockTrajectory("t1", "active"),
            "t2": MockTrajectory("t2", "active"),
            "t3": MockTrajectory("t3", "completed"),
        }
        fp = fingerprint_trajectories(trajs)
        self.assertEqual(fp["trajectory_count"], 3)
        self.assertEqual(fp["states"]["active"], 2)
        self.assertEqual(fp["states"]["completed"], 1)

    def test_fingerprint_trajectories_none(self):
        fp = fingerprint_trajectories(None)
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_projection(self):
        class MockProjection:
            resolved_concepts = {"a", "b", "c"}
            resolves_edges = [("a", "b")]

        fp = fingerprint_projection(MockProjection())
        self.assertEqual(fp["resolved_concepts"], 3)
        self.assertEqual(fp["resolve_edges"], 1)

    def test_fingerprint_projection_none(self):
        fp = fingerprint_projection(None)
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_graph_state(self):
        gs = MockGraphState(nodes={"a": 1}, edges={("a", "b"): 1})
        fp = fingerprint_graph_state(gs)
        self.assertEqual(fp["node_count"], 1)
        self.assertEqual(fp["edge_count"], 1)
        self.assertEqual(fp["hash"], "abcdef0123456789")

    def test_fingerprint_graph_state_none(self):
        fp = fingerprint_graph_state(None)
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_ccnf(self):
        fp = fingerprint_ccnf("deadbeef01234567")
        self.assertEqual(fp["hash"], "deadbeef01234567")
        self.assertEqual(fp["hash_prefix"], "deadbeef")

    def test_fingerprint_ccnf_empty(self):
        fp = fingerprint_ccnf("")
        self.assertEqual(fp["status"], "not_reached")

    def test_fingerprint_snapshot_returns_all_layers(self):
        snapshot = capture_snapshot(
            transcript_id="test123",
            normalized_messages=[MockMessage("hi", "alice", 0)],
        )
        fps = fingerprint_snapshot(snapshot)
        for layer in LAYER_ORDER:
            self.assertIn(layer, fps)
        # Only messages reached; others not_reached
        self.assertNotEqual(fps["normalized_messages"].get("status"), "not_reached")
        self.assertEqual(fps["graph"]["status"], "not_reached")


# ═══════════════════════════════════════════════════════════════════
# Tests: Layer Comparison
# ═══════════════════════════════════════════════════════════════════

class TestCompareLayer(unittest.TestCase):
    """Comparing fingerprints across two runs."""

    def test_identical(self):
        fp_a = {"nodes": 5, "edges": 3}
        fp_b = {"nodes": 5, "edges": 3}
        diff = compare_layer("graph", fp_a, fp_b)
        self.assertTrue(diff.identical)
        self.assertEqual(diff.score, 1.0)

    def test_different(self):
        fp_a = {"nodes": 5, "edges": 3}
        fp_b = {"nodes": 7, "edges": 3}
        diff = compare_layer("graph", fp_a, fp_b)
        self.assertFalse(diff.identical)
        self.assertIn("nodes", diff.details)

    def test_both_not_reached(self):
        fp_a = {"status": "not_reached"}
        fp_b = {"status": "not_reached"}
        diff = compare_layer("ccnf_hash", fp_a, fp_b)
        self.assertTrue(diff.identical)
        self.assertEqual(diff.score, 1.0)

    def test_one_not_reached(self):
        fp_a = {"status": "not_reached"}
        fp_b = {"hash": "abc"}
        diff = compare_layer("ccnf_hash", fp_a, fp_b)
        self.assertFalse(diff.identical)
        self.assertEqual(diff.score, 0.0)

    def test_known_drift_exempts(self):
        # Both sides have data, but node_count differs and is a known drift.
        # Legacy interpreter reports 0 nodes; projection builder reports 7.
        # The drift table says node_count=0 is expected behavior — exclude it.
        # edge_count still differs and should be reported.
        fp_a = {"node_count": 0, "edge_count": 0}
        fp_b = {"node_count": 7, "edge_count": 3}
        drifts = {
            "graph_state": [
                {"field": "node_count", "expected": 0},
            ]
        }
        diff = compare_layer("graph_state", fp_a, fp_b, known_drifts=drifts)
        # node_count was excluded, but edge_count still differs
        self.assertFalse(diff.identical)
        self.assertEqual(diff.details.get("known_drift_fields_excluded"), 1)
        # The only remaining diff should be edge_count
        self.assertIn("edge_count", diff.details)
        self.assertNotIn("node_count", diff.details)

    def test_known_drift_all_fields_exempted(self):
        # When all differing fields are known drifts, the layer is identical
        fp_a = {"node_count": 0, "edge_count": 0, "hash": "abc"}
        fp_b = {"node_count": 7, "edge_count": 3, "hash": "abc"}
        drifts = {
            "graph_state": [
                {"field": "node_count", "expected": 0},
                {"field": "edge_count", "expected": 0},
            ]
        }
        diff = compare_layer("graph_state", fp_a, fp_b, known_drifts=drifts)
        self.assertTrue(diff.identical, msg=f"diff={diff}")
        self.assertEqual(diff.score, 1.0)


# ═══════════════════════════════════════════════════════════════════
# Tests: Full Triage
# ═══════════════════════════════════════════════════════════════════

class TestTriage(unittest.TestCase):
    """End-to-end triage scenarios."""

    def setUp(self):
        self.expected = PipelineSnapshot(transcript_id="T001")

    def test_pass_all_match(self):
        """When expected and actual are identical, status is PASS."""
        actual = PipelineSnapshot(transcript_id="T001")
        report = triage("T001", self.expected, actual)
        self.assertEqual(report.status, "PASS")
        self.assertEqual(report.confidence, 1.0)

    def test_pass_with_messages(self):
        """All layers identical -> PASS even with data."""
        msgs = [MockMessage(text="a", speaker="s", turn_index=0)]
        expected = capture_snapshot("T001", normalized_messages=msgs)
        actual = capture_snapshot("T001", normalized_messages=msgs)
        report = triage("T001", expected, actual)
        self.assertEqual(report.status, "PASS")

    def test_fail_first_layer_diverges(self):
        """Earliest failing layer is identified as root cause."""
        class MockGraph1:
            messages = {"a": 1}
            relationships = []
            concepts = {}
            trajectories = {}
            questions = {}
            observations = []

        class MockGraph2:
            messages = {"a": 1, "b": 2}  # <-- More nodes than expected
            relationships = []
            concepts = {}
            trajectories = {}
            questions = {}
            observations = []

        expected = capture_snapshot("T002", graph=MockGraph1())
        actual = capture_snapshot("T002", graph=MockGraph2())

        report = triage("T002", expected, actual)
        self.assertEqual(report.status, "FAIL")
        self.assertEqual(report.root_cause["layer"], "graph")
        self.assertEqual(report.root_cause["category"], "GRAPH_BUILDER")
        self.assertGreater(report.confidence, 0)

        # Upstream should have PASS for messages
        self.assertIn("normalized_messages", report.upstream)
        self.assertEqual(report.upstream["normalized_messages"], "PASS")

        # Downstream should be NOT_EVALUATED
        for layer in ["trajectories", "semantic_projection", "graph_state", "ccnf_hash"]:
            self.assertIn(layer, report.downstream)
            self.assertEqual(report.downstream[layer], "NOT_EVALUATED")

    def test_later_layer_failure(self):
        """Failure deep in pipeline still works."""
        expected = capture_snapshot("T003", ccnf_hash="abc")
        actual = capture_snapshot("T003", ccnf_hash="def")
        report = triage("T003", expected, actual)
        self.assertEqual(report.status, "FAIL")
        self.assertEqual(report.root_cause["layer"], "ccnf_hash")
        self.assertEqual(report.root_cause["category"], "CCNF")

    def test_status_messages(self):
        """PASS report has only status and confidence; FAIL has root_cause/upstream/downstream."""
        ok = triage("T001", self.expected, self.expected)
        self.assertFalse(bool(ok.root_cause))
        self.assertFalse(bool(ok.failure))
        self.assertFalse(bool(ok.upstream))
        self.assertFalse(bool(ok.downstream))


# ═══════════════════════════════════════════════════════════════════
# Tests: Serialization
# ═══════════════════════════════════════════════════════════════════

class TestSerialization(unittest.TestCase):
    """Snapshot save/load and report formatting."""

    def test_save_and_load_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "snapshot.json")
            snapshot = capture_snapshot(
                "S001",
                normalized_messages=[MockMessage("x", "bot", 0)],
            )
            save_snapshot(snapshot, path)
            self.assertTrue(os.path.exists(path))

            loaded = load_snapshot(path)
            self.assertEqual(loaded.transcript_id, "S001")

    def test_save_report_json(self):
        report = TriageReport(
            transcript="T001",
            status="FAIL",
            root_cause={"layer": "graph", "category": "GRAPH_BUILDER"},
            confidence=0.85,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "report.json")
            save_report(report, path)
            with open(path) as f:
                data = json.load(f)
            self.assertEqual(data["status"], "FAIL")
            self.assertEqual(data["root_cause"]["layer"], "graph")

    def test_report_to_dict(self):
        report = triage("T001", PipelineSnapshot("T001"), PipelineSnapshot("T001"))
        d = report.to_dict()
        self.assertIn("transcript", d)
        self.assertIn("status", d)
        self.assertIn("root_cause", d)
        self.assertIn("confidence", d)

    def test_report_to_text_pass(self):
        report = triage("T001", PipelineSnapshot("T001"), PipelineSnapshot("T001"))
        text = report.to_text()
        self.assertIn("PASS", text)

    def test_report_to_text_fail(self):
        expected = capture_snapshot("T001", ccnf_hash="abc")
        actual = capture_snapshot("T001", ccnf_hash="xyz")
        report = triage("T001", expected, actual)
        text = report.to_text()
        self.assertIn("FAIL", text)
        self.assertIn("CCNF", text)


# ═══════════════════════════════════════════════════════════════════
# Test: Snapshot Capture Integration
# ═══════════════════════════════════════════════════════════════════

class TestCaptureSnapshot(unittest.TestCase):
    """capture_snapshot extracts correct slots from objects."""

    def test_extracts_trajectories_from_graph(self):
        class MockGraph:
            reconstructed_trajectories = {"t1": MockTrajectory("t1", "active")}
            messages = {}
            relationships = []

        snapshot = capture_snapshot("T001", graph=MockGraph())
        self.assertIsNotNone(snapshot.trajectories)

    def test_empty_ok(self):
        snapshot = capture_snapshot("T001")
        self.assertEqual(snapshot.transcript_id, "T001")
        # normalized_messages through graph_state default to None;
        # ccnf_hash defaults to "" (string type)
        for layer in LAYER_ORDER:
            val = getattr(snapshot, layer)
            if layer == "ccnf_hash":
                self.assertEqual(val, "")
            else:
                self.assertIsNone(val)


# ═══════════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main()
