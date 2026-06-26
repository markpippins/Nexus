"""IR Resolver — Station 2 of the MEEP pipeline.

Deterministic argmax resolver that converts an IRLResult (probability
distribution) into a single IRSelection (archetype + confidence).

Rules:
  - Argmax selects the archetype with the highest probability.
  - Ties are broken alphabetically (always deterministic).
  - If the max probability is below MIN_CONFIDENCE_THRESHOLD (0.4),
    the selection is REJECT — the pipeline produces no work.
  - Alternatives are preserved for diagnostics: all archetypes whose
    probability is at or above the threshold, excluding the winner.

This is a pure function with no side effects. Same IRLResult → same
IRSelection every time.
"""

from __future__ import annotations

from typing import Final

from meep.models import (
    IRLResult,
    IRSelection,
    MIN_CONFIDENCE_THRESHOLD,
    REJECT_ARCHETYPE,
)

# Tiebreaker: when two archetypes have identical probability, the one
# that sorts earlier alphabetically is chosen. This ensures determinism
# regardless of dict iteration order in the input.


def resolve(result: IRLResult) -> IRSelection:
    """Resolve an *IRLResult* to a deterministic *IRSelection*.

    Args:
        result: Probabilistic classification from the IRL classifier.

    Returns:
        A deterministic IRSelection with the winning archetype (or REJECT).
    """
    if not result.probabilities:
        return IRSelection(archetype=REJECT_ARCHETYPE, confidence=0.0)

    # Sort: primary = probability descending, secondary = archetype name
    # ascending (alphabetical tiebreaker).
    sorted_pairs: list[tuple[str, float]] = sorted(
        result.probabilities.items(),
        key=lambda item: (-item[1], item[0]),
    )

    winner, max_prob = sorted_pairs[0]

    if max_prob < MIN_CONFIDENCE_THRESHOLD:
        return IRSelection(
            archetype=REJECT_ARCHETYPE,
            confidence=max_prob,
            alternatives=[],
        )

    # Alternatives: every archetype at or above threshold except the winner.
    alternatives = [
        archetype
        for archetype, prob in sorted_pairs[1:]
        if prob >= MIN_CONFIDENCE_THRESHOLD
    ]

    return IRSelection(
        archetype=winner,
        confidence=max_prob,
        alternatives=alternatives,
    )
