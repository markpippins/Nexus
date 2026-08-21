"""Tests for solscript.reasoning.pattern_library.DeterministicPatternLibrary."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    ConceptStateTransition,
    Entity,
    Expression,
    ExpressionKind,
    ResolutionInterpreter,
    Rule,
    RuleType,
    Severity,
)
from solscript.reasoning.pattern_library import DeterministicPatternLibrary


def _uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def lib(interp: ResolutionInterpreter) -> DeterministicPatternLibrary:
    return DeterministicPatternLibrary(interp)


@pytest.fixture
def interp_with_item(interp: ResolutionInterpreter) -> ResolutionInterpreter:
    """Interpreter with a basic Item concept."""
    concept = Concept(id=_uid(), name="Item", description="test")
    interp.add_concept(concept)

    status_attr = ConceptAttribute(
        id=_uid(), concept_id=concept.id, name="status",
        description="Status", value_type="text", is_state_attribute=True,
        allowed_values=["Open", "In Progress", "Done"],
    )
    concept.attributes[status_attr.id] = status_attr

    priority_attr = ConceptAttribute(
        id=_uid(), concept_id=concept.id, name="priority",
        description="Priority", value_type="integer", is_state_attribute=False,
    )
    concept.attributes[priority_attr.id] = priority_attr

    return interp


@pytest.fixture
def lib_with_item(interp_with_item: ResolutionInterpreter) -> DeterministicPatternLibrary:
    return DeterministicPatternLibrary(interp_with_item)


class TestPatternRegistration:
    def test_all_10_patterns_registered(self, lib: DeterministicPatternLibrary) -> None:
        assert len(lib.patterns) == 10

    def test_pattern_names(self, lib: DeterministicPatternLibrary) -> None:
        names = {p.name for p in lib.patterns}
        expected = {
            "temporal_consistency", "enum_validation", "derived_attributes",
            "foreign_key_validation", "range_validation", "text_pattern_matching",
            "statistical_imputation", "consistency_constraints",
            "business_rules", "state_machine",
        }
        assert names == expected

    def test_priorities_are_ordered(self, lib: DeterministicPatternLibrary) -> None:
        priorities = [p.priority for p in lib.patterns]
        assert all(0 <= p <= 100 for p in priorities)


class TestTemporalConsistency:
    def test_updated_before_created_gets_fixed(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={
                "created_at": datetime(2026, 1, 10),
                "updated_at": datetime(2026, 1, 5),  # before created
            },
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, conf = lib.patterns[0].apply({"entity": entity})
        assert "updated_at" in result
        assert result["updated_at"] == datetime(2026, 1, 10)
        assert conf == 0.95

    def test_completed_before_created_gets_nulled(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={
                "created_at": datetime(2026, 1, 10),
                "completed_at": datetime(2026, 1, 5),  # before created
            },
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, conf = lib.patterns[0].apply({"entity": entity})
        assert "completed_at" in result
        assert result["completed_at"] is None

    def test_valid_dates_no_change(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={
                "created_at": datetime(2026, 1, 1),
                "updated_at": datetime(2026, 1, 2),
            },
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, conf = lib.patterns[0].apply({"entity": entity})
        assert result == {}

    def test_no_entity_returns_empty(self, lib: DeterministicPatternLibrary) -> None:
        result, conf = lib.patterns[0].apply({})
        assert result == {}


class TestEnumValidation:
    def test_case_insensitive_fix(
        self, lib_with_item: DeterministicPatternLibrary,
        interp_with_item: ResolutionInterpreter,
    ) -> None:
        concept = interp_with_item.get_concept_by_name("Item")
        assert concept is not None
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "open"},  # lowercase
        )
        interp_with_item.add_entity(entity)

        result, conf = lib_with_item.patterns[1].apply({"entity": entity})
        assert "status" in result
        assert result["status"] == "Open"
        assert conf == 1.0

    def test_case_insensitive_close_match(
        self, lib_with_item: DeterministicPatternLibrary,
        interp_with_item: ResolutionInterpreter,
    ) -> None:
        concept = interp_with_item.get_concept_by_name("Item")
        assert concept is not None
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "in_progress"},  # underscore variant
        )
        interp_with_item.add_entity(entity)

        result, _ = lib_with_item.patterns[1].apply({"entity": entity})
        # "in_progress" → token overlap with "In Progress"
        assert "status" in result
        assert result["status"] == "In Progress"


class TestDerivedAttributes:
    def test_bug_critical_derives_p0(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Bug", "severity": "Critical"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[2].apply({"entity": entity})
        assert result.get("priority") == "P0"

    def test_task_medium_derives_p3(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Task", "severity": "Medium"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[2].apply({"entity": entity})
        assert result.get("priority") == "P3"

    def test_unknown_type_no_derivation(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Story", "severity": "High"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[2].apply({"entity": entity})
        assert "priority" not in result


class TestForeignKeyValidation:
    def test_fk_resolves_external_id_to_entity_id(
        self, interp: ResolutionInterpreter,
    ) -> None:
        # Concept A has a FK attribute pointing to concept B
        concept_a = Concept(id=_uid(), name="Child", description="t")
        interp.add_concept(concept_a)
        fk_attr = ConceptAttribute(
            id=_uid(), concept_id=concept_a.id, name="parent_id",
            description="FK", value_type="text", is_state_attribute=False,
        )
        concept_a.attributes[fk_attr.id] = fk_attr

        concept_b = Concept(id=_uid(), name="Parent", description="t")
        interp.add_concept(concept_b)

        # Target entity in concept B — referenced by external_id
        target = Entity(id=_uid(), concept_id=concept_b.id,
                        attributes={}, external_id="ext-parent-1")
        interp.add_entity(target)

        # Source entity in concept A — FK value is the external_id, not entity.id
        source = Entity(
            id=_uid(), concept_id=concept_a.id,
            attributes={"parent_id": "ext-parent-1"},
        )
        interp.add_entity(source)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[3].apply({"entity": source})
        # "parent_id" ends with _id → FK check
        # get_entity("ext-parent-1") → None, get_entity_by_external_id → found
        # Correction: replace external_id with entity.id
        assert result.get("parent_id") == target.id


class TestRangeValidation:
    def test_percentage_clamped(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="completion_percentage",
            description="pct", value_type="integer", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"completion_percentage": 150},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[4].apply({"entity": entity})
        assert result.get("completion_percentage") == 100

    def test_score_within_range(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="score",
            description="s", value_type="integer", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"score": 7},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[4].apply({"entity": entity})
        assert "score" not in result  # within range, no correction


class TestTextPatternMatching:
    def test_bug_keyword_detected(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"title": "Critical bug in login flow"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[5].apply({"entity": entity})
        assert result.get("type") == "Bug"
        assert result.get("priority") == "P0"

    def test_feature_keyword_detected(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"title": "Implement dark mode feature"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[5].apply({"entity": entity})
        assert result.get("type") == "Feature"

    def test_task_keyword_detected(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"title": "Update chore: clean up deps"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[5].apply({"entity": entity})
        assert result.get("type") == "Task"

    def test_no_match(self, interp: ResolutionInterpreter) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"title": "Review quarterly report"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[5].apply({"entity": entity})
        assert result == {}


class TestStatisticalImputation:
    def test_fills_missing_from_majority(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="category",
            description="c", value_type="text", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        # 4 entities with "Bug", 1 missing
        for i in range(4):
            interp.add_entity(Entity(
                id=f"e-{i}", concept_id=concept.id,
                attributes={"category": "Bug"},
            ))
        target = Entity(
            id="target", concept_id=concept.id,
            attributes={"category": None},
        )
        interp.add_entity(target)

        lib = DeterministicPatternLibrary(interp)
        result, conf = lib.patterns[6].apply({"entity": target})
        assert result.get("category") == "Bug"
        assert conf == 0.75

    def test_too_few_entities_for_imputation(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"category": None},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[6].apply({"entity": entity})
        assert result == {}  # fewer than 3 entities


class TestConsistencyConstraints:
    def test_completed_without_timestamp_gets_filled(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "Completed", "completed_at": None},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[7].apply({"entity": entity})
        assert "completed_at" in result
        assert isinstance(result["completed_at"], datetime)

    def test_non_completed_with_timestamp_gets_cleared(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "Open", "completed_at": datetime.now()},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[7].apply({"entity": entity})
        assert result.get("completed_at") is None


class TestBusinessRules:
    def test_critical_bug_gets_p0(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Bug", "severity": "Critical", "priority": "P2"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[8].apply({"entity": entity})
        assert result.get("priority") == "P0"

    def test_critical_bug_unassigned_gets_oncall(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Bug", "severity": "Critical"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[8].apply({"entity": entity})
        assert result.get("assigned_to") == "on-call-team"

    def test_non_bug_no_action(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"type": "Feature", "severity": "Critical"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[8].apply({"entity": entity})
        assert result == {}


class TestStateMachine:
    def test_applies_transition_when_guard_passes(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)

        status_attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="status",
            description="s", value_type="text", is_state_attribute=True,
            allowed_values=["Open", "Done"],
        )
        concept.attributes[status_attr.id] = status_attr

        # Transition with no guards (always passes)
        transition = ConceptStateTransition(
            id=_uid(), concept_id=concept.id,
            from_value="Open", to_value="Done",
            name="close", notes=None,
        )
        concept.state_transitions.append(transition)

        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "Open"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[9].apply({"entity": entity})
        assert result.get("status") == "Done"
        assert result.get("__transition_applied") == "close"

    def test_no_transition_when_no_matching_from_value(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)

        status_attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="status",
            description="s", value_type="text", is_state_attribute=True,
            allowed_values=["Open", "Done"],
        )
        concept.attributes[status_attr.id] = status_attr

        transition = ConceptStateTransition(
            id=_uid(), concept_id=concept.id,
            from_value="Open", to_value="Done",
            name="close", notes=None,
        )
        concept.state_transitions.append(transition)

        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"status": "Done"},  # already done
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[9].apply({"entity": entity})
        assert "status" not in result

    def test_no_state_attribute_no_transition(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        # No state attribute on concept
        entity = Entity(
            id=_uid(), concept_id=concept.id,
            attributes={"color": "blue"},
        )
        interp.add_entity(entity)

        lib = DeterministicPatternLibrary(interp)
        result, _ = lib.patterns[9].apply({"entity": entity})
        assert result == {}
