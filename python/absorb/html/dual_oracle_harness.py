"""Dual Oracle Test Harness — Regression Fixtures + Consistency Checks.

This harness provides a library of golden fixtures for the SemanticProjection
layer and verifies that SemanticProjectionBuilder produces deterministic,
correct output for each fixture. The "dual" refers to the original design
intent: running both legacy closure and new projection paths in parallel
to validate equivalence. Since the legacy closure path has been removed
(Plans 0003-0004), this harness now serves as a regression test suite
that validates determinism and expected output shape.

Architecture (original intent preserved for documentation):
    Event Stream → SemanticProjectionBuilder → SemanticProjection
    Event Stream → (legacy path removed)       → NormalizedSemanticState
    Both paths → Normalized Comparator → Diff Report (divergence = 0)
"""

from dataclasses import dataclass, field
from typing import List, Set, Tuple

from graph_models import IR_EventEnvelope
from semantic_projection import SemanticProjection, SemanticProjectionBuilder


# ── Golden Fixture Library ─────────────────────────────────────────────

@dataclass
class ReplayFixture:
    """Deterministic replay input for projection testing."""
    name: str
    events: List[IR_EventEnvelope]


def fixture_simple_linear() -> ReplayFixture:
    """add A, add B, add edge A→B"""
    return ReplayFixture(
        name="simple_linear",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["concept_a"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                added_nodes=["concept_b"],
                emitted_edges=[("concept_a", "concept_b")],
                timestep_sequence=2
            ),
        ]
    )


def fixture_cycle_retraction() -> ReplayFixture:
    """add A, add B, remove A, reintroduce A"""
    return ReplayFixture(
        name="cycle_retraction",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                added_nodes=["b"], timestep_sequence=2
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m3",
                removed_nodes=["a"], timestep_sequence=3
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m4",
                reintroduced_nodes=["a"], timestep_sequence=4
            ),
        ]
    )


def fixture_multi_trajectory() -> ReplayFixture:
    """A1, B1, A2, B2 interleaved across two trajectories"""
    return ReplayFixture(
        name="multi_trajectory",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="a1",
                added_nodes=["concept_a"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t2", timestep_msg_id="b1",
                added_nodes=["concept_b"], timestep_sequence=2
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="a2",
                added_nodes=["concept_c"], timestep_sequence=3
            ),
            IR_EventEnvelope(
                trajectory_id="t2", timestep_msg_id="b2",
                added_nodes=["concept_d"], timestep_sequence=4
            ),
        ]
    )


def fixture_edge_heavy() -> ReplayFixture:
    """dense emitted_edges with concept modifications"""
    return ReplayFixture(
        name="edge_heavy",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["x", "y", "z"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                emitted_edges=[("x", "y"), ("y", "z")],
                timestep_sequence=2
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m3",
                modified_nodes=["x"],
                emitted_edges=[("x", "z")],
                timestep_sequence=3
            ),
        ]
    )


def fixture_empty() -> ReplayFixture:
    """empty event stream"""
    return ReplayFixture(name="empty", events=[])


def fixture_modified_nodes() -> ReplayFixture:
    """Modified nodes are always added to resolved_concepts"""
    return ReplayFixture(
        name="modified_nodes",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a", "b"], timestep_sequence=1
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                modified_nodes=["a", "c"], timestep_sequence=2
            ),
        ]
    )


ALL_FIXTURES = [
    fixture_simple_linear(),
    fixture_cycle_retraction(),
    fixture_multi_trajectory(),
    fixture_edge_heavy(),
    fixture_empty(),
    fixture_modified_nodes(),
]


# ── Expected Outcomes ──────────────────────────────────────────────────

def expected_for_simple_linear() -> Tuple[Set[str], List[Tuple[str, str]]]:
    return {"concept_a", "concept_b"}, [("concept_a", "concept_b")]


def expected_for_cycle_retraction() -> Tuple[Set[str], List[Tuple[str, str]]]:
    # a removed, then reintroduced → still in final set
    return {"b", "a"}, []


def expected_for_multi_trajectory() -> Tuple[Set[str], List[Tuple[str, str]]]:
    return {"concept_a", "concept_b", "concept_c", "concept_d"}, []


def expected_for_edge_heavy() -> Tuple[Set[str], List[Tuple[str, str]]]:
    return {"x", "y", "z"}, [("x", "y"), ("y", "z"), ("x", "z")]


def expected_for_empty() -> Tuple[Set[str], List[Tuple[str, str]]]:
    return set(), []


def expected_for_modified_nodes() -> Tuple[Set[str], List[Tuple[str, str]]]:
    # a from added, b from added, a from modified (already present), c from modified
    return {"a", "b", "c"}, []


FIXTURE_EXPECTATIONS = {
    "simple_linear": expected_for_simple_linear,
    "cycle_retraction": expected_for_cycle_retraction,
    "multi_trajectory": expected_for_multi_trajectory,
    "edge_heavy": expected_for_edge_heavy,
    "empty": expected_for_empty,
    "modified_nodes": expected_for_modified_nodes,
}


# ── Normalization / Comparison Layer ───────────────────────────────────

@dataclass
class NormalizedSemanticState:
    """Common comparison shape for projection output validation."""
    resolved_concepts: Set[str]
    resolves_edges: List[Tuple[str, str]]


def normalize_projection(projection: SemanticProjection) -> NormalizedSemanticState:
    """Normalize SemanticProjection → NormalizedSemanticState for comparison."""
    return NormalizedSemanticState(
        resolved_concepts=set(projection.resolved_concepts),
        resolves_edges=list(projection.resolves_edges)
    )


@dataclass
class SemanticDiffReport:
    """Structured divergence report between projection and expected output."""
    fixture_name: str
    concept_missing: Set[str] = field(default_factory=set)
    concept_extra: Set[str] = field(default_factory=set)
    edges_missing: List[Tuple[str, str]] = field(default_factory=list)
    edges_extra: List[Tuple[str, str]] = field(default_factory=list)

    @property
    def divergence_score(self) -> int:
        return (
            len(self.concept_missing) +
            len(self.concept_extra) +
            len(self.edges_missing) +
            len(self.edges_extra)
        )

    @property
    def is_clean(self) -> bool:
        return self.divergence_score == 0

    def failure_classification(self) -> str:
        if self.concept_missing:
            return "Type 1: Missing concept propagation — projection builder bug"
        if self.concept_extra:
            return "Type 2: Extra projection concepts — over-generation"
        if self.edges_missing or self.edges_extra:
            return "Type 3: Edge mismatch — semantic relationship encoding drift"
        if self.is_clean:
            return "Type 0: No divergence"
        return "Type 4: Unknown — investigate"


class SemanticComparator:
    """Compares normalized projection output against expected ground truth."""

    def compare(
        self,
        projection: SemanticProjection,
        expected_concepts: Set[str],
        expected_edges: List[Tuple[str, str]]
    ) -> SemanticDiffReport:
        actual = normalize_projection(projection)
        expected_set = NormalizedSemanticState(
            resolved_concepts=expected_concepts,
            resolves_edges=expected_edges
        )

        return SemanticDiffReport(
            fixture_name="unknown",
            concept_missing=expected_set.resolved_concepts - actual.resolved_concepts,
            concept_extra=actual.resolved_concepts - expected_set.resolved_concepts,
            edges_missing=[
                e for e in expected_set.resolves_edges
                if e not in actual.resolves_edges
            ],
            edges_extra=[
                e for e in actual.resolves_edges
                if e not in expected_set.resolves_edges
            ],
        )


# ── Replay Harness ─────────────────────────────────────────────────────

class ProjectionReplayHarness:
    """Runs the SemanticProjectionBuilder on a fixture and returns the result."""

    def __init__(self):
        self.builder = SemanticProjectionBuilder

    def run(self, fixture: ReplayFixture) -> SemanticProjection:
        return self.builder.from_envelopes(fixture.events)


# ── Convience: run all fixtures ────────────────────────────────────────

def run_all_fixtures():
    """Run all golden fixtures and return (fixture, projection, report) tuples."""
    harness = ProjectionReplayHarness()
    comparator = SemanticComparator()
    results = []

    for fixture in ALL_FIXTURES:
        projection = harness.run(fixture)
        expected_concepts, expected_edges = FIXTURE_EXPECTATIONS[fixture.name]()
        report = comparator.compare(projection, expected_concepts, expected_edges)
        report.fixture_name = fixture.name
        results.append((fixture, projection, report))

    return results
