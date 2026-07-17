"""Assessment evaluator protocol — dimensions, not outcomes.

An evaluator never decides an outcome. It contributes structured
dimensions (evidence, signals, findings) to the coordinator, which
applies organizational doctrine to resolve the outcome.

This is the hard architectural boundary:

    Evaluator → AssessmentDimension (evidence)
    Coordinator → Outcome (doctrine)

See ADR-005 and the architecture guidance note (2026-07-07) for
the full rationale.
"""

from __future__ import annotations

import dataclasses
from typing import Any, Protocol


# ── Evidence ────────────────────────────────────────────────────────

@dataclasses.dataclass(frozen=True)
class EvidenceRef:
    """A traceable reference supporting a dimension finding.

    Every claim an evaluator makes should be traceable back to a
    source artifact in the database.
    """
    source_type: str          # e.g. "specification", "requirement", "policy"
    source_id: str            # UUID of the source artifact
    description: str          # Human-readable summary of the evidence
    confidence: float = 1.0   # How reliable is this specific piece of evidence


# ── Dimension ───────────────────────────────────────────────────────

@dataclasses.dataclass(frozen=True)
class AssessmentDimension:
    """Structured output from a single evaluator.

    Fields:
        evaluator:  Machine name of the evaluator (e.g. "kg_artifact_impact").
        confidence: Overall confidence in this dimension (0.0 – 1.0).
        evidence:   List of traceable EvidenceRefs supporting the findings.
        findings:   Structured data the coordinator uses for resolution.
                    Schema is evaluator-specific but should be stable.
        signals:    Soft indicators — warnings, flags, anomalies that
                    don't rise to the level of findings but may influence
                    confidence or future evaluator runs.
    """
    evaluator: str
    confidence: float
    evidence: list[EvidenceRef]
    findings: dict[str, Any]
    signals: dict[str, Any] = dataclasses.field(default_factory=dict)


# ── Evaluator interface ─────────────────────────────────────────────

class AssessmentEvaluator(Protocol):
    """Interface all evaluators must satisfy.

    An evaluator receives an observation_id and returns structured
    dimensions. It does NOT import or reference outcome values.
    """

    name: str

    def evaluate(
        self,
        cur: Any,           # psycopg2 cursor for DB queries
        observation_id: str,
        observation_payload: dict[str, Any],
    ) -> AssessmentDimension:
        """Run the evaluator and return its dimension contribution.

        Args:
            cur: Database cursor (read-only access assumed).
            observation_id: The observation being assessed.
            observation_payload: The observation's payload dict.

        Returns:
            AssessmentDimension with findings and evidence.
            Never raises — errors are caught and returned as
            low-confidence dimensions.
        """
        ...
