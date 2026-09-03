"""Tests for the candidate-state SOL wiring (directive 96b22ed4).

Mirrors `test_shrapnel_loader.py`: a candidate state record is loaded from
shrapnel EAV rows (property_name attributes on a ShrapnelFact entity), a
candidate entity is registered with the shared asset_id, and the two EXISTS
predicates evaluate deterministically over the seeded state record.

The Analyst seed member set (5232aef7) defines which members exist; this
test covers the Engineer-owned SOL side: asset-id relationship navigation
and EXISTS expression evaluation. The shrapnel EAV write path remains DBA's.
"""

from __future__ import annotations

from typing import Any, List

import pytest

from solscript import Concept, Entity, ResolutionInterpreter
from solscript.candidate_state import (
    CANDIDATE_STATE_MEMBERS,
    build_member_exists_expression,
    deterministic_seed_members,
    ensure_candidate_state_model,
    evaluate_candidate_state_members,
)
from solscript.database_loader import DatabaseLoader

from .conftest import BoomConn, FakeConn, FakePool, _row, _run


def _candidate_concept_id(interp: ResolutionInterpreter) -> str:
    """PromotionCandidate resolves BY NAME (domain-agnostic; never a
    hardcoded database id)."""
    concept = interp.get_concept_by_name("PromotionCandidate")
    assert concept is not None
    return concept.id


def _state_concept(interp: ResolutionInterpreter) -> Concept:
    """ShrapnelFact resolves BY NAME (domain-agnostic)."""
    concept = interp.get_concept_by_name("ShrapnelFact")
    assert concept is not None
    return concept


def _load_state_record(interp: ResolutionInterpreter) -> None:
    """Load one shrapnel state record (asset 1001) via the EAV loader."""
    conn = FakeConn(
        [
            # shrapnel.field rows
            [
                _row(id=1, name="Asset", property_name="asset_id", field_type_code=2),
                _row(id=2, name="Partial Implementation", property_name="partial_implementation", field_type_code=4),
                _row(id=3, name="Detailed Analysis", property_name="detailed_analysis", field_type_code=4),
                _row(id=4, name="Has Open Questions", property_name="has_open_questions", field_type_code=4),
            ],
            # object_instance JOIN oav JOIN value
            [
                _row(object_id=1001, field_id=1, value_id=11, value_type_code=2),
                _row(object_id=1001, field_id=2, value_id=12, value_type_code=4),
                _row(object_id=1001, field_id=3, value_id=13, value_type_code=4),
                _row(object_id=1001, field_id=4, value_id=19, value_type_code=4),
            ],
            [],  # value_long
            [_row(id=11, value="asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001")],  # value_string
            [],  # value_double
            [_row(id=12, value=True), _row(id=13, value=False), _row(id=19, value=True)],  # value_boolean
        ]
    )
    loader = DatabaseLoader(interp, FakePool(conn))
    _run(loader.load_shrapnel_facts())


def test_asset_id_relationship_navigation() -> None:
    """Candidate -> state resolved via the shared asset id in SOL."""
    interp = ResolutionInterpreter()
    _load_state_record(interp)
    rel = ensure_candidate_state_model(interp)

    # The state record: shrapnel:1001 with matching asset_id
    state = interp.entities["shrapnel:1001"]
    assert state.attributes["asset_id"] == "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"

    # Candidate with the SAME asset id
    candidate = Entity(
        id="candidate:9001",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    interp.add_entity(candidate)

    from solscript.expression_compiler import ExpressionCompiler

    compiler = ExpressionCompiler(interp)
    related = compiler._get_related_entities({"entity": candidate}, rel, None)
    assert [e.id for e in related] == ["shrapnel:1001"]

    # A candidate with a DIFFERENT asset id resolves nothing
    other = Entity(
        id="candidate:9002",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:bbbb0000-0000-4000-8000-000000000002"},
        external_id="9002",
    )
    interp.add_entity(other)
    assert compiler._get_related_entities({"entity": other}, rel, None) == []


def test_exists_predicates_evaluate_over_seeded_state() -> None:
    """The two EXISTS predicates evaluate deterministically (Analyst seeds)."""
    interp = ResolutionInterpreter()
    _load_state_record(interp)
    rel = ensure_candidate_state_model(interp)

    candidate = Entity(
        id="candidate:9001",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    interp.add_entity(candidate)

    state_concept = _state_concept(interp)
    member_attrs = {a.name: a for a in state_concept.attributes.values()}

    partial = build_member_exists_expression(rel, member_attrs["partial_implementation"])
    detailed = build_member_exists_expression(rel, member_attrs["detailed_analysis"])
    open_qs = build_member_exists_expression(rel, member_attrs["has_open_questions"])

    assert interp.evaluate(partial, {"entity": candidate}) is True  # seeded true
    assert interp.evaluate(detailed, {"entity": candidate}) is False  # seeded false
    assert interp.evaluate(open_qs, {"entity": candidate}) is True

    # Unrelated candidate (no state record) -> EXISTS false, not an error
    other = Entity(
        id="candidate:9002",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:bbbb0000-0000-4000-8000-000000000002"},
        external_id="9002",
    )
    interp.add_entity(other)
    assert interp.evaluate(partial, {"entity": other}) is False


def test_evaluate_candidate_state_members_all_keys() -> None:
    """evaluate_candidate_state_members returns every Analyst member."""
    interp = ResolutionInterpreter()
    _load_state_record(interp)
    ensure_candidate_state_model(interp)

    candidate = Entity(
        id="candidate:9001",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    interp.add_entity(candidate)

    result = evaluate_candidate_state_members(interp, candidate)
    assert set(result.keys()) == set(CANDIDATE_STATE_MEMBERS)
    assert result["partial_implementation"] is True
    assert result["detailed_analysis"] is False
    # Absent seed members (no EAV column) evaluate false, not error
    assert result["sandbox_scaffolded"] is False


def test_deterministic_seed_fail_closed() -> None:
    """Seed writer fails closed: never guesses judgment claims."""
    candidate = {"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"}
    evidence = {
        "kind_maturity": [
            ("implementation", "partial"),
            ("analysis", "detailed"),
            ("analysis", "outline"),  # below the detailed threshold
        ],
        "has_inspection_or_ir": True,
        "has_open_questions": False,
        "sandbox_scaffolded": True,  # not in the EAV set above, but deterministically known
    }
    members = deterministic_seed_members(candidate, evidence)

    assert members["asset_id"] == "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"
    assert members["partial_implementation"] is True
    assert members["detailed_analysis"] is True
    assert members["inspection_or_ir_exists"] is True
    assert members["has_open_questions"] is False
    assert members["sandbox_scaffolded"] is True
    # Judgment claims are never seeded by this hook
    for deferred in ("implementation_ready", "promotion_eligible", "approved", "quality_score"):
        assert deferred not in members


def test_deterministic_seed_absent_is_not_guessed() -> None:
    """Missing/unqueryable evidence stays absent — never guessed false."""
    candidate = {"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"}
    # No evidence snapshot: members are absent, not false
    members = deterministic_seed_members(candidate, {})
    assert members == {"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"}


def test_model_resolves_state_concept_by_name() -> None:
    """When ShrapnelFact is DB-loaded (non-fallback id), the relationship
    navigates via the ACTUAL concept id — not the hardcoded fallback."""
    interp = ResolutionInterpreter()
    # Simulate a resolution-schema-loaded concept (real id, not the fallback)
    db_concept = Concept(id="aaaa0000-0000-0000-0000-00000000aaaa", name="ShrapnelFact", description="DB-loaded")
    interp.add_concept(db_concept)
    _load_state_record(interp)  # creates shrapnel:1001 entity under that concept

    rel = ensure_candidate_state_model(interp)
    assert rel.to_concept_id == db_concept.id  # NOT the hardcoded fallback id

    candidate = Entity(
        id="candidate:9001",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    interp.add_entity(candidate)

    from solscript.expression_compiler import ExpressionCompiler

    compiler = ExpressionCompiler(interp)
    related = compiler._get_related_entities({"entity": candidate}, rel, None)
    assert [e.id for e in related] == ["shrapnel:1001"]


def test_evaluate_members_resolves_concept_by_name() -> None:
    """Full evaluation (not just navigation) works when ShrapnelFact is
    DB-loaded under a non-fallback id."""
    interp = ResolutionInterpreter()
    db_concept = Concept(id="aaaa0000-0000-0000-0000-00000000aaaa", name="ShrapnelFact", description="DB-loaded")
    interp.add_concept(db_concept)
    _load_state_record(interp)

    ensure_candidate_state_model(interp)
    candidate = Entity(
        id="candidate:9001",
        concept_id=_candidate_concept_id(interp),
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    interp.add_entity(candidate)

    result = evaluate_candidate_state_members(interp, candidate)
    assert result["partial_implementation"] is True
    assert result["detailed_analysis"] is False


def test_db_seeded_attribute_level_binding_hydrates() -> None:
    """A DB-seeded relationship row whose binding is attribute-level (empty
    schema/table, columns only — the candidate-state model) hydrates through
    ``load_relationships`` and navigates by asset_id.

    Regression for the migration seeding (0003_candidate_state_model.sql,
    directive d6ffdc06): the loader used to gate binding hydration on
    non-empty ``from_schema``/``to_schema``, which silently dropped the
    attribute-level binding the DB seed writes and broke navigation for both
    nexus and sol.
    """
    interp = ResolutionInterpreter()
    cand = Concept(id="b0000000-0000-0000-0000-000000000001", name="PromotionCandidate", description="candidate")
    state = Concept(id="00000000-0000-4000-8000-000000000001", name="ShrapnelFact", description="state")
    interp.add_concept(cand)
    interp.add_concept(state)

    # One relationship row + one attribute-level binding row (FROM the DB
    # seed: empty schema/table, asset_id columns only) — exactly the shape
    # migration 0003 writes into resolution.concept_relationship_binding.
    rel_row = _row(
        id="bdfcd10d-d31a-505f-8d79-de9a2fb163fb",
        from_concept_id=cand.id,
        to_concept_id=state.id,
        relationship_type="candidate_has_state_record",
        path=None,
        notes="Candidate -> shrapnel state record, bound on the shared asset_id attribute",
        from_schema="",
        from_table="",
        from_column="asset_id",
        to_schema="",
        to_table="",
        to_column="asset_id",
    )
    conn = FakeConn([[rel_row]])
    loader = DatabaseLoader(interp, FakePool(conn))
    _run(loader.load_relationships())

    rel = interp.relationships["bdfcd10d-d31a-505f-8d79-de9a2fb163fb"]
    assert rel.binding is not None  # NOT silently dropped
    assert rel.binding.from_column == "asset_id"
    assert rel.binding.to_column == "asset_id"

    # And it navigates: candidate -> state on shared asset_id
    candidate = Entity(
        id="candidate:9001",
        concept_id=cand.id,
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="9001",
    )
    state_ent = Entity(
        id="shrapnel:1001",
        concept_id=state.id,
        attributes={"asset_id": "asset:nexus:nebula_agent_records:aaaa0000-0000-4000-8000-000000000001"},
        external_id="1001",
    )
    interp.add_entity(candidate)
    interp.add_entity(state_ent)

    from solscript.expression_compiler import ExpressionCompiler

    compiler = ExpressionCompiler(interp)
    related = compiler._get_related_entities({"entity": candidate}, rel, None)
    assert [e.id for e in related] == ["shrapnel:1001"]


def test_missing_shrapnel_schema_is_best_effort() -> None:
    """Absent shrapnel schema does not break the model registration."""
    interp = ResolutionInterpreter()
    loader = DatabaseLoader(interp, FakePool(BoomConn()))
    _run(loader.load_shrapnel_facts())
    # Model still registers cleanly (no EAV data to navigate)
    rel = ensure_candidate_state_model(interp)
    assert rel.binding is not None
    assert rel.binding.from_column == "asset_id"
    assert rel.binding.to_column == "asset_id"