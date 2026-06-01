"""
Dual-oracle replay test: legacy interpreter vs SemanticProjection path.

Writes diff artifacts on every run.  CI gates on zero divergence for
fixtures where legacy and projection are expected to match.  Intentional
divergence (reintroduced_nodes, modified_nodes not handled by legacy)
is documented and assertively monitored.
"""

import json
import os
import unittest

from replay_kernel import EnvelopeInterpreter_V1
from semantic_projection import SemanticProjectionBuilder
from replay_fixtures import (
    ALL_FIXTURES,
    fixture_linear_resolution,
    fixture_cycle_retraction,
    fixture_reintroduction,
    fixture_modified_nodes,
    fixture_multi_trajectory,
    fixture_edge_heavy,
    fixture_empty,
    fixture_node_lifecycle_full,
)

ARTIFACT_DIR = os.path.join(
    os.path.dirname(__file__), "artifacts", "semantic_diffs"
)


# ── Normalization helpers ─────────────────────────────────────────

def _normalize_closures(closures):
    """Normalize legacy EnvelopeInterpreter_V1 output → {concepts, edges}."""
    concepts = set()
    edges = set()
    for closure in closures.values():
        concepts |= closure.resolved_concepts
        edges |= set(closure.resolves_edges)
    return concepts, edges


def _normalize_projection(projection):
    """Normalize SemanticProjection → {concepts, edges}."""
    return set(projection.resolved_concepts), set(projection.resolves_edges)


def _compute_diff(legacy_conc, legacy_edges, proj_conc, proj_edges):
    """Compute structured diff between normalized states."""
    return {
        "missing_concepts": sorted(list(legacy_conc - proj_conc)),
        "extra_concepts": sorted(list(proj_conc - legacy_conc)),
        "missing_edges": sorted(list(legacy_edges - proj_edges)),
        "extra_edges": sorted(list(proj_edges - legacy_edges)),
    }


def _write_diff_artifact(fixture_name, diff):
    """Write diff to CI artifact directory."""
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    path = os.path.join(ARTIFACT_DIR, f"{fixture_name}.json")
    with open(path, "w") as f:
        json.dump(diff, f, indent=2)


# ── Fixtures where the legacy interpreter is KNOWN to lack coverage ─
# Legacy EnvelopeInterpreter_V1 does NOT handle:
#   - reintroduced_nodes
#   - modified_nodes
# These fixtures will show intentional "extra concepts" in projection.
LEGACY_GAP_FIXTURES = {
    "reintroduction",      # reintroduced_nodes not handled by legacy
    "modified_nodes",      # modified_nodes not handled by legacy
    "node_lifecycle_full", # reintroduced + modified
}


# ── Test class ─────────────────────────────────────────────────────

class TestDualReplay(unittest.TestCase):
    """Dual-oracle: closure semantics checked against projection semantics."""

    @classmethod
    def setUpClass(cls):
        cls.interpreter = EnvelopeInterpreter_V1()

    def _run_dual(self, fixture):
        """Run both paths and return diff dict."""
        sorted_events = sorted(
            fixture.events,
            key=lambda e: (e.trajectory_id, e.timestep_sequence),
        )
        legacy = self.interpreter.interpret(sorted_events)
        projection = SemanticProjectionBuilder.from_envelopes(sorted_events)

        lc, le = _normalize_closures(legacy)
        pc, pe = _normalize_projection(projection)
        diff = _compute_diff(lc, le, pc, pe)

        _write_diff_artifact(fixture.name, diff)
        return diff

    def _divergence_from_diff(self, diff):
        return sum(len(v) for v in diff.values())

    # ── Zero-divergence fixtures ───────────────────────────────

    def test_linear_resolution(self):
        diff = self._run_dual(fixture_linear_resolution())
        d = self._divergence_from_diff(diff)
        self.assertEqual(d, 0,
            f"linear_resolution divergence={d}: {diff}")

    def test_cycle_retraction(self):
        diff = self._run_dual(fixture_cycle_retraction())
        d = self._divergence_from_diff(diff)
        self.assertEqual(d, 0,
            f"cycle_retraction divergence={d}: {diff}")

    def test_multi_trajectory(self):
        diff = self._run_dual(fixture_multi_trajectory())
        d = self._divergence_from_diff(diff)
        self.assertEqual(d, 0,
            f"multi_trajectory divergence={d}: {diff}")

    def test_edge_heavy(self):
        diff = self._run_dual(fixture_edge_heavy())
        d = self._divergence_from_diff(diff)
        self.assertEqual(d, 0,
            f"edge_heavy divergence={d}: {diff}")

    def test_empty(self):
        diff = self._run_dual(fixture_empty())
        d = self._divergence_from_diff(diff)
        self.assertEqual(d, 0,
            f"empty divergence={d}: {diff}")

    # ── Known-gap fixtures (documented, non-zero divergence OK) ──

    def test_reintroduction_known_gap(self):
        diff = self._run_dual(fixture_reintroduction())
        # Legacy does NOT handle reintroduced_nodes; projection does.
        # Expect extra_concepts but no missing concepts or edge issues.
        self.assertGreater(
            len(diff["extra_concepts"]), 0,
            "Expected projection to include reintroduced node 'A' (legacy lacks this)")
        self.assertEqual(diff["missing_concepts"], [])
        self.assertEqual(diff["missing_edges"], [])
        self.assertEqual(diff["extra_edges"], [])

    def test_modified_nodes_known_gap(self):
        diff = self._run_dual(fixture_modified_nodes())
        # Legacy does NOT handle modified_nodes; projection does.
        self.assertGreater(
            len(diff["extra_concepts"]), 0,
            "Expected projection to include modified node 'X' (legacy lacks this)")
        self.assertEqual(diff["missing_concepts"], [])
        self.assertEqual(diff["missing_edges"], [])
        self.assertEqual(diff["extra_edges"], [])

    def test_node_lifecycle_full_known_gap(self):
        diff = self._run_dual(fixture_node_lifecycle_full())
        # Legacy handles add+remove but NOT modified or reintroduced.
        self.assertGreater(
            len(diff["extra_concepts"]), 0,
            "Expected projection coverage beyond legacy for full lifecycle")
        self.assertEqual(diff["missing_concepts"], [])
        self.assertEqual(diff["missing_edges"], [])
        self.assertEqual(diff["extra_edges"], [])


if __name__ == "__main__":
    unittest.main()
