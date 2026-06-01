"""
Deterministic replay fixtures for dual-oracle testing.

Single source of truth — every fixture here is a contract.
Adapted for the actual IR_EventEnvelope model (emitted_edges, not added_edges/removed_edges).
"""

from dataclasses import dataclass
from typing import List
from graph_models import IR_EventEnvelope


@dataclass
class ReplayFixture:
    """A deterministic replay input for dual-oracle comparison."""
    name: str
    events: List[IR_EventEnvelope]


def _env(trajectory_id, timestep_sequence, added=None, modified=None,
         removed=None, reintroduced=None, emitted_edges=None):
    """Shortcut constructor for IR_EventEnvelope fixtures."""
    return IR_EventEnvelope(
        trajectory_id=trajectory_id,
        timestep_msg_id=f"msg_{trajectory_id}_{timestep_sequence}",
        added_nodes=added or [],
        modified_nodes=modified or [],
        removed_nodes=removed or [],
        reintroduced_nodes=reintroduced or [],
        emitted_edges=emitted_edges or [],
        timestep_sequence=timestep_sequence,
    )


def fixture_linear_resolution() -> ReplayFixture:
    """Simple: add A, add B, emit edge A→B."""
    return ReplayFixture(
        name="linear_resolution",
        events=[
            _env("t1", 1, added=["A"]),
            _env("t1", 2, added=["B"], emitted_edges=[("A", "B")]),
        ],
    )


def fixture_cycle_retraction() -> ReplayFixture:
    """Add A, add B, remove A."""
    return ReplayFixture(
        name="cycle_retraction",
        events=[
            _env("t1", 1, added=["A"]),
            _env("t1", 2, added=["B"]),
            _env("t1", 3, removed=["A"]),
        ],
    )


def fixture_reintroduction() -> ReplayFixture:
    """Add A, remove A, reintroduce A."""
    return ReplayFixture(
        name="reintroduction",
        events=[
            _env("t1", 1, added=["A"]),
            _env("t1", 2, removed=["A"]),
            _env("t1", 3, reintroduced=["A"]),
        ],
    )


def fixture_modified_nodes() -> ReplayFixture:
    """Modified nodes are treated as added/concept presence."""
    return ReplayFixture(
        name="modified_nodes",
        events=[
            _env("t1", 1, modified=["X"]),
        ],
    )


def fixture_multi_trajectory() -> ReplayFixture:
    """Interleaved trajectories: A1, B1, A2, B2."""
    return ReplayFixture(
        name="multi_trajectory",
        events=[
            _env("tA", 1, added=["concept_a"]),
            _env("tB", 2, added=["concept_b"]),
            _env("tA", 3, added=["concept_c"]),
            _env("tB", 4, added=["concept_d"]),
        ],
    )


def fixture_edge_heavy() -> ReplayFixture:
    """Dense resolves_edges with multiple emissions."""
    return ReplayFixture(
        name="edge_heavy",
        events=[
            _env("t1", 1, added=["x", "y", "z"]),
            _env("t1", 2, emitted_edges=[("x", "y"), ("y", "z")]),
            _env("t1", 3, emitted_edges=[("x", "z")]),
        ],
    )


def fixture_empty() -> ReplayFixture:
    """Empty event stream."""
    return ReplayFixture(name="empty", events=[])


def fixture_node_lifecycle_full() -> ReplayFixture:
    """Full lifecycle: added → modified → removed → reintroduced."""
    return ReplayFixture(
        name="node_lifecycle_full",
        events=[
            _env("t1", 1, added=["concept"]),
            _env("t1", 2, modified=["concept"]),
            _env("t1", 3, removed=["concept"]),
            _env("t1", 4, reintroduced=["concept"]),
        ],
    )


# Master fixture registry
ALL_FIXTURES = [
    fixture_linear_resolution(),
    fixture_cycle_retraction(),
    fixture_reintroduction(),
    fixture_modified_nodes(),
    fixture_multi_trajectory(),
    fixture_edge_heavy(),
    fixture_empty(),
    fixture_node_lifecycle_full(),
]
