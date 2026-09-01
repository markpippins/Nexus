"""SOLScript — in-memory interpreter for the resolution schema language.

Usage::

    from solscript import ResolutionInterpreter
    interp = ResolutionInterpreter()
    # ... load concepts, entities, rules ...
    result = interp.evaluate_proposition(prop)
"""

from .candidate_state import (
    CANDIDATE_STATE_MEMBERS,
    build_member_exists_expression,
    deterministic_seed_members,
    ensure_candidate_state_model,
    evaluate_candidate_state_members,
)
from .database_loader import DatabaseLoader
from .expression_compiler import ExpressionCompiler
from .inference_engine import InferenceEngine, KnowledgeBase
from .interpreter import ResolutionInterpreter
from .models import (
    AttributeBinding,
    Concept,
    ConceptAttribute,
    ConceptRelationship,
    ConceptStateTransition,
    Disposition,
    Entity,
    Expression,
    ExpressionKind,
    FrameDimension,
    FrameDimensionMeaning,
    FrameDimensionValue,
    FunctionBinding,
    Operator,
    Proposition,
    PropositionFrameValue,
    Quantifier,
    RelationshipBinding,
    Representation,
    RepresentationComparison,
    RepresentationIdentity,
    Rule,
    RuleType,
    Severity,
)
from .query_builder import Query, QueryBuilder, TransactionContext
from .reasoning import (
    DecisionTreeReasoner,
    DeterministicPatternLibrary,
    DeterministicReasoner,
    HybridReasoner,
    LLMIntegrationLayer,
    PatternMatcher,
    RuleEngine,
    StatisticalReasoner,
    SymbolicReasoner,
)

__all__ = [
    # Core
    "ResolutionInterpreter",
    "ExpressionCompiler",
    "InferenceEngine",
    "KnowledgeBase",
    "QueryBuilder",
    "Query",
    "TransactionContext",
    "DatabaseLoader",
    # Models
    "Concept",
    "ConceptAttribute",
    "ConceptRelationship",
    "ConceptStateTransition",
    "AttributeBinding",
    "RelationshipBinding",
    "Entity",
    "Expression",
    "ExpressionKind",
    "Operator",
    "Quantifier",
    "Rule",
    "RuleType",
    "Severity",
    "Disposition",
    "Proposition",
    "PropositionFrameValue",
    "FrameDimension",
    "FrameDimensionMeaning",
    "FrameDimensionValue",
    "Representation",
    "RepresentationIdentity",
    "RepresentationComparison",
    "FunctionBinding",
    # Candidate state (SOL wiring, directive 96b22ed4)
    "CANDIDATE_STATE_MEMBERS",
    "build_member_exists_expression",
    "deterministic_seed_members",
    "ensure_candidate_state_model",
    "evaluate_candidate_state_members",
    # Reasoning
    "DeterministicReasoner",
    "HybridReasoner",
    "LLMIntegrationLayer",
    "RuleEngine",
    "StatisticalReasoner",
    "SymbolicReasoner",
    "PatternMatcher",
    "DecisionTreeReasoner",
    "DeterministicPatternLibrary",
]
