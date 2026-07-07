"""TrivialEvaluator — simple heuristics for initial assessment.

Used as the baseline evaluator before richer evaluators (KG, policy,
similarity) are plugged in. It owns the heuristic formerly hardcoded
in assessment_subscriber.py — migrated out to prove the evaluator
interface works.
"""

from __future__ import annotations

import dataclasses
import logging
from typing import Any

from .protocol import AssessmentDimension, AssessmentEvaluator, EvidenceRef

logger = logging.getLogger(__name__)

# Default confidence when no evaluator has strong evidence
# (used by the coordinator, not returned by this evaluator)
DEFAULT_CONFIDENCE: float = 0.50


@dataclasses.dataclass(frozen=True)
class TrivialEvaluator:
    """Baseline evaluator that uses observation payload heuristics.

    Rules:
        If the observation payload contains candidate data, it counts
        as "has candidates". Otherwise, no candidates.

    The coordinator will merge this dimension with others and apply
    doctrine to resolve the final outcome.
    """

    name: str = "trivial"

    def evaluate(
        self,
        cur: Any,
        observation_id: str,
        observation_payload: dict[str, Any],
    ) -> AssessmentDimension:
        try:
            return self._do_evaluate(cur, observation_id, observation_payload)
        except Exception:
            logger.exception("TrivialEvaluator failed for observation %s", observation_id)
            return AssessmentDimension(
                evaluator=self.name,
                confidence=0.0,
                evidence=[],
                findings={"error": True, "heuristic": None},
                signals={"evaluator_failure": True},
            )

    def _do_evaluate(
        self,
        cur: Any,
        observation_id: str,
        observation_payload: dict[str, Any],
    ) -> AssessmentDimension:
        candidates = observation_payload.get("candidates") or []
        # Count non-None candidates
        candidate_count = sum(1 for c in candidates if c is not None)

        evidence: list[EvidenceRef] = []
        findings: dict[str, Any] = {
            "heuristic": "candidate_count",
            "candidate_count": candidate_count,
        }

        if candidate_count == 0:
            confidence = 0.30
            findings["assessment_type"] = "informational"
            evidence.append(
                EvidenceRef(
                    source_type="observation",
                    source_id=observation_id,
                    description=f"No candidates found — informational assessment (confidence={confidence})",
                    confidence=confidence,
                )
            )
        else:
            confidence = 0.50
            findings["assessment_type"] = "deliberation"
            evidence.append(
                EvidenceRef(
                    source_type="observation",
                    source_id=observation_id,
                    description=f"Found {candidate_count} candidate(s) — deliberation recommended (confidence={confidence})",
                    confidence=confidence,
                )
            )

        return AssessmentDimension(
            evaluator=self.name,
            confidence=confidence,
            evidence=evidence,
            findings=findings,
            signals={
                "evaluated_at": __import__("datetime").datetime.utcnow().isoformat(),
            },
        )
