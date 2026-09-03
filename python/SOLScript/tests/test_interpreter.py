"""Tests for solscript.interpreter.ResolutionInterpreter."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    ConceptStateTransition,
    Disposition,
    Entity,
    Expression,
    ExpressionKind,
    FrameDimension,
    FrameDimensionMeaning,
    FrameDimensionValue,
    Proposition,
    ResolutionInterpreter,
    Rule,
    RuleType,
    Severity,
)


def _uid() -> str:
    return str(uuid.uuid4())


# ── Concept management ───────────────────────────────────────────────


class TestConcepts:
    def test_add_and_get_concept(self, interp: ResolutionInterpreter) -> None:
        c = Concept(id=_uid(), name="Item", description="An item")
        interp.add_concept(c)
        assert interp.get_concept(c.id) is c

    def test_get_concept_by_name(self, interp: ResolutionInterpreter) -> None:
        c = Concept(id=_uid(), name="Item", description="An item")
        interp.add_concept(c)
        assert interp.get_concept_by_name("Item") is c

    def test_get_nonexistent_concept(self, interp: ResolutionInterpreter) -> None:
        assert interp.get_concept("nope") is None

    def test_get_nonexistent_name(self, interp: ResolutionInterpreter) -> None:
        assert interp.get_concept_by_name("Nope") is None


# ── Entity management ────────────────────────────────────────────────


class TestEntities:
    def test_add_entity_by_concept_name(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"}, external_id="WR-001",
        )
        assert entity.concept_id == wr_concept.id
        assert entity.attributes["status"] == "DRAFT"
        assert entity.external_id == "WR-001"
        assert interp.get_entity(entity.id) is entity

    def test_add_entity_unknown_concept_raises(
        self, interp: ResolutionInterpreter,
    ) -> None:
        with pytest.raises(ValueError, match="Concept not found"):
            interp.add_entity_by_concept_name("Nope", {})

    def test_get_entity_by_external_id(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"}, external_id="WR-001",
        )
        found = interp.get_entity_by_external_id("WR-001")
        assert found is entity

    def test_get_entity_by_external_id_not_found(
        self, interp: ResolutionInterpreter,
    ) -> None:
        assert interp.get_entity_by_external_id("WR-999") is None


# ── Attribute lookups ────────────────────────────────────────────────


class TestAttributes:
    def test_get_attribute(self, interp: ResolutionInterpreter, wr_concept: Concept) -> None:
        attr = next(a for a in wr_concept.attributes.values() if a.name == "status")
        found = interp.get_attribute(attr.id)
        assert found is attr

    def test_get_attribute_not_found(self, interp: ResolutionInterpreter) -> None:
        assert interp.get_attribute("nonexistent") is None


# ── Rule checking ────────────────────────────────────────────────────


class TestRuleChecking:
    def test_check_rule_passes(
        self,
        interp: ResolutionInterpreter,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        passed, reason = interp.check_rule(wr_invariant, wr_entity)
        assert passed is True
        assert "passed" in reason

    def test_check_rule_fails_when_attr_missing(
        self,
        interp: ResolutionInterpreter,
        wr_concept: Concept,
        wr_invariant: Rule,
    ) -> None:
        entity = Entity(
            id=_uid(), concept_id=wr_concept.id, attributes={},
        )
        interp.add_entity(entity)
        passed, reason = interp.check_rule(wr_invariant, entity)
        # Expression resolves 'status' → None (not in attributes) → bool(None) = False
        assert passed is False
        assert "failed" in reason

    def test_check_rule_fails_hard(
        self,
        interp: ResolutionInterpreter,
        wr_invariant: Rule,
    ) -> None:
        entity = Entity(
            id=_uid(), concept_id="nonexistent", attributes={},
        )
        # The expression tries to resolve the attribute — if entity has no
        # matching attribute, it returns None → bool(None) = False → failed
        # But the entity needs to be registered for context resolution
        interp.add_entity(entity)
        passed, reason = interp.check_rule(wr_invariant, entity)
        assert passed is False
        assert "failed" in reason

    def test_check_rule_no_expression(self, interp: ResolutionInterpreter) -> None:
        rule = Rule(
            id=_uid(), name="Empty",
            rule_type=RuleType.INVARIANT, expression=None,
            severity=Severity.HARD,
        )
        entity = Entity(id=_uid(), concept_id="x", attributes={})
        passed, reason = interp.check_rule(rule, entity)
        assert passed is False
        assert "no expression" in reason

    def test_soft_rule_exception_is_swallowed(
        self,
        interp: ResolutionInterpreter,
        wr_concept: Concept,
    ) -> None:
        bad_expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="nonexistent", return_type="text",
        )
        rule = Rule(
            id=_uid(), name="Soft bad rule",
            rule_type=RuleType.INVARIANT, expression=bad_expr,
            severity=Severity.SOFT, concept_id=wr_concept.id,
        )
        entity = interp.add_entity_by_concept_name("WorkRequest", {"status": "DRAFT"})
        passed, reason = interp.check_rule(rule, entity)
        assert passed is True  # soft errors pass
        assert "soft error" in reason


# ── Proposition evaluation ───────────────────────────────────────────


class TestPropositionEvaluation:
    def test_evaluate_proposition_passes(
        self,
        interp: ResolutionInterpreter,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_entity.concept_id,
            subject_entity_id=wr_entity.id,
            disposition=Disposition.PENDING,
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)
        result, _, _ = interp.evaluate_proposition(prop)
        assert result == Disposition.ASSERTED

    def test_evaluate_proposition_rejects_when_entity_missing(
        self, interp: ResolutionInterpreter, wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id="x",
            subject_entity_id="nonexistent",
            disposition=Disposition.PENDING,
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)
        result, _, _ = interp.evaluate_proposition(prop)
        assert result == Disposition.REJECTED

    def test_evaluate_proposition_rejects_when_assertion_fails(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = Entity(
            id=_uid(), concept_id=wr_concept.id, attributes={},
        )
        interp.add_entity(entity)

        attr = next(a for a in wr_concept.attributes.values() if a.name == "status")
        expr = Expression(
            id=_uid(), kind=ExpressionKind.ATTRIBUTE_REF,
            return_type="text", attribute_id=attr.id,
        )
        rule = Rule(
            id=_uid(), name="Check",
            rule_type=RuleType.INVARIANT, expression=expr,
            severity=Severity.HARD, concept_id=wr_concept.id,
        )
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_concept.id,
            subject_entity_id=entity.id,
            disposition=Disposition.PENDING,
            assertions=[rule],
        )
        interp.add_proposition(prop)
        result, _, _ = interp.evaluate_proposition(prop)
        # entity.attributes["status"] doesn't exist → get returns None → bool(None) = False
        assert result == Disposition.REJECTED


# ── Change events ────────────────────────────────────────────────────


class TestChangeEvent:
    def test_on_change_updates_proposition_disposition(
        self,
        interp: ResolutionInterpreter,
        wr_concept: Concept,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_concept.id,
            subject_entity_id=wr_entity.id,
            disposition=Disposition.PENDING,
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)

        # Initially PENDING → evaluate → ASSERTED (status=DRAFT is not None)
        events = interp.on_change("WorkRequest", wr_entity.id)
        assert len(events) == 1
        assert events[0][2] == Disposition.ASSERTED
        assert prop.disposition == Disposition.ASSERTED

    def test_on_change_noop_when_already_correct(
        self,
        interp: ResolutionInterpreter,
        wr_concept: Concept,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_concept.id,
            subject_entity_id=wr_entity.id,
            disposition=Disposition.ASSERTED,  # already correct
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)

        events = interp.on_change("WorkRequest", wr_entity.id)
        assert len(events) == 0  # no change

    def test_on_change_entity_not_found(self, interp: ResolutionInterpreter) -> None:
        events = interp.on_change("WorkRequest", "nonexistent")
        assert events == []

    def test_on_change_concept_not_found(
        self, interp: ResolutionInterpreter, wr_entity: Entity,
    ) -> None:
        events = interp.on_change("Nonexistent", wr_entity.id)
        assert events == []

    def test_event_handler_called(self, interp: ResolutionInterpreter, wr_concept: Concept) -> None:
        calls: list = []
        interp.register_event_handler(lambda *a: calls.append(a))

        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )

        # No propositions → no proposition events, but handler is still called
        events = interp.on_change("WorkRequest", entity.id)
        assert events == []  # no proposition changes
        assert len(calls) == 1  # handler was invoked with (concept_name, entity_id, [])


# ── State transitions ────────────────────────────────────────────────


class TestStateTransitions:
    def test_transition_entity_passes(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )
        state_attr = next(
            a for a in wr_concept.attributes.values() if a.is_state_attribute
        )
        transition = ConceptStateTransition(
            id=_uid(), concept_id=wr_concept.id,
            from_value="DRAFT", to_value="APPROVED",
            name="approve", notes=None,
        )
        interp.state_transitions[transition.id] = transition
        wr_concept.state_transitions.append(transition)

        passed, results = interp.transition_entity(entity.id, transition.id)
        assert passed is True
        assert entity.attributes["status"] == "APPROVED"

    def test_transition_entity_fails_guard(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )
        state_attr = next(
            a for a in wr_concept.attributes.values() if a.is_state_attribute
        )
        # Guard that always fails
        bad_expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=False,
        )
        guard = Rule(
            id=_uid(), name="always fails",
            rule_type=RuleType.GUARD, expression=bad_expr,
            severity=Severity.HARD,
        )
        transition = ConceptStateTransition(
            id=_uid(), concept_id=wr_concept.id,
            from_value="DRAFT", to_value="APPROVED",
            name="approve", notes=None, guards=[guard],
        )
        interp.state_transitions[transition.id] = transition

        passed, results = interp.transition_entity(entity.id, transition.id)
        assert passed is False
        assert entity.attributes["status"] == "DRAFT"  # unchanged

    def test_transition_event_listener_captures_committed_read_set(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )
        transition = ConceptStateTransition(
            id=_uid(), concept_id=wr_concept.id,
            from_value="DRAFT", to_value="APPROVED",
            name="approve", notes=None,
        )
        interp.state_transitions[transition.id] = transition
        events = []
        interp.register_transition_event_listener(
            lambda **kw: events.append(kw["event"])
        )

        passed, _ = interp.transition_entity(
            entity.id, transition.id, source_event_id="evt-001",
            correlation_id="corr-001", actor="test-agent",
        )

        assert passed is True
        assert len(events) == 1
        event = events[0]
        assert event.event_id == "sol-api:evt-001"
        assert event.idempotency_key == "sol-api:evt-001"
        assert event.kind == "resolution.transition.committed"
        assert event.outcome == "committed"
        assert event.read_set["entity_id"] == entity.id
        assert event.read_set["transition_id"] == transition.id
        assert event.read_set["guard_results"] == []
        assert event.payload == {"transition_id": transition.id}

    def test_transition_event_listener_captures_refusal_without_mutation(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )
        bad_expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=False,
        )
        guard = Rule(
            id=_uid(), name="always fails",
            rule_type=RuleType.GUARD, expression=bad_expr,
            severity=Severity.HARD,
        )
        transition = ConceptStateTransition(
            id=_uid(), concept_id=wr_concept.id,
            from_value="DRAFT", to_value="APPROVED",
            name="approve", notes=None, guards=[guard],
        )
        interp.state_transitions[transition.id] = transition
        events = []
        interp.register_transition_event_listener(
            lambda **kw: events.append(kw["event"])
        )

        passed, _ = interp.transition_entity(
            entity.id, transition.id, source_event_id="evt-refused",
        )

        assert passed is False
        assert entity.attributes["status"] == "DRAFT"
        assert len(events) == 1
        assert events[0].kind == "resolution.transition.refused"
        assert events[0].outcome == "refused"
        assert events[0].read_set["guard_results"][0]["passed"] is False

    def test_transition_listener_fires_on_success_only(
        self, interp: ResolutionInterpreter, wr_concept: Concept,
    ) -> None:
        """Listeners fire after a SUCCESSFUL transition, never after a guard failure."""
        entity = interp.add_entity_by_concept_name(
            "WorkRequest", {"status": "DRAFT"},
        )
        bad_expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=False,
        )
        guard = Rule(
            id=_uid(), name="always fails",
            rule_type=RuleType.GUARD, expression=bad_expr,
            severity=Severity.HARD,
        )
        transition = ConceptStateTransition(
            id=_uid(), concept_id=wr_concept.id,
            from_value="DRAFT", to_value="APPROVED",
            name="approve", notes=None, guards=[guard],
        )
        interp.state_transitions[transition.id] = transition

        calls = []
        interp.register_transition_listener(
            lambda **kw: calls.append(kw.get("transition_id"))
        )

        # Guard fails -> no listener call
        passed, _ = interp.transition_entity(entity.id, transition.id)
        assert passed is False
        assert calls == []

        # Remove the guard, transition succeeds -> listener fires with kwargs
        transition.guards = []
        passed, _ = interp.transition_entity(entity.id, transition.id)
        assert passed is True
        assert calls == [transition.id]

    def test_transition_entity_not_found(self, interp: ResolutionInterpreter) -> None:
        passed, results = interp.transition_entity("nonexistent", "nonexistent")
        assert passed is False
        assert "Entity not found" in str(results)

    def test_transition_not_found(self, interp: ResolutionInterpreter, wr_concept: Concept) -> None:
        entity = interp.add_entity_by_concept_name("WorkRequest", {"status": "DRAFT"})
        passed, results = interp.transition_entity(entity.id, "nonexistent")
        assert passed is False
        assert "Transition not found" in str(results)


# ── Proposition reopen ───────────────────────────────────────────────


class TestReopen:
    def test_reopen_disputed_revaluates(
        self,
        interp: ResolutionInterpreter,
        wr_concept: Concept,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_concept.id,
            subject_entity_id=wr_entity.id,
            disposition=Disposition.DISPUTED,
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)
        result = interp.reopen_disputed_proposition(prop, "WR-001")
        assert result == Disposition.ASSERTED

    def test_reopen_non_disputed_returns_same(
        self,
        interp: ResolutionInterpreter,
        wr_entity: Entity,
        wr_invariant: Rule,
    ) -> None:
        prop = Proposition(
            id=_uid(), title="Test",
            description=None,
            asset_concept_id=wr_entity.concept_id,
            subject_entity_id=wr_entity.id,
            disposition=Disposition.ASSERTED,
            assertions=[wr_invariant],
        )
        interp.add_proposition(prop)
        result = interp.reopen_disputed_proposition(prop, "WR-001")
        assert result == Disposition.ASSERTED


# ── Frame dimension meanings (v35) ───────────────────────────────────


class TestFrameMeanings:
    def _build_dimension(
        self, interp: ResolutionInterpreter,
    ) -> tuple[FrameDimension, FrameDimensionValue, FrameDimensionValue]:
        dim = FrameDimension(
            id=_uid(), name="migration_phase",
            description="deployment migration phase",
            value_kind="governed_reference", scalar_type=None,
        )
        interp.add_frame_dimension(dim)
        pre = FrameDimensionValue(
            id=_uid(), dimension_id=dim.id, value="pre_migration",
        )
        post = FrameDimensionValue(
            id=_uid(), dimension_id=dim.id, value="post_migration",
        )
        interp.add_frame_dimension_value(pre)
        interp.add_frame_dimension_value(post)
        return dim, pre, post

    def _add_meaning(
        self, interp: ResolutionInterpreter, prop: Proposition,
        dimension_id: str | None = None,
        value_id: str | None = None,
    ) -> None:
        interp.add_frame_dimension_meaning(FrameDimensionMeaning(
            id=_uid(), proposition_id=prop.id,
            dimension_id=dimension_id, frame_dimension_value_id=value_id,
        ))

    def test_meanings_of_returns_dimension_and_value_meanings(
        self, interp: ResolutionInterpreter,
    ) -> None:
        dim, pre, post = self._build_dimension(interp)

        dim_prop = Proposition(
            id=_uid(), title="dim meaning", description=None,
            asset_concept_id="fd", subject_entity_id="",
            disposition=Disposition.PENDING,
        )
        pre_prop = Proposition(
            id=_uid(), title="pre meaning", description=None,
            asset_concept_id="fdv", subject_entity_id="",
            disposition=Disposition.PENDING,
        )
        post_prop = Proposition(
            id=_uid(), title="post meaning", description=None,
            asset_concept_id="fdv", subject_entity_id="",
            disposition=Disposition.PENDING,
        )
        for p in (dim_prop, pre_prop, post_prop):
            interp.add_proposition(p)
        self._add_meaning(interp, dim_prop, dimension_id=dim.id)
        self._add_meaning(interp, pre_prop, value_id=pre.id)
        self._add_meaning(interp, post_prop, value_id=post.id)

        # Whole dimension: dimension meaning + both value meanings.
        titles = {p.title for p in interp.meanings_of("migration_phase")}
        assert titles == {"dim meaning", "pre meaning", "post meaning"}

        # Scoped to one value: dimension meaning + that value only.
        titles = {
            p.title
            for p in interp.meanings_of("migration_phase", value="post_migration")
        }
        assert titles == {"dim meaning", "post meaning"}

    def test_meanings_of_unknown_dimension_is_empty(
        self, interp: ResolutionInterpreter,
    ) -> None:
        assert interp.meanings_of("nope") == []
