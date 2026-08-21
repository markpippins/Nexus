"""Deterministic and hybrid reasoning engines.

Provides pre-LLM deterministic reasoning (rule-based, statistical,
symbolic, pattern-matching, decision-tree) and an LLM integration
layer that is only invoked when deterministic methods cannot resolve
an unknown.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from math import log2
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Set, Tuple

from ..models import (
    Concept,
    ConceptRelationship,
    Entity,
    Expression,
    RuleType,
)

if TYPE_CHECKING:
    from ..interpreter import ResolutionInterpreter


# ── Deterministic Reasoner ───────────────────────────────────────────


class DeterministicReasoner:
    """Pre-LLM deterministic reasoning engine.

    Chains rule-based → symbolic → pattern-matching → statistical →
    decision-tree reasoning.  Returns enriched context with per-key
    confidence scores and flags items that may need LLM escalation.
    """

    DETERMINISTIC_THRESHOLD = 0.85
    UNCERTAINTY_THRESHOLD = 0.60

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.rule_engine = RuleEngine(interpreter)
        self.statistical_reasoner = StatisticalReasoner(interpreter)
        self.symbolic_reasoner = SymbolicReasoner(interpreter)
        self.pattern_matcher = PatternMatcher(interpreter)
        self.decision_tree = DecisionTreeReasoner(interpreter)

    def reason(self, context: Dict[str, Any]) -> Dict[str, Any]:
        result = context.copy()
        scores: Dict[str, float] = {}

        for reasoner, default_conf in [
            (self.rule_engine, 1.0),
            (self.symbolic_reasoner, 0.8),
            (self.pattern_matcher, 0.6),
            (self.statistical_reasoner, 0.5),
            (self.decision_tree, 0.7),
        ]:
            r, conf = reasoner.reason(result)
            result.update(r)
            for k in r:
                scores[k] = conf

        unknowns = self._identify_unknowns(result, scores)
        if unknowns:
            result["__unknowns"] = unknowns
            result["__needs_llm"] = True
            result["__llm_candidates"] = [
                k
                for k, v in scores.items()
                if v < self.UNCERTAINTY_THRESHOLD and k not in unknowns
            ]
        else:
            result["__needs_llm"] = False

        result["__confidence"] = scores
        return result

    def _identify_unknowns(
        self, context: Dict[str, Any], scores: Dict[str, float]
    ) -> List[str]:
        unknowns: List[str] = []
        entity = context.get("entity")
        if isinstance(entity, Entity):
            concept = self.interpreter.get_concept(entity.concept_id)
            if concept:
                for attr in concept.attributes.values():
                    if attr.name not in entity.attributes or entity.attributes[attr.name] is None:
                        unknowns.append(attr.name)
                for rel in concept.relationships.values():
                    if not self._has_relationship(entity, rel):
                        unknowns.append(rel.name)
        return unknowns

    def _has_relationship(
        self, entity: Entity, relationship: ConceptRelationship
    ) -> bool:
        for other in self.interpreter.entities.values():
            if other.concept_id == relationship.to_concept_id:
                if _relationship_exists(entity, other, relationship):
                    return True
        return False


# ── Rule Engine ──────────────────────────────────────────────────────


class RuleEngine:
    """Deterministic rule-based reasoning engine."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter

    def reason(self, context: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        confidence = 1.0
        entity = context.get("entity")
        if not isinstance(entity, Entity):
            return result, confidence

        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, confidence

        for rule in concept.invariants:
            if rule.rule_type == RuleType.DERIVATION and rule.expression:
                try:
                    compiled = self.interpreter.expression_compiler.compile_expression(
                        rule.expression
                    )
                    value = compiled(context)
                    if rule.concept_attribute_id:
                        attr = self.interpreter.get_attribute(rule.concept_attribute_id)
                        if attr:
                            result[attr.name] = value
                except Exception:
                    pass

        for rel in concept.relationships.values():
            for rule in rel.conditionals:
                if rule.expression:
                    try:
                        compiled = self.interpreter.expression_compiler.compile_expression(
                            rule.expression
                        )
                        if compiled(context):
                            if rule.conclusion_attribute_id:
                                attr = self.interpreter.get_attribute(rule.conclusion_attribute_id)
                                if attr and rule.conclusion_value is not None:
                                    result[attr.name] = rule.conclusion_value
                    except Exception:
                        pass

        return result, confidence


# ── Statistical Reasoner ─────────────────────────────────────────────


@dataclass
class StatisticalPattern:
    conditions: Dict[str, Any]
    conclusions: Dict[str, Any]
    support_count: int = 0
    confidence: float = 0.0
    lift: float = 0.0


class StatisticalReasoner:
    """Statistical reasoning using frequent patterns and associations."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.patterns: Dict[str, List[StatisticalPattern]] = defaultdict(list)
        self.association_rules: List[Tuple[str, str, float, float]] = []
        self._build_models()

    def _build_models(self) -> None:
        for concept in self.interpreter.concepts.values():
            entities = [
                e
                for e in self.interpreter.entities.values()
                if e.concept_id == concept.id
            ]
            if len(entities) < 10:
                continue
            self.patterns[concept.id] = self._mine_frequent_patterns(entities, concept)
            self.association_rules.extend(self._mine_association_rules(entities, concept))

    def _mine_frequent_patterns(
        self, entities: List[Entity], concept: Concept
    ) -> List[StatisticalPattern]:
        patterns: List[StatisticalPattern] = []
        min_support = 0.1
        min_confidence = 0.5
        transactions: List[List[str]] = []
        for entity in entities:
            tx: List[str] = []
            for name, value in entity.attributes.items():
                if value is not None:
                    tx.append(f"{name}={value}")
            transactions.append(tx)

        for attr_name in concept.attributes:
            value_counts: Counter[str] = Counter()
            for tx in transactions:
                for item in tx:
                    if item.startswith(f"{attr_name}="):
                        value_counts[item] += 1

            for value, count in value_counts.items():
                if count / max(len(transactions), 1) >= min_support:
                    co_occurrence: Counter[str] = Counter()
                    for entity in entities:
                        if entity.attributes.get(attr_name) == value.split("=", 1)[1]:
                            for other_attr, other_value in entity.attributes.items():
                                if other_attr != attr_name and other_value is not None:
                                    co_occurrence[f"{other_attr}={other_value}"] += 1

                    for co_item, co_count in co_occurrence.items():
                        if co_count / max(count, 1) >= min_confidence:
                            parts = co_item.split("=", 1)
                            patterns.append(
                                StatisticalPattern(
                                    conditions={attr_name: value.split("=", 1)[1]},
                                    conclusions={parts[0]: parts[1]},
                                    support_count=co_count,
                                    confidence=co_count / max(count, 1),
                                    lift=(co_count / max(len(transactions), 1))
                                    / max(count / max(len(transactions), 1), 1e-9),
                                )
                            )
        return patterns

    def _mine_association_rules(
        self, entities: List[Entity], concept: Concept  # noqa: ARG002
    ) -> List[Tuple[str, str, float, float]]:
        rules: List[Tuple[str, str, float, float]] = []
        min_support = 0.05
        min_confidence = 0.6
        n = max(len(entities), 1)

        for entity in entities:
            attrs = {k: v for k, v in entity.attributes.items() if v is not None}
            for attr1, attr2 in itertools.combinations(attrs.keys(), 2):
                co_count = sum(
                    1
                    for e in entities
                    if e.attributes.get(attr1) is not None
                    and e.attributes.get(attr2) is not None
                )
                if co_count / n < min_support:
                    continue
                count1 = sum(
                    1 for e in entities if e.attributes.get(attr1) is not None
                )
                count2 = sum(
                    1 for e in entities if e.attributes.get(attr2) is not None
                )
                if count1 > 0:
                    c1 = co_count / count1
                    if c1 >= min_confidence:
                        rules.append((attr1, attr2, c1, co_count / n))
                if count2 > 0:
                    c2 = co_count / count2
                    if c2 >= min_confidence:
                        rules.append((attr2, attr1, c2, co_count / n))
        return rules

    def reason(self, context: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        confidence = 0.5
        entity = context.get("entity")
        if not isinstance(entity, Entity):
            return result, confidence

        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept or concept.id not in self.patterns:
            return result, confidence

        matching = [
            p
            for p in self.patterns[concept.id]
            if all(
                entity.attributes.get(ca) == cv
                for ca, cv in p.conditions.items()
            )
        ]
        if matching:
            best = max(matching, key=lambda p: p.confidence)
            confidence = best.confidence
            for attr, value in best.conclusions.items():
                if attr not in entity.attributes or entity.attributes[attr] is None:
                    result[attr] = value

        return result, confidence


# ── Symbolic Reasoner ────────────────────────────────────────────────


class SymbolicReasoner:
    """Symbolic reasoning using logic and ontologies."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.ontology: Dict[str, Set[str]] = defaultdict(set)
        self._build_ontology()

    def _build_ontology(self) -> None:
        for concept in self.interpreter.concepts.values():
            self.ontology[concept.name].add("Concept")
            for rel in concept.relationships.values():
                from_c = self.interpreter.get_concept(rel.from_concept_id)
                to_c = self.interpreter.get_concept(rel.to_concept_id)
                if from_c and to_c:
                    self.ontology[from_c.name].add(to_c.name)
                    self.ontology[to_c.name].add(from_c.name)
                    self.ontology[rel.relationship_type].add("Relationship")

    def reason(self, context: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        confidence = 0.8
        entity = context.get("entity")
        if not isinstance(entity, Entity):
            return result, confidence
        # Placeholder for transitive/backward-chaining logic
        return result, confidence


# ── Pattern Matcher ──────────────────────────────────────────────────


class PatternMatcher:
    """Pattern matching using regex and string analysis."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.patterns: Dict[str, List[Tuple[re.Pattern[str], str, float]]] = defaultdict(list)
        self._build_patterns()

    def _build_patterns(self) -> None:
        for concept in self.interpreter.concepts.values():
            entities = [
                e
                for e in self.interpreter.entities.values()
                if e.concept_id == concept.id
            ]
            for attr in concept.attributes.values():
                if attr.value_type in ("text", "string"):
                    values = [
                        e.attributes.get(attr.name)
                        for e in entities
                        if e.attributes.get(attr.name) is not None
                    ]
                    if len(values) > 5:
                        prefixes: Counter[str] = Counter()
                        for v in values:
                            if isinstance(v, str) and len(v) > 3:
                                prefixes[v[:3]] += 1
                        for prefix, count in prefixes.items():
                            if count / max(len(values), 1) > 0.3:
                                self.patterns[concept.id].append(
                                    (re.compile(f"^{prefix}.*"), attr.name, count / len(values))
                                )

    def reason(self, context: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        confidence = 0.6
        entity = context.get("entity")
        if not isinstance(entity, Entity):
            return result, confidence
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept or concept.id not in self.patterns:
            return result, confidence
        for pattern, attr_name, p_conf in self.patterns[concept.id]:
            if attr_name not in entity.attributes or entity.attributes[attr_name] is None:
                for _other_attr, other_value in entity.attributes.items():
                    if isinstance(other_value, str) and pattern.match(other_value):
                        result[attr_name] = other_value
                        confidence = max(confidence, p_conf)
        return result, confidence


# ── Decision Tree ────────────────────────────────────────────────────


@dataclass
class DecisionTreeNode:
    attribute: Optional[str] = None
    threshold: Optional[Any] = None
    left: Optional[DecisionTreeNode] = None
    right: Optional[DecisionTreeNode] = None
    leaf_value: Optional[Any] = None


class DecisionTreeReasoner:
    """Decision-tree-based reasoning built from entity data."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.trees: Dict[str, DecisionTreeNode] = {}
        self._build_trees()

    def _build_trees(self) -> None:
        for concept in self.interpreter.concepts.values():
            entities = [
                e
                for e in self.interpreter.entities.values()
                if e.concept_id == concept.id
            ]
            if len(entities) < 20:
                continue
            for target_attr in concept.attributes.values():
                if target_attr.is_state_attribute:
                    continue
                X: List[Dict[str, Any]] = []
                y: List[Any] = []
                for entity in entities:
                    tv = entity.attributes.get(target_attr.name)
                    if tv is not None:
                        feats = {
                            a.name: entity.attributes.get(a.name)
                            for a in concept.attributes.values()
                            if a.name != target_attr.name and entity.attributes.get(a.name) is not None
                        }
                        X.append(feats)
                        y.append(tv)
                if len(X) > 5 and len(set(y)) > 1:
                    tree = self._build_tree(X, y, set(concept.attributes.keys()))
                    self.trees[f"{concept.id}_{target_attr.name}"] = tree

    def _build_tree(
        self,
        X: List[Dict[str, Any]],
        y: List[Any],
        attributes: Set[str],
    ) -> DecisionTreeNode:
        if len(set(y)) == 1:
            return DecisionTreeNode(leaf_value=y[0])
        if not attributes:
            return DecisionTreeNode(leaf_value=Counter(y).most_common(1)[0][0])

        best_attr: Optional[str] = None
        best_gain = -1.0
        best_split: Any = None

        for attr in attributes:
            gain, split = self._calc_gain(X, y, attr)
            if gain > best_gain:
                best_gain = gain
                best_attr = attr
                best_split = split

        if best_attr is None or best_gain < 0.01:
            return DecisionTreeNode(leaf_value=Counter(y).most_common(1)[0][0])

        left_idx = [i for i, x in enumerate(X) if x.get(best_attr) == best_split]
        right_idx = [i for i, x in enumerate(X) if x.get(best_attr) != best_split]
        if not left_idx or not right_idx:
            return DecisionTreeNode(leaf_value=Counter(y).most_common(1)[0][0])

        remaining = attributes - {best_attr}
        return DecisionTreeNode(
            attribute=best_attr,
            threshold=best_split,
            left=self._build_tree([X[i] for i in left_idx], [y[i] for i in left_idx], remaining),
            right=self._build_tree([X[i] for i in right_idx], [y[i] for i in right_idx], remaining),
        )

    def _calc_gain(
        self,
        X: List[Dict[str, Any]],
        y: List[Any],
        attribute: str,
    ) -> Tuple[float, Any]:
        values = [x.get(attribute) for x in X]
        unique = [v for v in set(values) if v is not None]
        if not unique:
            return 0.0, None
        total_entropy = self._entropy(y)
        best_gain = 0.0
        best_split = unique[0]
        for sv in unique:
            li = [i for i, x in enumerate(X) if x.get(attribute) == sv]
            ri = [i for i, x in enumerate(X) if x.get(attribute) != sv]
            if not li or not ri:
                continue
            le = self._entropy([y[i] for i in li])
            re = self._entropy([y[i] for i in ri])
            split_e = (len(li) * le + len(ri) * re) / len(y)
            gain = total_entropy - split_e
            if gain > best_gain:
                best_gain = gain
                best_split = sv
        return best_gain, best_split

    @staticmethod
    def _entropy(y: List[Any]) -> float:
        if not y:
            return 0.0
        total = len(y)
        return -sum(
            (c / total) * log2(c / total)
            for c in Counter(y).values()
            if c > 0
        )

    def reason(self, context: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        confidence = 0.7
        entity = context.get("entity")
        if not isinstance(entity, Entity):
            return result, confidence
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, confidence
        for attr in concept.attributes.values():
            if attr.is_state_attribute:
                continue
            tree_key = f"{concept.id}_{attr.name}"
            if tree_key in self.trees:
                node = self.trees[tree_key]
                while node and node.leaf_value is None:
                    if node.attribute is None:
                        break
                    if entity.attributes.get(node.attribute) == node.threshold:
                        node = node.left
                    else:
                        node = node.right
                if node and node.leaf_value is not None:
                    result[attr.name] = node.leaf_value
                    confidence = 0.8
        return result, confidence


# ── LLM Integration ──────────────────────────────────────────────────


class LLMIntegrationLayer:
    """Integration layer for LLM-based reasoning (used only when deterministic
    methods cannot resolve an unknown)."""

    def __init__(self, interpreter: ResolutionInterpreter, llm_client: Any) -> None:
        self.interpreter = interpreter
        self.llm_client = llm_client
        self.cache: Dict[str, Any] = {}
        self.inference_history: List[Dict[str, Any]] = []

    def reason_with_llm(
        self, context: Dict[str, Any], unknowns: List[str]
    ) -> Dict[str, Any]:
        cache_key = self._cache_key(context, unknowns)
        if cache_key in self.cache:
            return self.cache[cache_key]

        prompt = self._build_prompt(context, unknowns)
        try:
            response = self.llm_client.generate(prompt)
            parsed = self._parse(response)
            self.cache[cache_key] = parsed
            self.inference_history.append(
                {
                    "timestamp": datetime.now(),
                    "unknowns": unknowns,
                    "result": parsed,
                }
            )
            return parsed
        except Exception as exc:
            return {"__error": str(exc)}

    @staticmethod
    def _cache_key(context: Dict[str, Any], unknowns: List[str]) -> str:
        entity = context.get("entity")
        eid = getattr(entity, "id", "")
        cid = getattr(entity, "concept_id", "")
        key_str = f"{eid}:{cid}:{':'.join(sorted(unknowns))}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _build_prompt(self, context: Dict[str, Any], unknowns: List[str]) -> str:
        entity = context.get("entity")
        concept = (
            self.interpreter.get_concept(entity.concept_id) if entity else None
        )
        return (
            f"Concept: {concept.name if concept else 'Unknown'}\n"
            f"Entity ID: {getattr(entity, 'id', 'Unknown')}\n"
            f"Attributes:\n{json.dumps(getattr(entity, 'attributes', {}), indent=2, default=str)}\n"
            f"Unknowns:\n{json.dumps(unknowns, indent=2)}\n"
            "Return JSON: {key: {value: ..., confidence: ...}}"
        )

    @staticmethod
    def _parse(response: str) -> Dict[str, Any]:
        try:
            match = re.search(r"\{.*\}", response, re.DOTALL)
            if match:
                return json.loads(match.group(0))
        except Exception:
            pass
        return {"__raw_response": response}


# ── Hybrid Reasoner ──────────────────────────────────────────────────


class HybridReasoner:
    """Combines deterministic reasoning with optional LLM escalation."""

    def __init__(
        self,
        interpreter: ResolutionInterpreter,
        llm_client: Optional[Any] = None,
    ) -> None:
        self.interpreter = interpreter
        self.deterministic = DeterministicReasoner(interpreter)
        self.llm_layer = LLMIntegrationLayer(interpreter, llm_client) if llm_client else None
        self.use_llm = bool(llm_client)

    def reason(self, context: Dict[str, Any]) -> Dict[str, Any]:
        result = self.deterministic.reason(context)
        needs_llm = result.get("__needs_llm", False)
        unknowns = result.get("__unknowns", [])
        llm_candidates = result.get("__llm_candidates", [])

        if needs_llm and self.use_llm and self.llm_layer:
            all_unknowns = list(set(unknowns + llm_candidates))
            if all_unknowns:
                llm_result = self.llm_layer.reason_with_llm(context, all_unknowns)
                for k, v in llm_result.items():
                    if not k.startswith("__"):
                        result[k] = v

        return result


# ── Helpers ──────────────────────────────────────────────────────────


def _relationship_exists(
    from_entity: Entity,
    to_entity: Entity,
    relationship: ConceptRelationship,
) -> bool:
    binding = relationship.binding
    if binding:
        return (
            from_entity.attributes.get(binding.from_column)
            == to_entity.attributes.get(binding.to_column)
        )
    return False
