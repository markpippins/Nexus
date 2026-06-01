"""
Dual Oracle Test Harness

Runs both the legacy closure replay path (EnvelopeInterpreter_V1) and the
new SemanticProjection path (SemanticProjectionBuilder) on the same input,
normalizes outputs, and diffs for divergence. Guarantees zero semantic
drift before the legacy path is deleted.
"""

from dataclasses import dataclass, field
from typing import List, Set, Tuple, Dict

from graph_models import IR_EventEnvelope, ReconstructedClosureSet
from semantic_projection import SemanticProjection, SemanticProjectionBuilder
from replay_kernel import EnvelopeInterpreter_V1


# ═══════════════════════════════════════════════════════════════════
# A. Canonical Fixtures
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ReplayFixture:
    """Deterministic replay input for dual-oracle testing."""
    name: str
    events: List[IR_EventEnvelope]


def fixture_simple_linear() -> ReplayFixture:
    """add A, add B, emit edge A→B"""
    return ReplayFixture(
        name="simple_linear",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["concept_a"], timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                added_nodes=["concept_b"],
                emitted_edges=[("concept_a", "concept_b")],
                timestep_sequence=2,
            ),
        ],
    )


def fixture_cycle_retraction() -> ReplayFixture:
    """add A, add B, remove A, reintroduce A"""
    return ReplayFixture(
        name="cycle_retraction",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a"], timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                added_nodes=["b"], timestep_sequence=2,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m3",
                removed_nodes=["a"], timestep_sequence=3,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m4",
                reintroduced_nodes=["a"], timestep_sequence=4,
            ),
        ],
    )


def fixture_multi_trajectory() -> ReplayFixture:
    """A1, B1, A2, B2 interleaved events"""
    return ReplayFixture(
        name="multi_trajectory",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="a1",
                added_nodes=["concept_a"], timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t2", timestep_msg_id="b1",
                added_nodes=["concept_b"], timestep_sequence=2,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="a2",
                added_nodes=["concept_c"], timestep_sequence=3,
            ),
            IR_EventEnvelope(
                trajectory_id="t2", timestep_msg_id="b2",
                added_nodes=["concept_d"], timestep_sequence=4,
            ),
        ],
    )


def fixture_edge_heavy() -> ReplayFixture:
    """Dense resolves_edges with multiple edge emissions"""
    return ReplayFixture(
        name="edge_heavy",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["x", "y", "z"], timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                emitted_edges=[("x", "y"), ("y", "z")], timestep_sequence=2,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m3",
                emitted_edges=[("x", "z")], timestep_sequence=3,
            ),
        ],
    )


def fixture_empty() -> ReplayFixture:
    """Empty event stream"""
    return ReplayFixture(name="empty", events=[])


def fixture_modified_nodes() -> ReplayFixture:
    """Tests concept modification tracking (projection-only feature)"""
    return ReplayFixture(
        name="modified_nodes",
        events=[
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m1",
                added_nodes=["a"], timestep_sequence=1,
            ),
            IR_EventEnvelope(
                trajectory_id="t1", timestep_msg_id="m2",
                modified_nodes=["a", "b"], timestep_sequence=2,
            ),
        ],
    )


ALL_FIXTURES = [
    fixture_simple_linear(),
    fixture_cycle_retraction(),
    fixture_multi_trajectory(),
    fixture_edge_heavy(),
    fixture_empty(),
    fixture_modified_nodes(),
]


# ═══════════════════════════════════════════════════════════════════
# B. Normalization Layer
# ═══════════════════════════════════════════════════════════════════

@dataclass
class NormalizedSemanticState:
    """Common comparison shape for both legacy and projection outputs."""
    resolved_concepts: Set[str]
    resolves_edges: Set[Tuple[str, str]]


def normalize_closures(
    closures: Dict[str, ReconstructedClosureSet],
) -> NormalizedSemanticState:
    """Normalize legacy EnvelopeInterpreter_V1 output → NormalizedSemanticState."""
    concepts: Set[str] = set()
    edges: Set[Tuple[str, str]] = set()

    for closure in closures.values():
        concepts |= closure.resolved_concepts
        edges |= set(closure.resolves_edges)

    return NormalizedSemanticState(
        resolved_concepts=concepts,
        resolves_edges=edges,
    )


def normalize_projection(projection: SemanticProjection) -> NormalizedSemanticState:
    """Normalize SemanticProjection → NormalizedSemanticState."""
    return NormalizedSemanticState(
        resolved_concepts=set(projection.resolved_concepts),
        resolves_edges=set(projection.resolves_edges),
    )


# ═══════════════════════════════════════════════════════════════════
# C. Dual Execution Runner
# ═══════════════════════════════════════════════════════════════════

class DualReplayHarness:
    """Runs both legacy (interpreter) and projection (builder) paths on
    the same fixture."""

    def __init__(self):
        self.legacy_interpreter = EnvelopeInterpreter_V1()

    def run(self, fixture: ReplayFixture):
        """Returns (legacy_closures, semantic_projection)."""
        sorted_stream = sorted(
            fixture.events, key=lambda e: (e.trajectory_id, e.timestep_sequence)
        )
        legacy = self.legacy_interpreter.interpret(sorted_stream)
        projection = SemanticProjectionBuilder.from_envelopes(sorted_stream)
        return legacy, projection


# ═══════════════════════════════════════════════════════════════════
# D. Comparison Engine
# ═══════════════════════════════════════════════════════════════════

@dataclass
class SemanticDiffReport:
    """Structured divergence report between legacy and projection."""
    fixture_name: str = ""
    concept_missing_in_projection: Set[str] = field(default_factory=set)
    concept_extra_in_projection: Set[str] = field(default_factory=set)
    edges_missing_in_projection: Set[Tuple[str, str]] = field(default_factory=set)
    edges_extra_in_projection: Set[Tuple[str, str]] = field(default_factory=set)

    @property
    def divergence_score(self) -> int:
        return (
            len(self.concept_missing_in_projection)
            + len(self.concept_extra_in_projection)
            + len(self.edges_missing_in_projection)
            + len(self.edges_extra_in_projection)
        )

    @property
    def is_clean(self) -> bool:
        return self.divergence_score == 0

    def failure_classification(self) -> str:
        """Classify the type of divergence."""
        if self.concept_missing_in_projection:
            return "Type 1: Missing concept propagation — projection builder bug"
        if self.concept_extra_in_projection:
            return "Type 2: Extra projection concepts — intentional coverage expansion"
        if self.edges_missing_in_projection or self.edges_extra_in_projection:
            return "Type 3: Edge mismatch — semantic relationship encoding drift"
        if self.is_clean:
            return "Type 0: No divergence"
        return "Type 4: Unknown — investigate"


class SemanticComparator:
    """Compares normalized legacy and projection outputs."""

    def compare(
        self,
        legacy: Dict[str, ReconstructedClosureSet],
        projection: SemanticProjection,
    ) -> SemanticDiffReport:
        a = normalize_closures(legacy)
        b = normalize_projection(projection)

        return SemanticDiffReport(
            concept_missing_in_projection=a.resolved_concepts - b.resolved_concepts,
            concept_extra_in_projection=b.resolved_concepts - a.resolved_concepts,
            edges_missing_in_projection=a.resolves_edges - b.resolves_edges,
            edges_extra_in_projection=b.resolves_edges - a.resolves_edges,
        )
