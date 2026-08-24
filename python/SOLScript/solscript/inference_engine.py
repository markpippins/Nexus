"""Inference engine — forward / backward chaining for runtime gap-closing."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple

from .expression_compiler import ExpressionCompiler
from .models import Entity, Expression, ExpressionKind, Operator

if TYPE_CHECKING:
    from .interpreter import ResolutionInterpreter


class InferenceEngine:
    """Inference engine for runtime gap-closing.

    Supports forward chaining (rule-based derivation) and backward
    chaining (goal-directed inference).  Can delegate to an external
    ``KnowledgeBase`` for unresolved queries.
    """

    class InferenceRule:
        def __init__(
            self,
            condition: Expression,
            conclusion: Dict[str, Any],
            confidence: float = 1.0,
            priority: int = 0,
        ) -> None:
            self.condition = condition
            self.conclusion = conclusion
            self.confidence = confidence
            self.priority = priority

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.facts: Dict[str, Any] = {}
        self.inference_rules: List[InferenceEngine.InferenceRule] = []
        self.confidence_scores: Dict[str, float] = {}
        self.external_knowledge_base: Optional[KnowledgeBase] = None

    # ── Fact / rule management ───────────────────────────────────

    def add_fact(self, key: str, value: Any, confidence: float = 1.0) -> None:
        self.facts[key] = value
        self.confidence_scores[key] = confidence

    def add_inference_rule(
        self,
        condition: Expression,
        conclusion: Dict[str, Any],
        confidence: float = 1.0,
        priority: int = 0,
    ) -> None:
        rule = self.InferenceRule(condition, conclusion, confidence, priority)
        self.inference_rules.append(rule)
        self.inference_rules.sort(key=lambda r: r.priority, reverse=True)

    # ── Core inference ───────────────────────────────────────────

    def infer(
        self, context: Dict[str, Any], max_iterations: int = 10
    ) -> Dict[str, Any]:
        working_memory = {**self.facts, **context}
        inferred: set[str] = set()

        # Forward chaining
        changed = True
        iterations = 0
        while changed and iterations < max_iterations:
            changed = False
            iterations += 1
            for rule in self.inference_rules:
                if rule.condition and self._evaluate_condition(
                    rule.condition, working_memory
                ):
                    for key, value in rule.conclusion.items():
                        if working_memory.get(key) != value:
                            working_memory[key] = value
                            inferred.add(key)
                            self.confidence_scores[key] = rule.confidence
                            changed = True

        # Backward chaining for missing keys (also try None-valued keys)
        for key in list(context.keys()):
            if key not in working_memory or working_memory.get(key) is None:
                inferred_value = self._backward_chain(key, working_memory)
                if inferred_value is not None:
                    working_memory[key] = inferred_value
                    inferred.add(key)

        # Apply default values from concept attributes
        entity = working_memory.get("entity")
        if isinstance(entity, Entity):
            concept = self.interpreter.get_concept(entity.concept_id)
            if concept:
                for attr in concept.attributes.values():
                    if attr.name not in entity.attributes and attr.default_value is not None:
                        entity.attributes[attr.name] = attr.default_value

        return working_memory

    def infer_entity_attributes(self, entity: Entity) -> Entity:
        ctx = self.infer({"entity": entity})
        inferred_entity = ctx.get("entity")
        if isinstance(inferred_entity, Entity):
            for key, value in inferred_entity.attributes.items():
                if key not in entity.attributes:
                    entity.attributes[key] = value
        # Also apply top-level inferred keys that match concept attributes
        concept = self.interpreter.get_concept(entity.concept_id)
        if concept:
            for attr in concept.attributes.values():
                if attr.name in ctx and attr.name not in entity.attributes:
                    entity.attributes[attr.name] = ctx[attr.name]
        return entity

    # ── Internal helpers ─────────────────────────────────────────

    def _evaluate_condition(
        self, condition: Expression, context: Dict[str, Any]
    ) -> bool:
        try:
            compiler = ExpressionCompiler(self.interpreter)
            compiled = compiler.compile_expression(condition)
            return bool(compiled(context))
        except Exception:
            return self._evaluate_simple_condition(condition, context)

    def _evaluate_simple_condition(
        self, condition: Expression, context: Dict[str, Any]
    ) -> bool:
        if condition.kind == ExpressionKind.LITERAL:
            return bool(condition.literal_value)
        if condition.kind == ExpressionKind.ATTRIBUTE_REF:
            attr = self.interpreter.get_attribute(condition.attribute_id or "")
            return bool(context.get(attr.name) if attr else False)
        if condition.kind == ExpressionKind.OPERATOR:
            if condition.operator == Operator.AND:
                return all(
                    self._evaluate_simple_condition(op, context)
                    for op in condition.operands
                )
            if condition.operator == Operator.OR:
                return any(
                    self._evaluate_simple_condition(op, context)
                    for op in condition.operands
                )
            if len(condition.operands) == 2:
                left = self._evaluate_simple_condition(condition.operands[0], context)
                right = self._evaluate_simple_condition(condition.operands[1], context)
                op = condition.operator
                if op == Operator.EQ:
                    return left == right
                if op == Operator.NEQ:
                    return left != right
                if op == Operator.GT:
                    return left > right  # type: ignore[operator]
                if op == Operator.LT:
                    return left < right  # type: ignore[operator]
                if op == Operator.GTE:
                    return left >= right  # type: ignore[operator]
                if op == Operator.LTE:
                    return left <= right  # type: ignore[operator]
        return False

    def _backward_chain(
        self, target_key: str, context: Dict[str, Any]
    ) -> Optional[Any]:
        for rule in self.inference_rules:
            if target_key in rule.conclusion:
                if self._evaluate_condition(rule.condition, context):
                    return rule.conclusion[target_key]
        if self.external_knowledge_base:
            return self.external_knowledge_base.query(target_key, context)
        return None


class KnowledgeBase:
    """External knowledge base for inference lookups."""

    def __init__(self) -> None:
        self.knowledge: Dict[str, Dict[str, Any]] = {}
        self.patterns: List[Tuple[re.Pattern[str], str, Callable[..., Any]]] = []

    def add_knowledge(
        self,
        key: str,
        value: Any,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        if key not in self.knowledge:
            self.knowledge[key] = {"_entries": []}
        if context:
            self.knowledge[key]["_entries"].append(
                {"context": context, "value": value}
            )
        else:
            self.knowledge[key]["default"] = value

    def add_pattern(
        self, pattern: str, key: str, resolver: Callable[..., Any]
    ) -> None:
        self.patterns.append((re.compile(pattern), key, resolver))

    def query(self, key: str, context: Dict[str, Any]) -> Optional[Any]:
        if key in self.knowledge:
            kb = self.knowledge[key]
            # Check context-specific entries first
            for entry in kb.get("_entries", []):
                if self._context_matches(context, entry["context"]):
                    return entry["value"]
            # Fall back to default
            if "default" in kb:
                return kb["default"]
        for pat, pat_key, resolver in self.patterns:
            if pat_key == key or pat.match(key):
                result = resolver(context)
                if result is not None:
                    return result
        return None

    @staticmethod
    def _context_matches(
        query_context: Dict[str, Any], stored_context: Optional[Dict[str, Any]]
    ) -> bool:
        if stored_context is None:
            return True
        if not isinstance(stored_context, dict):
            return True
        for ctx_key, expected_value in stored_context.items():
            if "." in ctx_key:
                # Dotted path — resolve through nested dicts and compare value
                parts = ctx_key.split(".")
                current: Any = query_context
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        return False
                if current != expected_value:
                    return False
            else:
                # Direct key — check existence and value match
                if (
                    not isinstance(query_context, dict)
                    or ctx_key not in query_context
                ):
                    return False
                if query_context[ctx_key] != expected_value:
                    return False
        return True
