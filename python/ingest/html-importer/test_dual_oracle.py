"""
Dual Oracle Tests

Runs legacy EnvelopeInterpreter_V1 path against SemanticProjectionBuilder
on golden fixtures.  Zero-divergence tests gate the final cleanup phase.
"""

import unittest
from dual_oracle_harness import (
    DualReplayHarness,
    SemanticComparator,
    ALL_FIXTURES,
    fixture_simple_linear,
    fixture_cycle_retraction,
    fixture_multi_trajectory,
    fixture_edge_heavy,
    fixture_empty,
    fixture_modified_nodes,
)


class TestDualOracleGoldenFixtures(unittest.TestCase):
    """Golden fixture tests using the dual-oracle harness.

    Divergence may be non-zero where the legacy interpreter lacks
    coverage (e.g. reintroduced_nodes, modified_nodes).  These gaps
    are documented as intentional projection improvements.
    """

    @classmethod
    def setUpClass(cls):
        cls.harness = DualReplayHarness()
        cls.comparator = SemanticComparator()

    def _run_and_compare(self, fixture):
        legacy, projection = self.harness.run(fixture)
        report = self.comparator.compare(legacy, projection)
        report.fixture_name = fixture.name
        return report

    # ── Fixtures expected to have zero divergence ───────────────────

    def test_simple_linear_zero_divergence(self):
        """Legacy and projection should agree on basic add+edge."""
        fixture = fixture_simple_linear()
        report = self._run_and_compare(fixture)
        self.assertEqual(report.divergence_score, 0,
            f"Fixture '{fixture.name}' divergence={report.divergence_score}: "
            f"{report.failure_classification()} | "
            f"missing={report.concept_missing_in_projection} "
            f"extra_concepts={report.concept_extra_in_projection} "
            f"missing_edges={report.edges_missing_in_projection} "
            f"extra_edges={report.edges_extra_in_projection}")

    def test_multi_trajectory_zero_divergence(self):
        """Interleaved trajectories should merge identically."""
        fixture = fixture_multi_trajectory()
        report = self._run_and_compare(fixture)
        self.assertEqual(report.divergence_score, 0,
            f"Fixture '{fixture.name}' divergence={report.divergence_score}")

    def test_edge_heavy_zero_divergence(self):
        """Edge-only events should match."""
        fixture = fixture_edge_heavy()
        report = self._run_and_compare(fixture)
        self.assertEqual(report.divergence_score, 0,
            f"Fixture '{fixture.name}' divergence={report.divergence_score}")

    def test_empty_zero_divergence(self):
        """Empty streams should produce empty results on both paths."""
        fixture = fixture_empty()
        report = self._run_and_compare(fixture)
        self.assertEqual(report.divergence_score, 0,
            f"Fixture '{fixture.name}' divergence={report.divergence_score}")

    # ── Fixtures with known, intentional divergence ─────────────────
    # The legacy interpreter does not handle reintroduced_nodes or
    # modified_nodes.  The projection builder handles both.  These
    # tests document the gap and confirm the projection builder is
    # more complete.

    def test_cycle_retraction_documents_gap(self):
        """Legacy does NOT handle reintroduced_nodes — divergence expected."""
        fixture = fixture_cycle_retraction()
        report = self._run_and_compare(fixture)
        # The legacy interpreter lacks reintroduced_nodes support, so
        # "a" is missing on the legacy side = "extra" in the projection.
        self.assertGreater(report.divergence_score, 0,
            "Expected divergence: legacy interpreter lacks reintroduced_nodes coverage")
        self.assertIn("a", report.concept_extra_in_projection,
            "Projection correctly reintroduces 'a'; legacy missed it")
        self.assertEqual(report.failure_classification(),
            "Type 2: Extra projection concepts — intentional coverage expansion")

    def test_modified_nodes_documents_gap(self):
        """Legacy does NOT handle modified_nodes — divergence expected."""
        fixture = fixture_modified_nodes()
        report = self._run_and_compare(fixture)
        self.assertGreater(report.divergence_score, 0,
            "Expected divergence: legacy interpreter lacks modified_nodes coverage")
        self.assertEqual(report.failure_classification(),
            "Type 2: Extra projection concepts — intentional coverage expansion")


class TestDualOracleDeterminism(unittest.TestCase):
    """Verify both paths are independently deterministic."""

    @classmethod
    def setUpClass(cls):
        cls.harness = DualReplayHarness()
        cls.comparator = SemanticComparator()

    def test_legacy_replay_determinism(self):
        fixture = fixture_simple_linear()
        sorted1 = sorted(fixture.events,
                         key=lambda e: (e.trajectory_id, e.timestep_sequence))
        sorted2 = sorted(fixture.events,
                         key=lambda e: (e.trajectory_id, e.timestep_sequence))
        r1 = self.harness.legacy_interpreter.interpret(sorted1)
        r2 = self.harness.legacy_interpreter.interpret(sorted2)
        # Compare concept sets
        c1 = set()
        c2 = set()
        for closure in r1.values():
            c1 |= closure.resolved_concepts
        for closure in r2.values():
            c2 |= closure.resolved_concepts
        self.assertEqual(c1, c2)

    def test_projection_determinism(self):
        fixture = fixture_simple_linear()
        sorted_events = sorted(
            fixture.events, key=lambda e: (e.trajectory_id, e.timestep_sequence)
        )
        p1 = self.harness.run(fixture)[1]
        # Re-run from scratch to ensure builder is stateless
        from semantic_projection import SemanticProjectionBuilder
        p2 = SemanticProjectionBuilder.from_envelopes(sorted_events)
        self.assertEqual(p1, p2)


if __name__ == "__main__":
    unittest.main()
