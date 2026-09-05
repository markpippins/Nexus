"""Generic Shrapnel state bridge — SOL wiring and deterministic seed helpers.

The default configuration serves the original candidate-state model, while
keeping the bridge module independent of any particular candidate domain.
It implements the Engineer scope of directive 96b22ed4 against the Analyst
finalized seed member set 5232aef7:

- **Asset-id binding**: a `ConceptRelationship` ``PromotionCandidate ->
  ShrapnelFact`` bound on the shared ``asset_id`` attribute, so SOL
  relationship navigation connects a candidate to its shrapnel state
  record (the compiler's ``_relationship_exists`` compares
  ``from_column == to_column``).
- **SOL evaluation**: ``EXISTS(candidate -> state) AND
  state.<member> == true`` expression trees that evaluate over the loaded
  ``ShrapnelFact`` entity's attributes.
- **Deterministic seed hook**: computes the Analyst seed members
  deterministically at candidate-identification time, additive and
  fail-closed — a member is only written when its source evidence
  deterministically establishes it; otherwise it stays absent (which
  evaluates false). The seed writer never guesses.

Ownership boundary (per 5232aef7): Analyst owns seed membership semantics,
DBA owns the Shrapnel EAV shape/write path, Engineer owns asset-ID
relationship navigation and SOL expressions. This module is the SOL side;
it does not write to the shrapnel EAV tables.

The default candidate configuration is domain-agnostic (Option C,
directive d6ffdc06): the model is resolved per database by stable logical
keys (`name` + config namespace), never by hardcoded database ids. SOLScript
carries ZERO concept definitions; the
canonical rows live in `resolution.*` of the database it is pointed at
(loaded by `DatabaseLoader`), and this module only get-or-creates in-memory
model rows when the interpreter has none (e.g. tests).
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    Concept,
    ConceptAttribute,
    ConceptRelationship,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    Quantifier,
    RelationshipBinding,
)

# ── Stable logical keys (per-DB resolution) ────────────────────────────────
# Model rows are located by these logical names in `resolution.*` of whatever
# database the interpreter loaded from — never by hardcoded ids.
CANDIDATE_CONCEPT_NAME = "PromotionCandidate"
STATE_CONCEPT_NAME = "ShrapnelFact"
CANDIDATE_RELATIONSHIP_TYPE = "candidate_has_state_record"
CANDIDATE_RELATIONSHIP_NAME = "candidate-state-record"

# Config namespace for get-or-create fallback ids. Neutral (not nexus-
# specific) and overridable per deployment. Deterministic UUIDs are derived
# from this namespace + logical key, so a fresh interpreter and a seeded DB
# agree on ids without carrying any database literals.
CANDIDATE_STATE_NAMESPACE = os.environ.get(
    "SOLSCRIPT_CANDIDATE_STATE_NAMESPACE", "solscript:candidate-state"
)

# Generic names are the preferred vocabulary. The candidate-prefixed names
# below remain compatibility aliases for existing SOLScript callers.
STATE_BRIDGE_NAMESPACE = CANDIDATE_STATE_NAMESPACE
STATE_BRIDGE_IDENTITY_ATTR = "asset_id"
ASSET_ID_ATTR = STATE_BRIDGE_IDENTITY_ATTR


@dataclass(frozen=True)
class StateBridgeModel:
    """Logical model configuration for a Resolution-to-Shrapnel bridge."""

    resolution_concept_name: str
    state_concept_name: str
    relationship_type: str
    relationship_name: str
    identity_attribute: str
    members: Tuple[str, ...]



def _ns_uuid(seed: str) -> str:
    """Deterministic UUID in the configured namespace (stable across runs)."""
    raw = f"{CANDIDATE_STATE_NAMESPACE}:{seed}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, raw))


def _get_or_create_concept(
    interpreter: Any, name: str, description: str
) -> Concept:
    """Resolve a concept by NAME first (authoritative from the loaded DB);
    only if absent, create it with a namespace-derived id. Never hardcodes a
    database id."""
    concept = interpreter.get_concept_by_name(name)
    if concept is None:
        concept = Concept(
            id=_ns_uuid(f"concept:{name}"),
            name=name,
            description=description,
        )
        interpreter.add_concept(concept)
    return concept


# The Analyst candidate-state seed member set (5232aef7). Each member is a
# deterministic boolean derived from already-persisted evidence at candidate
# identification time. Members NOT in this list must NOT be seeded here:
# interpretation/judgment/approval claims (implementation readiness,
# promotion eligibility, approvals, quality scores, ...) are deferred and
# require role deliberation.
CANDIDATE_STATE_MEMBERS: List[str] = [
    "partial_implementation",
    "detailed_analysis",
    "inspection_or_ir_exists",
    "system_mapped",
    "has_open_questions",
    "sandbox_scaffolded",
]
DEFAULT_STATE_BRIDGE_MODEL = StateBridgeModel(
    resolution_concept_name=CANDIDATE_CONCEPT_NAME,
    state_concept_name=STATE_CONCEPT_NAME,
    relationship_type=CANDIDATE_RELATIONSHIP_TYPE,
    relationship_name=CANDIDATE_RELATIONSHIP_NAME,
    identity_attribute=STATE_BRIDGE_IDENTITY_ATTR,
    members=tuple(CANDIDATE_STATE_MEMBERS),
)


def _attr_id(concept_name: str, attr_name: str) -> str:
    return _ns_uuid(f"attr:{concept_name}:{attr_name}")


def _uuid(seed: str) -> str:
    """Deterministic UUID in the configured namespace (alias of _ns_uuid)."""
    return _ns_uuid(seed)


def ensure_candidate_state_model(interpreter: Any) -> ConceptRelationship:
    """Idempotently register the candidate-state SOL model.

    All model rows are resolved per database by NAME (authoritative when the
    interpreter was loaded from `resolution.*`); fallback ids are derived
    from the configured namespace and never hardcode a database id.

    Registers (when absent):
      - `PromotionCandidate` concept with an `asset_id` attribute
      - member attributes on the `ShrapnelFact` concept (partial_implementation,
        detailed_analysis, ...) with a shared `asset_id` attribute
      - the ``PromotionCandidate -> ShrapnelFact`` relationship bound on
        `asset_id == asset_id` (the asset-id tie)

    Returns the candidate -> state relationship (new or existing).
    """
    candidate = _get_or_create_concept(
        interpreter,
        CANDIDATE_CONCEPT_NAME,
        description="A candidate shrapnel state-record subject (tie via asset_id)",
    )
    state_concept = _get_or_create_concept(
        interpreter,
        STATE_CONCEPT_NAME,
        description="Shrapnel EAV fact objects (standalone facts store)",
    )

    # Candidate asset_id attribute
    if ASSET_ID_ATTR not in {a.name for a in candidate.attributes.values()}:
        candidate.attributes[_attr_id(CANDIDATE_CONCEPT_NAME, ASSET_ID_ATTR)] = ConceptAttribute(
            id=_attr_id(CANDIDATE_CONCEPT_NAME, ASSET_ID_ATTR),
            concept_id=candidate.id,
            name=ASSET_ID_ATTR,
            description="Canonical asset id shared with the shrapnel state record",
            value_type="text",
            is_state_attribute=False,
        )

    # State member attributes (Analyst seed set) + shared asset_id
    existing = {a.name for a in state_concept.attributes.values()}
    if ASSET_ID_ATTR not in existing:
        state_concept.attributes[_attr_id(STATE_CONCEPT_NAME, ASSET_ID_ATTR)] = ConceptAttribute(
            id=_attr_id(STATE_CONCEPT_NAME, ASSET_ID_ATTR),
            concept_id=state_concept.id,
            name=ASSET_ID_ATTR,
            description="Canonical asset id tying the state record to its candidate",
            value_type="text",
            is_state_attribute=False,
        )
    for member in CANDIDATE_STATE_MEMBERS:
        if member not in existing:
            state_concept.attributes[_attr_id(STATE_CONCEPT_NAME, member)] = ConceptAttribute(
                id=_attr_id(STATE_CONCEPT_NAME, member),
                concept_id=state_concept.id,
                name=member,
                description=f"Deterministic candidate-state seed member: {member}",
                value_type="boolean",
                is_state_attribute=False,
            )

    # The asset-id tie relationship. Resolved first by (from, to, type) so a
    # DB-loaded relationship (any id) is reused; fallback id is namespace-
    # derived. from_concept uses the ACTUAL candidate concept id (resolved
    # by name above).
    rel_id = _ns_uuid(
        f"rel:{CANDIDATE_CONCEPT_NAME}->{STATE_CONCEPT_NAME}:{ASSET_ID_ATTR}"
    )
    for existing_rel in interpreter.relationships.values():
        if (
            existing_rel.from_concept_id == candidate.id
            and existing_rel.to_concept_id == state_concept.id
            and existing_rel.relationship_type == CANDIDATE_RELATIONSHIP_TYPE
        ):
            return existing_rel
    existing_rel = interpreter.get_relationship(rel_id)
    if existing_rel is not None:
        return existing_rel

    rel = ConceptRelationship(
        id=rel_id,
        from_concept_id=candidate.id,
        to_concept_id=state_concept.id,
        relationship_type=CANDIDATE_RELATIONSHIP_TYPE,
        path=None,
        notes="Candidate -> shrapnel state record, bound on the shared asset_id attribute",
        binding=RelationshipBinding(
            from_schema="",  # attributes are entity attributes, not a physical table
            from_table="",
            from_column=ASSET_ID_ATTR,
            to_schema="",
            to_table="",
            to_column=ASSET_ID_ATTR,
        ),
        name=CANDIDATE_RELATIONSHIP_NAME,
    )
    interpreter.relationships[rel.id] = rel
    candidate.relationships[rel.id] = rel
    return rel


def ensure_state_bridge_model(
    interpreter: Any,
    model: Optional[StateBridgeModel] = None,
) -> ConceptRelationship:
    """Register a generic state bridge model by logical names.

    The default model delegates to the compatibility-preserving candidate
    registration. Custom domains can provide their own concept names,
    relationship type/name, identity attribute, and explicitly approved
    member list without changing the evaluator or importing Nexus concepts.
    """
    configured = model or DEFAULT_STATE_BRIDGE_MODEL
    if configured is DEFAULT_STATE_BRIDGE_MODEL:
        return ensure_candidate_state_model(interpreter)

    source = _get_or_create_concept(
        interpreter,
        configured.resolution_concept_name,
        description="State bridge subject",
    )
    state = _get_or_create_concept(
        interpreter,
        configured.state_concept_name,
        description="State bridge source fact",
    )
    existing = {attr.name for attr in source.attributes.values()}
    if configured.identity_attribute not in existing:
        source.attributes[_attr_id(configured.resolution_concept_name, configured.identity_attribute)] = ConceptAttribute(
            id=_attr_id(configured.resolution_concept_name, configured.identity_attribute),
            concept_id=source.id,
            name=configured.identity_attribute,
            description="Bridge identity attribute",
            value_type="text",
            is_state_attribute=False,
        )
    existing = {attr.name for attr in state.attributes.values()}
    for name in [configured.identity_attribute, *configured.members]:
        if name not in existing:
            state.attributes[_attr_id(configured.state_concept_name, name)] = ConceptAttribute(
                id=_attr_id(configured.state_concept_name, name),
                concept_id=state.id,
                name=name,
                description=f"State bridge member: {name}",
                value_type="text" if name == configured.identity_attribute else "boolean",
                is_state_attribute=False,
            )
    for relation in interpreter.relationships.values():
        if (
            relation.from_concept_id == source.id
            and relation.to_concept_id == state.id
            and relation.relationship_type == configured.relationship_type
        ):
            return relation
    relation = ConceptRelationship(
        id=_ns_uuid(
            f"rel:{configured.resolution_concept_name}->{configured.state_concept_name}:{configured.identity_attribute}"
        ),
        from_concept_id=source.id,
        to_concept_id=state.id,
        relationship_type=configured.relationship_type,
        path=None,
        notes="Generic state bridge bound on the configured identity attribute",
        binding=RelationshipBinding(
            from_schema="",
            from_table="",
            from_column=configured.identity_attribute,
            to_schema="",
            to_table="",
            to_column=configured.identity_attribute,
        ),
        name=configured.relationship_name,
    )
    interpreter.relationships[relation.id] = relation
    source.relationships[relation.id] = relation
    return relation


def build_member_exists_expression(
    relationship: ConceptRelationship,
    member_attr: ConceptAttribute,
) -> Expression:
    """Build ``EXISTS(candidate -> state) AND state.<member> == true``.

    The returned expression is a RELATIONSHIP_REF (quantifier EXISTS) whose
    child is ``state.<member> == true`` — the compiler evaluates the child
    against each related state entity, so the whole expression is true iff
    at least one state record tied to the candidate by asset_id has the
    member attribute equal to true.
    """
    member_check = Expression(
        id=_uuid(f"expr:{relationship.id}:{member_attr.name}:check"),
        kind=ExpressionKind.OPERATOR,
        return_type="boolean",
        operator=Operator.EQ,
        operands=[
            Expression(
                id=_uuid(f"expr:{relationship.id}:{member_attr.name}:ref"),
                kind=ExpressionKind.ATTRIBUTE_REF,
                return_type="boolean",
                attribute_id=member_attr.id,
            ),
            Expression(
                id=_uuid(f"expr:{relationship.id}:{member_attr.name}:true"),
                kind=ExpressionKind.LITERAL,
                return_type="boolean",
                literal_value=True,
            ),
        ],
    )
    return Expression(
        id=_uuid(f"expr:{relationship.id}:{member_attr.name}:exists"),
        kind=ExpressionKind.RELATIONSHIP_REF,
        return_type="boolean",
        concept_relationship_id=relationship.id,
        quantifier=Quantifier.EXISTS,
        operands=[member_check],
        label=f"EXISTS bridge -> state AND state.{member_attr.name} == true",
    )


def evaluate_state_members(
    interpreter: Any,
    candidate: Entity,
    members: Optional[List[str]] = None,
    model: Optional[StateBridgeModel] = None,
) -> Dict[str, bool]:
    """Evaluate the seed members for a candidate via SOL.

    Returns ``{member: bool}`` for every Analyst seed member, evaluated
    through the relationship navigation (asset_id tie) + EXISTS child check.
    A member with no seeded state record (or absent attribute) evaluates
    false.
    """
    configured_model = model or DEFAULT_STATE_BRIDGE_MODEL
    configured_members = members or list(configured_model.members)
    rel = ensure_state_bridge_model(interpreter, configured_model)
    state_concept = interpreter.get_concept_by_name(configured_model.state_concept_name)
    if state_concept is None:
        return {}

    out: Dict[str, bool] = {}
    for member in configured_members:
        attr = next((a for a in state_concept.attributes.values() if a.name == member), None)
        if attr is None:
            out[member] = False
            continue
        expr = build_member_exists_expression(rel, attr)
        out[member] = bool(interpreter.evaluate(expr, {"entity": candidate}))
    return out


# Legacy name retained for callers that still describe the subject as a
# candidate. New code should use evaluate_state_members.
evaluate_candidate_state_members = evaluate_state_members


def deterministic_seed_members(
    candidate: Dict[str, Any], evidence: Dict[str, Any]
) -> Dict[str, Any]:
    """Compute the Analyst seed members deterministically (fail-closed).

    `candidate`: dict with at least the candidate's canonical asset identity
    (`asset_id`) and mapping info (`system_id`/`subsystem_id`).
    `evidence`: a source snapshot with:
      - `kind_maturity`: list of `(kind, maturity)` pairs from linked
        agent-record evidence
      - `has_inspection_or_ir`: bool — linked Design IR / inspection artifact
      - `has_open_questions`: bool — linked planner/open-question record
      - `sandbox_scaffolded`: bool — persisted sandbox/scaffold artifact

    Deterministic members only. A member is written ONLY when its source can
    be evaluated deterministically; any member whose source is missing,
    stale, conflicting, or unresolvable stays ABSENT (evaluates false). The
    seed writer never guesses and never derives judgment claims.
    """
    members: Dict[str, Any] = {}

    asset_id = candidate.get(ASSET_ID_ATTR)
    if asset_id:
        members[ASSET_ID_ATTR] = asset_id

    km = evidence.get("kind_maturity")
    if km is not None:
        partial = [
            (k, m)
            for (k, m) in km
            if k == "implementation" and m in ("partial", "partial-augmented")
        ]
        members["partial_implementation"] = bool(partial)
        detailed = [
            (k, m)
            for (k, m) in km
            if k == "analysis" and m in ("detailed", "comprehensive")
        ]
        members["detailed_analysis"] = bool(detailed)

    for bool_key, ev_key in (
        ("inspection_or_ir_exists", "has_inspection_or_ir"),
        ("has_open_questions", "has_open_questions"),
        ("sandbox_scaffolded", "sandbox_scaffolded"),
    ):
        val = evidence.get(ev_key)
        if isinstance(val, bool):
            members[bool_key] = val

    # system_mapped: candidate has a non-null canonical system/subsystem
    # mapping resolving to an existing mapped entity. Deterministically
    # derivable only when both identity values are present.
    if candidate.get("system_id") is not None and candidate.get("subsystem_id") is not None:
        members["system_mapped"] = True
    elif candidate.get("system_id") is not None and evidence.get("system_mapped") is True:
        members["system_mapped"] = True
    return members


# Generic API names; the seed semantics remain the approved default model's
# deterministic evidence mapping. Existing candidate callers retain the old
# names through the compatibility shim.
deterministic_state_members = deterministic_seed_members

__all__ = [
    "ASSET_ID_ATTR",
    "CANDIDATE_CONCEPT_NAME",
    "CANDIDATE_RELATIONSHIP_NAME",
    "CANDIDATE_RELATIONSHIP_TYPE",
    "CANDIDATE_STATE_MEMBERS",
    "CANDIDATE_STATE_NAMESPACE",
    "DEFAULT_STATE_BRIDGE_MODEL",
    "STATE_BRIDGE_IDENTITY_ATTR",
    "STATE_BRIDGE_NAMESPACE",
    "STATE_CONCEPT_NAME",
    "StateBridgeModel",
    "build_member_exists_expression",
    "deterministic_seed_members",
    "deterministic_state_members",
    "ensure_candidate_state_model",
    "ensure_state_bridge_model",
    "evaluate_candidate_state_members",
    "evaluate_state_members",
]
