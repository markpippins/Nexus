"""Shared fixtures for SOLScript tests."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    ConceptRelationship,
    ConceptStateTransition,
    Disposition,
    Entity,
    Expression,
    ExpressionKind,
    FunctionBinding,
    Operator,
    Proposition,
    ResolutionInterpreter,
    Rule,
    RuleType,
    Severity,
)
from solscript.expression_compiler import ExpressionCompiler


def _uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def interp() -> ResolutionInterpreter:
    """A fresh interpreter with no data loaded."""
    return ResolutionInterpreter()


@pytest.fixture
def wr_concept(interp: ResolutionInterpreter) -> Concept:
    """A WorkRequest concept with status (state attr) and title."""
    cid = _uid()
    concept = Concept(id=cid, name="WorkRequest", description="A work request")
    interp.add_concept(concept)

    status_attr = ConceptAttribute(
        id=_uid(),
        concept_id=cid,
        name="status",
        description="Current status",
        value_type="text",
        is_state_attribute=True,
        allowed_values=["DRAFT", "APPROVED", "DISPATCHED", "COMPLETED", "CANCELLED"],
    )
    concept.attributes[status_attr.id] = status_attr

    title_attr = ConceptAttribute(
        id=_uid(),
        concept_id=cid,
        name="title",
        description="Title",
        value_type="text",
        is_state_attribute=False,
    )
    concept.attributes[title_attr.id] = title_attr

    return concept


@pytest.fixture
def wr_entity(interp: ResolutionInterpreter, wr_concept: Concept) -> Entity:
    """A DRAFT WorkRequest entity."""
    return interp.add_entity_by_concept_name(
        "WorkRequest",
        {"status": "DRAFT", "title": "Fix bug #123"},
        external_id="WR-001",
    )


@pytest.fixture
def wr_invariant(interp: ResolutionInterpreter, wr_concept: Concept) -> Rule:
    """Invariant rule: status attribute must not be null."""
    attr = next(
        a for a in wr_concept.attributes.values() if a.name == "status"
    )
    expr = Expression(
        id=_uid(),
        kind=ExpressionKind.ATTRIBUTE_REF,
        return_type="text",
        attribute_id=attr.id,
    )
    rule = Rule(
        id=_uid(),
        name="Status must not be null",
        rule_type=RuleType.INVARIANT,
        expression=expr,
        severity=Severity.HARD,
        concept_id=wr_concept.id,
    )
    wr_concept.invariants.append(rule)
    interp.rules[rule.id] = rule
    return rule
