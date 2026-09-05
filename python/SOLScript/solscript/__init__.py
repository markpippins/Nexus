"""SOLScript — in-memory interpreter for the resolution schema language.

Usage::

    from solscript import ResolutionInterpreter
    interp = ResolutionInterpreter()
    # ... load concepts, entities, rules ...
    result = interp.evaluate_proposition(prop)
"""

from .bridge import (
    BRIDGE_SCHEMA_VERSION,
    BridgeFieldSlice,
    BridgeReadResult,
    ShrapnelResolutionBridge,
    read_bridge,
)
from .state_bridge import (
    CANDIDATE_STATE_MEMBERS,
    DEFAULT_STATE_BRIDGE_MODEL,
    StateBridgeModel,
    build_member_exists_expression,
    deterministic_seed_members,
    deterministic_state_members,
    ensure_candidate_state_model,
    ensure_state_bridge_model,
    evaluate_candidate_state_members,
    evaluate_state_members,
)
from .database_loader import DatabaseLoader
from .events import (
    KEYCHAIN_EVENT_SCHEMA_VERSION,
    READ_SET_MANIFEST_SCHEMA_VERSION,
    KeychainEvent,
    ReadSetManifest,
    build_evaluation_event,
    build_transition_event,
    stable_digest,
)
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
    "BRIDGE_SCHEMA_VERSION",
    "BridgeFieldSlice",
    "BridgeReadResult",
    "ShrapnelResolutionBridge",
    "read_bridge",
    "KEYCHAIN_EVENT_SCHEMA_VERSION",
    "READ_SET_MANIFEST_SCHEMA_VERSION",
    "KeychainEvent",
    "ReadSetManifest",
    "build_evaluation_event",
    "build_transition_event",
    "stable_digest",
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
    # Generic state bridge (legacy candidate-state exports retained)
    "CANDIDATE_STATE_MEMBERS",
    "StateBridgeModel",
    "DEFAULT_STATE_BRIDGE_MODEL",
    "build_member_exists_expression",
    "deterministic_seed_members",
    "deterministic_state_members",
    "evaluate_state_members",
    "ensure_candidate_state_model",
    "ensure_state_bridge_model",
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
