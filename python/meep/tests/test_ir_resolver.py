"""Tests for the IR resolver (Station 2)."""

import copy

from meep.ir_resolver import resolve
from meep.models import (
    IRLResult,
    IRSelection,
    MIN_CONFIDENCE_THRESHOLD,
    REJECT_ARCHETYPE,
)


# ── Acceptance criteria ──────────────────────────────────────────────


def test_argmax_selects_highest():
    """Highest probability archetype is selected."""
    result = IRLResult(
        probabilities={
            "REVISION": 0.7,
            "EXECUTION": 0.2,
            "DEFAULT": 0.1,
        },
        raw_input="fix the bug",
    )
    selection = resolve(result)
    assert selection.archetype == "REVISION"
    assert selection.confidence == 0.7


def test_default_not_rejected_when_above_threshold():
    """DEFAULT archetype above threshold is not rejected (it's a valid fallback)."""
    result = IRLResult(
        probabilities={
            "CONSTRUCTION": 0.25,
            "EXECUTION": 0.2,
            "DEFAULT": 0.55,
        },
        raw_input="vague prompt",
    )
    selection = resolve(result)
    # Max probability is 0.55 (DEFAULT) → above 0.4 threshold
    assert selection.archetype == "DEFAULT"
    assert selection.confidence == 0.55


def test_below_threshold_returns_reject_all_low():
    """When ALL probabilities are below 0.4 → REJECT."""
    result = IRLResult(
        probabilities={
            "CONSTRUCTION": 0.2,
            "EXECUTION": 0.15,
            "DEFAULT": 0.3,
        },
        raw_input="vague",
    )
    selection = resolve(result)
    assert selection.archetype == REJECT_ARCHETYPE
    assert selection.confidence == 0.3  # max prob preserved


def test_determinism():
    """Same IRLResult → same IRSelection every time (run 100 iterations)."""
    result = IRLResult(
        probabilities={
            "REVISION": 0.6,
            "EXECUTION": 0.3,
            "DEFAULT": 0.1,
        },
        raw_input="fix the bug",
    )
    first = resolve(result)
    for _ in range(100):
        assert resolve(result) == first, (
            "IR resolver is not deterministic!"
        )


def test_determinism_with_tie():
    """Tie probabilities → alphabetical tiebreak ensures determinism."""
    result = IRLResult(
        probabilities={
            "AUDIT": 0.5,
            "COMPRESSION": 0.5,
        },
        raw_input="tie",
    )
    first = resolve(result)
    for _ in range(50):
        assert resolve(result) == first, (
            "Tiebroken IR resolver is not deterministic!"
        )


def test_tiebreak_alphabetical():
    """When two archetypes tie, the one earlier alphabetically wins."""
    result = IRLResult(
        probabilities={
            "REVISION": 0.5,
            "REFLECTION": 0.5,
        },
        raw_input="tied",
    )
    selection = resolve(result)
    # REFLECTION < REVISION alphabetically
    assert selection.archetype == "REFLECTION"


# ── Alternatives ─────────────────────────────────────────────────────


def test_alternatives_includes_above_threshold():
    result = IRLResult(
        probabilities={
            "EXECUTION": 0.6,
            "CONSTRUCTION": 0.45,
            "REVISION": 0.1,
        },
        raw_input="run build",
    )
    selection = resolve(result)
    assert selection.archetype == "EXECUTION"
    assert "CONSTRUCTION" in selection.alternatives
    assert "REVISION" not in selection.alternatives  # below threshold


def test_no_alternatives_when_only_winner_above_threshold():
    result = IRLResult(
        probabilities={
            "AUDIT": 0.7,
            "COMPRESSION": 0.2,
            "DEFAULT": 0.1,
        },
        raw_input="audit",
    )
    selection = resolve(result)
    assert selection.alternatives == []


def test_reject_has_no_alternatives():
    result = IRLResult(
        probabilities={
            "CONSTRUCTION": 0.2,
            "DEFAULT": 0.3,
        },
        raw_input="vague",
    )
    selection = resolve(result)
    assert selection.archetype == REJECT_ARCHETYPE
    assert selection.alternatives == []


# ── Edge cases ───────────────────────────────────────────────────────


def test_empty_probabilities():
    """Empty probabilities dict → REJECT."""
    result = IRLResult(probabilities={}, raw_input="")
    selection = resolve(result)
    assert selection.archetype == REJECT_ARCHETYPE
    assert selection.confidence == 0.0


def test_single_archetype():
    """Only one archetype in distribution → always selected."""
    result = IRLResult(
        probabilities={"EXECUTION": 0.8},
        raw_input="run",
    )
    selection = resolve(result)
    assert selection.archetype == "EXECUTION"
    assert selection.confidence == 0.8


def test_single_archetype_below_threshold():
    """Single archetype below threshold → REJECT."""
    result = IRLResult(
        probabilities={"EXECUTION": 0.3},
        raw_input="meh",
    )
    selection = resolve(result)
    assert selection.archetype == REJECT_ARCHETYPE


def test_all_equal_probabilities():
    """All archetypes tied → alphabetical first wins."""
    result = IRLResult(
        probabilities={
            "AUDIT": 0.5,
            "COMPRESSION": 0.5,
            "CONSTRAINT_INJECTION": 0.5,
        },
        raw_input="all equal",
    )
    selection = resolve(result)
    # Alphabetically: AUDIT < COMPRESSION < CONSTRAINT_INJECTION
    assert selection.archetype == "AUDIT"


def test_preserves_raw_input():
    """IRLResult.raw_input is not touched by the resolver."""
    result = IRLResult(
        probabilities={"EXECUTION": 0.8, "DEFAULT": 0.2},
        raw_input="   preserve this   ",
    )
    selection = resolve(result)
    assert selection == IRSelection(
        archetype="EXECUTION",
        confidence=0.8,
        alternatives=[],
    )
