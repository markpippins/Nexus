"""AssessmentCoordinator — merges evaluator dimensions, applies doctrine.

This is the single place where outcome resolution happens. Evaluators
contribute structured dimensions; the coordinator merges them and
resolves the final outcome based on organizational doctrine.

Doctrine rules (V1 — in-code; will move to PEB policy in future):
    R1: Any dimension with confidence == 0.0 → log warning, exclude from merge.
    R2: If ALL dimensions suggest informational (no downstream impact):
            outcome = INFORMATIONAL
        (Requires: kg_artifact_impact.artifact_counts.total == 0
         AND trivial.candidate_count == 0)
    R3: If KG reports connected artifacts AND trivial has candidates:
            outcome = DELIBERATION_REQUIRED
        (Something exists downstream that warrants group review.)
    R4: If trivial says informational but KG reports artifacts:
            outcome = RECOMMENDATION
        (The observation itself has no candidates, but something in
         the KG is connected — flag it as a recommendation so a
         human or automated process can decide.)
    R5: Default fallback → DELIBERATION_REQUIRED (conservative).
"""

from __future__ import annotations

import dataclasses
import logging
from typing import Any

from .evaluators.protocol import AssessmentDimension

logger = logging.getLogger(__name__)

# Outcome constants
OUTCOME_INFORMATIONAL = "INFORMATIONAL"
OUTCOME_RECOMMENDATION = "RECOMMENDATION"
OUTCOME_DELIBERATION_REQUIRED = "DELIBERATION_REQUIRED"
OUTCOME_POLICY_BLOCKED = "POLICY_BLOCKED"
OUTCOME_AUTO_RESOLVED = "AUTO_RESOLVED"

# Minimum number of dimensions required before coordinator will decide.
# If fewer, the coordinator returns a "low evidence" informational
# outcome.
MIN_DIMENSIONS: int = 1

# Confidence threshold below which a dimension is treated as
# "unreliable" and excluded from deliberation-sensitive rules.
POOR_CONFIDENCE_THRESHOLD: float = 0.15


@dataclasses.dataclass(frozen=True)
class DoctrineResolution:
    """Result of applying doctrine to merged dimensions."""
    outcome: str
    confidence: float
    rationale: list[str]
    dimensions_used: int
    dimensions_total: int


def _merge_dimensions(
    dimensions: list[AssessmentDimension],
) -> tuple[list[AssessmentDimension], list[str]]:
    """Merge dimensions, filtering unreliable ones.

    Returns:
        (reliable_dimensions, rationale_log)
    """
    rationale: list[str] = []
    reliable: list[AssessmentDimension] = []

    for dim in dimensions:
        if dim.confidence <= POOR_CONFIDENCE_THRESHOLD:
            rationale.append(
                f"  Excluded '{dim.evaluator}' (confidence={dim.confidence} ≤ threshold)"
            )
            continue
        reliable.append(dim)
        rationale.append(
            f"  Included '{dim.evaluator}' (confidence={dim.confidence}, "
            f"findings={dim.findings})"
        )

    return reliable, rationale


# ── Doctrine rules ──────────────────────────────────────────────────

def _apply_doctrine(
    reliable: list[AssessmentDimension],
    rationale: list[str],
) -> DoctrineResolution:
    """Apply organizational doctrine to reliable dimensions.

    Each rule returns (decision, explanation) or None to fall through.
    """
    # Helper: extract a finding value from any dimension
    def find(key: str, default: Any = None) -> Any:
        for dim in reliable:
            val = dim.findings.get(key)
            if val is not None:
                return val
        return default

    # R1: If no reliable dimensions, default informational
    if not reliable:
        rationale.append("Doctrine R1: No reliable dimensions → INFORMATIONAL (low evidence)")
        return DoctrineResolution(
            outcome=OUTCOME_INFORMATIONAL,
            confidence=0.10,
            rationale=rationale,
            dimensions_used=0,
            dimensions_total=len(reliable),
        )

    # Extract key signals
    candidate_count: int = find("candidate_count", 0)
    total_artifacts: int = 0
    for dim in reliable:
        if "artifact_counts" in dim.findings:
            total_artifacts = dim.findings["artifact_counts"].get("total", 0)

    # R2: All dimensions point to informational
    if candidate_count == 0 and total_artifacts == 0:
        rationale.append(
            "Doctrine R2: No candidates AND no connected artifacts → INFORMATIONAL"
        )
        return DoctrineResolution(
            outcome=OUTCOME_INFORMATIONAL,
            confidence=0.30,
            rationale=rationale,
            dimensions_used=len(reliable),
            dimensions_total=len(reliable),
        )

    # R3: Candidates exist AND KG has downstream artifacts
    if candidate_count > 0 and total_artifacts > 0:
        rationale.append(
            f"Doctrine R3: {candidate_count} candidate(s) + {total_artifacts} connected "
            f"artifact(s) → DELIBERATION_REQUIRED"
        )
        return DoctrineResolution(
            outcome=OUTCOME_DELIBERATION_REQUIRED,
            confidence=0.60,
            rationale=rationale,
            dimensions_used=len(reliable),
            dimensions_total=len(reliable),
        )

    # R4: No candidates but KG found connected artifacts
    if candidate_count == 0 and total_artifacts > 0:
        rationale.append(
            f"Doctrine R4: 0 candidates but {total_artifacts} connected artifact(s) "
            f"→ RECOMMENDATION"
        )
        return DoctrineResolution(
            outcome=OUTCOME_RECOMMENDATION,
            confidence=0.40,
            rationale=rationale,
            dimensions_used=len(reliable),
            dimensions_total=len(reliable),
        )

    # R5: Candidates exist but no KG artifacts yet
    if candidate_count > 0 and total_artifacts == 0:
        rationale.append(
            f"Doctrine R5: {candidate_count} candidate(s) but no KG artifacts "
            f"→ DELIBERATION_REQUIRED (conservative default)"
        )
        return DoctrineResolution(
            outcome=OUTCOME_DELIBERATION_REQUIRED,
            confidence=0.50,
            rationale=rationale,
            dimensions_used=len(reliable),
            dimensions_total=len(reliable),
        )

    # Fallback — should not be reached, but safety net
    rationale.append("Doctrine fallback: no rule matched → DELIBERATION_REQUIRED")
    return DoctrineResolution(
        outcome=OUTCOME_DELIBERATION_REQUIRED,
        confidence=0.35,
        rationale=rationale,
        dimensions_used=len(reliable),
        dimensions_total=len(reliable),
    )


# ── Public API ──────────────────────────────────────────────────────

def resolve_outcome(
    dimensions: list[AssessmentDimension],
) -> DoctrineResolution:
    """Merge dimensions and apply doctrine to produce the final outcome.

    This is the single entry point for outcome resolution. No other
    code should decide assessment outcomes.
    """
    reliable, rationale = _merge_dimensions(dimensions)
    logger.info("AssessmentCoordinator: %d/%d dimensions reliable", len(reliable), len(dimensions))
    for line in rationale:
        logger.debug("Coordinator rationale: %s", line)

    result = _apply_doctrine(reliable, rationale)

    logger.info(
        "AssessmentCoordinator resolved: outcome=%s confidence=%.2f "
        "dimensions_used=%d/%d",
        result.outcome,
        result.confidence,
        result.dimensions_used,
        result.dimensions_total,
    )
    return result
