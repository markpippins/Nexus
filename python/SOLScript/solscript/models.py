"""Core data models for the SOLScript interpreter.

Maps to the resolution schema: concepts, attributes, relationships,
expressions, rules, propositions, and representations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


# ── Enums ────────────────────────────────────────────────────────────

class ExpressionKind(Enum):
    LITERAL = "literal"
    ATTRIBUTE_REF = "attribute_ref"
    OPERATOR = "operator"
    FUNCTION_CALL = "function_call"
    RELATIONSHIP_REF = "relationship_ref"
    PROPOSITION_REF = "proposition_ref"


class Operator(Enum):
    EQ = "="
    NEQ = "<>"
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    AND = "AND"
    OR = "OR"
    NOT = "NOT"


class Quantifier(Enum):
    EXISTS = "EXISTS"
    ALL = "ALL"
    COUNT = "COUNT"


class RuleType(Enum):
    INVARIANT = "invariant"
    GUARD = "guard"
    CONDITIONAL = "conditional"
    DERIVATION = "derivation"


class Severity(Enum):
    HARD = "hard"
    SOFT = "soft"


class Disposition(Enum):
    ASSERTED = "Asserted"
    DISPUTED = "Disputed"
    REJECTED = "Rejected"
    PENDING = "Pending"
    PROPOSED = "Proposed"
    STALE = "Stale"
    RETRACTED = "Retracted"


# ── Data classes ─────────────────────────────────────────────────────

@dataclass
class AttributeBinding:
    schema_name: str
    table_name: str
    column_name: str


@dataclass
class ConceptAttribute:
    id: str
    concept_id: str
    name: str
    description: Optional[str]
    value_type: str
    is_state_attribute: bool
    binding: Optional[AttributeBinding] = None
    allowed_values: List[str] = field(default_factory=list)
    default_value: Optional[Any] = None


@dataclass
class RelationshipBinding:
    from_schema: str
    from_table: str
    from_column: str
    to_schema: str
    to_table: str
    to_column: str


@dataclass
class Expression:
    id: str
    kind: ExpressionKind
    return_type: str
    operator: Optional[Operator] = None
    literal_value: Optional[Any] = None
    attribute_id: Optional[str] = None
    function_name: Optional[str] = None
    concept_relationship_id: Optional[str] = None
    quantifier: Optional[Quantifier] = None
    referenced_proposition_id: Optional[str] = None
    proposition_ref_field: Optional[str] = None
    operands: List[Expression] = field(default_factory=list)
    label: Optional[str] = None


@dataclass
class Rule:
    id: str
    name: str
    rule_type: RuleType
    expression: Optional[Expression]
    severity: Severity
    concept_id: Optional[str] = None
    concept_relationship_id: Optional[str] = None
    representation_id: Optional[str] = None
    state_transition_id: Optional[str] = None
    notes: Optional[str] = None
    is_relational_check: bool = False
    # Extended fields used by the deterministic reasoner
    concept_attribute_id: Optional[str] = None
    conclusion_attribute_id: Optional[str] = None
    conclusion_value: Optional[Any] = None
    conditions: List[Expression] = field(default_factory=list)


@dataclass
class ConceptRelationship:
    id: str
    from_concept_id: str
    to_concept_id: str
    relationship_type: str
    path: Optional[str]
    notes: Optional[str]
    binding: Optional[RelationshipBinding] = None
    conditionals: List[Rule] = field(default_factory=list)
    name: str = ""


@dataclass
class ConceptStateTransition:
    id: str
    concept_id: str
    from_value: Optional[str]
    to_value: str
    name: str
    notes: Optional[str]
    guards: List[Rule] = field(default_factory=list)


@dataclass
class Concept:
    id: str
    name: str
    description: Optional[str]
    attributes: Dict[str, ConceptAttribute] = field(default_factory=dict)
    relationships: Dict[str, ConceptRelationship] = field(default_factory=dict)
    invariants: List[Rule] = field(default_factory=list)
    derivations: List[Rule] = field(default_factory=list)
    state_transitions: List[ConceptStateTransition] = field(default_factory=list)
    rules: List[Rule] = field(default_factory=list)


@dataclass
class Entity:
    id: str
    concept_id: str
    attributes: Dict[str, Any]
    external_id: Optional[str] = None
    asset_id: Optional[str] = None


@dataclass
class RepresentationIdentity:
    id: str
    representation_id: str
    identity_strategy_id: str
    identity_expression: str


@dataclass
class RepresentationComparison:
    id: str
    representation_relationship_id: str
    from_column: str
    to_column: str
    notes: Optional[str] = None


@dataclass
class Representation:
    id: str
    concept_id: str
    label: str
    schema_name: Optional[str] = None
    table_name: Optional[str] = None
    owning_subsystem_id: Optional[int] = None
    owner: Optional[str] = None
    raw_metadata: Dict[str, Any] = field(default_factory=dict)
    identity: Optional[RepresentationIdentity] = None
    rules: List[Rule] = field(default_factory=list)


@dataclass
class FrameDimension:
    """v31: A scoping axis for proposition evaluation (governed_reference or typed_scalar)."""
    id: str
    name: str
    description: Optional[str]
    value_kind: str  # 'governed_reference' | 'typed_scalar'
    scalar_type: Optional[str] = None  # 'text'|'integer'|'boolean'|'timestamp'|'numeric' for typed_scalar


@dataclass
class FrameDimensionValue:
    """v31: A governed value within a frame_dimension (per-dimension private lists)."""
    id: str
    dimension_id: str
    value: str
    description: Optional[str] = None


@dataclass
class PropositionFrameValue:
    """v31: An instance-level frame commitment on a proposition."""
    id: str
    proposition_id: str
    dimension_id: str
    reference_value_id: Optional[str] = None  # for governed_reference
    scalar_value: Optional[str] = None         # for typed_scalar


@dataclass
class FrameDimensionMeaning:
    """v35: A proposition that describes the meaning of a frame dimension
    (whole-dimension) or one of its values (value-level)."""
    id: str
    proposition_id: str
    dimension_id: Optional[str] = None
    frame_dimension_value_id: Optional[str] = None


@dataclass
class Proposition:
    id: str
    title: str
    description: Optional[str]
    asset_concept_id: str
    subject_entity_id: str
    disposition: Disposition
    value: Optional[bool] = None
    grounding_status: Optional[str] = None
    assertions: List[Rule] = field(default_factory=list)
    comparisons: List[RepresentationComparison] = field(default_factory=list)
    last_evaluated_at: Optional[datetime] = None
    # v31: frame discipline
    semantic_type_id: Optional[str] = None
    frame_values: List[PropositionFrameValue] = field(default_factory=list)


@dataclass
class FunctionBinding:
    function_name: str
    sql_template: str
    arg_count: int
    return_type: str
    notes: Optional[str] = None
    python_func: Optional[Callable[..., Any]] = None
