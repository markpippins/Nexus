"""Tests for the Dual Oracle Test Harness.

Validates that SemanticProjectionBuilder produces deterministic,
correct output for all golden fixtures. Zero divergence is required
for all fixtures.
"""

import pytest

from dual_oracle_harness import (
    ProjectionReplayHarness, SemanticComparator,
    ALL_FIXTURES, FIXTURE_EXPECTATIONS,
    fixture_simple_linear, fixture_cycle_retraction,
    fixture_multi_trajectory, fixture_edge_heavy, fixture_empty,
    fixture_modified_nodes,
    run_all_fixtures,
)
from semantic_projection import SemanticProjection, SemanticProjectionBuilder


class TestGoldenFixtures:
    """Golden fixture tests — must have zero divergence from expected."""

    @classmethod
    def setup_class(cls):
        cls.harness = ProjectionReplayHarness()
        cls.comparator = SemanticComparator()

    def _run_and_compare(self, fixture):
        projection = self.harness.run(fixture)
        expected_concepts, expected_edges = FIXTURE_EXPECTATIONS[fixture.name]()
        report = self.comparator.compare(projection, expected_concepts, expected_edges)
        report.fixture_name = fixture.name
        return report

    @pytest.mark.parametrize("fixture", ALL_FIXTURES, ids=lambda f: f.name)
    def test_fixture_zero_divergence(self, fixture):
        report = self._run_and_compare(fixture)
        assert report.divergence_score == 0, (
            f"Divergence in fixture '{fixture.name}' (score={report.divergence_score}):\n"
            f"  {report.failure_classification()}\n"
            f"  Missing concepts: {report.concept_missing}\n"
            f"  Extra concepts: {report.concept_extra}\n"
            f"  Missing edges: {report.edges_missing}\n"
            f"  Extra edges: {report.edges_extra}"
        )


class TestDeterminism:
    """Verify projection is deterministic — same input → same output."""

    @classmethod
    def setup_class(cls):
        cls.harness = ProjectionReplayHarness()

    def test_simple_linear_determinism(self):
        fixture = fixture_simple_linear()
        p1 = self.harness.run(fixture)
        p2 = self.harness.run(fixture)
        assert p1 == p2
        assert p1.resolved_concepts == p2.resolved_concepts
        assert p1.resolves_edges == p2.resolves_edges

    def test_cycle_retraction_determinism(self):
        fixture = fixture_cycle_retraction()
        p1 = self.harness.run(fixture)
        p2 = self.harness.run(fixture)
        assert p1 == p2

    def test_multi_trajectory_determinism(self):
        fixture = fixture_multi_trajectory()
        p1 = self.harness.run(fixture)
        p2 = self.harness.run(fixture)
        assert p1 == p2

    def test_edge_heavy_determinism(self):
        fixture = fixture_edge_heavy()
        p1 = self.harness.run(fixture)
        p2 = self.harness.run(fixture)
        assert p1 == p2

    def test_empty_determinism(self):
        fixture = fixture_empty()
        p1 = self.harness.run(fixture)
        p2 = self.harness.run(fixture)
        assert p1 == p2

    def test_all_fixtures_determinism(self):
        """Batch: all fixtures produce same output on consecutive runs."""
        for fixture in ALL_FIXTURES:
            p1 = self.harness.run(fixture)
            p2 = self.harness.run(fixture)
            assert p1 == p2, f"Determinism violated for fixture '{fixture.name}'"


class TestProjectionEdgeCases:
    """Edge case tests for SemanticProjectionBuilder."""

    def test_projection_is_semantic_projection_instance(self):
        fixture = fixture_simple_linear()
        projection = ProjectionReplayHarness().run(fixture)
        assert isinstance(projection, SemanticProjection)

    def test_removed_nodes_absent_from_final_set(self):
        """Removed nodes should be discarded from resolved_concepts."""
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a", "b"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                removed_nodes=["a"], timestep_sequence=2
            ),
        ]
        projection = SemanticProjectionBuilder.from_envelopes(envelopes)
        assert projection.resolved_concepts == {"b"}

    def test_reintroduced_nodes_are_present(self):
        """Reintroduced nodes should be re-added after removal."""
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                removed_nodes=["a"], timestep_sequence=2
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m3",
                reintroduced_nodes=["a"], timestep_sequence=3
            ),
        ]
        projection = SemanticProjectionBuilder.from_envelopes(envelopes)
        assert "a" in projection.resolved_concepts

    def test_modified_nodes_always_present(self):
        """Modified nodes should appear in resolved_concepts even if never added."""
        envelopes = [
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                modified_nodes=["x"], timestep_sequence=1
            ),
        ]
        projection = SemanticProjectionBuilder.from_envelopes(envelopes)
        assert "x" in projection.resolved_concepts

    def test_empty_envelopes_produce_empty_projection(self):
        projection = SemanticProjectionBuilder.from_envelopes([])
        assert projection.resolved_concepts == set()
        assert projection.resolves_edges == []

    def test_run_all_fixtures_no_exceptions(self):
        """Batch: run_all_fixtures produces clean results for all fixtures."""
        results = run_all_fixtures()
        assert len(results) == len(ALL_FIXTURES)
        for fixture, projection, report in results:
            assert report.divergence_score == 0, (
                f"Fixture '{fixture.name}' diverges: {report.failure_classification()}"
            )


# Import needed for edge case tests
from graph_models import IR_EventEnvelope
