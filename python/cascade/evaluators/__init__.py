"""Evaluators for the Cascade assessment engine.

Each evaluator contributes an AssessmentDimension — evidence, findings,
and signals — to the AssessmentCoordinator, which applies organizational
doctrine to resolve the final outcome.

Available evaluators:
    - TrivialEvaluator: baseline heuristics (candidate counts)
    - KGArtifactImpactEvaluator: knowledge graph connectivity (artifact counts)
"""

from .protocol import AssessmentDimension, AssessmentEvaluator, EvidenceRef
from .trivial import TrivialEvaluator
from .kg_impact import KGArtifactImpactEvaluator

__all__ = [
    "AssessmentDimension",
    "AssessmentEvaluator",
    "EvidenceRef",
    "TrivialEvaluator",
    "KGArtifactImpactEvaluator",
]
