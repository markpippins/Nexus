"""Tests for solscript.inference_engine.InferenceEngine and KnowledgeBase."""

from __future__ import annotations

import uuid
from typing import Any, Dict

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    ResolutionInterpreter,
)
from solscript.inference_engine import InferenceEngine, KnowledgeBase


def _uid() -> str:
    return str(uuid.uuid4())


# ── Fact management ──────────────────────────────────────────────────


class TestFactManagement:
    def test_add_and_retrieve_fact(self, interp: ResolutionInterpreter) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("color", "blue")
        assert engine.facts["color"] == "blue"

    def test_fact_with_confidence(self, interp: ResolutionInterpreter) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("risk", "high", confidence=0.8)
        assert engine.facts["risk"] == "high"
        assert engine.confidence_scores["risk"] == 0.8

    def test_overwrite_fact(self, interp: ResolutionInterpreter) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("color", "blue")
        engine.add_fact("color", "red")
        assert engine.facts["color"] == "red"


# ── Inference rules ──────────────────────────────────────────────────


class TestInferenceRules:
    def test_add_rule_sorted_by_priority(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        engine.add_inference_rule(cond, {"a": 1}, priority=10)
        engine.add_inference_rule(cond, {"b": 2}, priority=100)
        engine.add_inference_rule(cond, {"c": 3}, priority=1)

        priorities = [r.priority for r in engine.inference_rules]
        assert priorities == [100, 10, 1]


# ── Forward chaining ─────────────────────────────────────────────────


class TestForwardChaining:
    def test_rule_fires_on_matching_condition(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("status", "open")

        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        engine.add_inference_rule(cond, {"priority": "high"})

        result = engine.infer({})
        assert result["priority"] == "high"
        assert result["status"] == "open"

    def test_rule_does_not_fire_on_false_condition(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=False,
        )
        engine.add_inference_rule(cond, {"priority": "high"})

        result = engine.infer({})
        assert "priority" not in result

    def test_multiple_rules_chain(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("type", "bug")

        cond_always = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        # Rule 1: always true → sets "needs_triage"
        engine.add_inference_rule(cond_always, {"needs_triage": True})
        # Rule 2: always true → sets "assignee"
        engine.add_inference_rule(cond_always, {"assignee": "team-a"})

        result = engine.infer({})
        assert result["needs_triage"] is True
        assert result["assignee"] == "team-a"

    def test_max_iterations_prevents_infinite_loop(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        # This rule keeps flipping a counter
        engine.add_inference_rule(cond, {"counter": 42})

        result = engine.infer({}, max_iterations=3)
        # Should terminate after max_iterations
        assert result["counter"] == 42

    def test_context_facts_merged_with_engine_facts(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("from_engine", True)

        result = engine.infer({"from_context": True})
        assert result["from_engine"] is True
        assert result["from_context"] is True

    def test_context_overrides_engine_facts(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("shared", "engine_value")

        result = engine.infer({"shared": "context_value"})
        assert result["shared"] == "context_value"


# ── Backward chaining ────────────────────────────────────────────────


class TestBackwardChaining:
    def test_backward_chain_fills_missing_key(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        engine.add_inference_rule(cond, {"derived_value": 42})

        # Pass a context that doesn't include "derived_value"
        # Backward chaining should find the rule that produces it
        result = engine.infer({"some_key": "some_value"})
        assert result["derived_value"] == 42

    def test_backward_chain_with_false_condition_skips(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=False,
        )
        engine.add_inference_rule(cond, {"derived_value": 42})

        result = engine.infer({"derived_value": None})
        # Condition is false, so backward chain won't produce it
        # But "derived_value" is already in context (as None)
        assert result["derived_value"] is None


# ── Entity attribute inference ───────────────────────────────────────


class TestEntityInference:
    def test_infer_entity_attributes(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="category",
            description="c", value_type="text", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        entity = Entity(id=_uid(), concept_id=concept.id, attributes={})
        interp.add_entity(entity)

        engine = InferenceEngine(interp)
        cond = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        engine.add_inference_rule(cond, {"category": "Bug"})

        result_entity = engine.infer_entity_attributes(entity)
        assert result_entity.attributes.get("category") == "Bug"

    def test_default_values_applied(
        self, interp: ResolutionInterpreter,
    ) -> None:
        concept = Concept(id=_uid(), name="Item", description="t")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="priority",
            description="p", value_type="text", is_state_attribute=False,
            default_value="P3",
        )
        concept.attributes[attr.id] = attr

        entity = Entity(id=_uid(), concept_id=concept.id, attributes={})
        interp.add_entity(entity)

        engine = InferenceEngine(interp)
        engine.infer({"entity": entity})
        # Default value should be applied to entity attributes
        assert entity.attributes.get("priority") == "P3"


# ── KnowledgeBase ────────────────────────────────────────────────────


class TestKnowledgeBase:
    def test_add_and_query_default(self) -> None:
        kb = KnowledgeBase()
        kb.add_knowledge("color", "blue")
        result = kb.query("color", {})
        assert result == "blue"

    def test_query_with_context(self) -> None:
        kb = KnowledgeBase()
        kb.add_knowledge("color", "navy", context={"theme": "dark"})
        kb.add_knowledge("color", "sky", context={"theme": "light"})

        result_dark = kb.query("color", {"theme": "dark"})
        assert result_dark == "navy"

        result_light = kb.query("color", {"theme": "light"})
        assert result_light == "sky"

    def test_query_default_fallback(self) -> None:
        kb = KnowledgeBase()
        kb.add_knowledge("color", "white")  # default
        kb.add_knowledge("color", "navy", context={"theme": "dark"})

        # No matching context → falls back to default
        result = kb.query("color", {"theme": "summer"})
        assert result == "white"

    def test_query_missing_key(self) -> None:
        kb = KnowledgeBase()
        result = kb.query("nonexistent", {})
        assert result is None

    def test_add_pattern(self) -> None:
        kb = KnowledgeBase()
        kb.add_pattern(r"status_.*", "status_info", lambda ctx: f"info:{ctx.get('key', '')}")

        result = kb.query("status_info", {"key": "open"})
        assert result == "info:open"

    def test_pattern匹配key(self) -> None:
        kb = KnowledgeBase()
        kb.add_pattern(r"priority_\d+", "matched", lambda ctx: True)

        result = kb.query("priority_1", {})
        assert result is True

    def test_context_matches_nested(self) -> None:
        kb = KnowledgeBase()
        kb.add_knowledge("x", "found", context={"a.b.c": "yes"})

        result = kb.query("x", {"a": {"b": {"c": "yes"}}})
        assert result == "found"

    def test_context_no_match_nested(self) -> None:
        kb = KnowledgeBase()
        kb.add_knowledge("x", "found", context={"a.b.c": "yes"})

        result = kb.query("x", {"a": {"b": {"c": "no"}}})
        assert result is None


# ── External knowledge base integration ──────────────────────────────


class TestExternalKnowledgeBase:
    def test_infer_delegates_to_kb(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        kb = KnowledgeBase()
        kb.add_knowledge("risk_level", "high")
        engine.external_knowledge_base = kb

        # "risk_level" not in facts or context → backward chain → KB lookup
        result = engine.infer({"risk_level": None})
        assert result["risk_level"] == "high"

    def test_kb_not_used_when_fact_exists(
        self, interp: ResolutionInterpreter,
    ) -> None:
        engine = InferenceEngine(interp)
        engine.add_fact("risk_level", "low")
        kb = KnowledgeBase()
        kb.add_knowledge("risk_level", "high")
        engine.external_knowledge_base = kb

        result = engine.infer({})
        assert result["risk_level"] == "low"
