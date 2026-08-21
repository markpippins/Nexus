"""Deterministic pattern library — pre-LLM patterns for high-confidence inference."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple

from ..models import Entity

if TYPE_CHECKING:
    from ..interpreter import ResolutionInterpreter


@dataclass
class DeterministicPattern:
    """A deterministic pattern that can be applied to an entity context."""

    name: str
    description: str
    priority: int
    apply: Callable[..., Tuple[Dict[str, Any], float]]
    confidence: float = 0.9


class DeterministicPatternLibrary:
    """Library of deterministic patterns applied before LLM inference.

    Each pattern takes a context dict and returns ``(inferred_values, confidence)``.
    """

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.patterns: List[DeterministicPattern] = []
        self._register_patterns()

    def _register_patterns(self) -> None:
        self.patterns = [
            DeterministicPattern("temporal_consistency", "Ensure dates are logical", 100, self._temporal, 0.95),
            DeterministicPattern("enum_validation", "Validate against allowed values", 90, self._enum_validation, 1.0),
            DeterministicPattern("derived_attributes", "Calculate derived attributes", 80, self._derived, 0.95),
            DeterministicPattern("foreign_key_validation", "Validate FK references", 85, self._fk_validation, 1.0),
            DeterministicPattern("range_validation", "Validate numeric ranges", 85, self._range_validation, 0.98),
            DeterministicPattern("text_pattern_matching", "Regex on text attributes", 70, self._text_patterns, 0.85),
            DeterministicPattern("statistical_imputation", "Statistical fill for missing values", 60, self._statistical_imputation, 0.75),
            DeterministicPattern("consistency_constraints", "Cross-attribute consistency", 95, self._consistency, 0.98),
            DeterministicPattern("business_rules", "Business-specific deterministic rules", 90, self._business_rules, 0.9),
            DeterministicPattern("state_machine", "State transition logic", 95, self._state_machine, 1.0),
        ]

    # ── Pattern implementations ──────────────────────────────────

    def _temporal(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.95
        created = entity.attributes.get("created_at")
        updated = entity.attributes.get("updated_at")
        completed = entity.attributes.get("completed_at")
        if isinstance(created, datetime) and isinstance(updated, datetime):
            if updated < created:
                result["updated_at"] = created
        if isinstance(created, datetime) and isinstance(completed, datetime):
            if completed < created:
                result["completed_at"] = None
        return result, 0.95

    def _enum_validation(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 1.0
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, 1.0
        for attr in concept.attributes.values():
            if attr.allowed_values:
                current = entity.attributes.get(attr.name)
                if current is not None:
                    matches = [v for v in attr.allowed_values if v.lower() == str(current).lower()]
                    if matches and matches[0] != current:
                        result[attr.name] = matches[0]
                    elif current not in attr.allowed_values:
                        inferred = _infer_enum(current, attr.allowed_values)
                        if inferred:
                            result[attr.name] = inferred
        return result, 1.0

    def _derived(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.95
        type_val = str(entity.attributes.get("type", ""))
        severity = str(entity.attributes.get("severity", ""))
        priority_map = {
            ("Bug", "Critical"): "P0",
            ("Bug", "High"): "P1",
            ("Bug", "Medium"): "P2",
            ("Bug", "Low"): "P3",
            ("Feature", "High"): "P1",
            ("Feature", "Medium"): "P2",
            ("Feature", "Low"): "P3",
            ("Task", "High"): "P2",
            ("Task", "Medium"): "P3",
            ("Task", "Low"): "P4",
        }
        key: tuple[str, str] = (type_val, severity)
        if key in priority_map:
            result["priority"] = priority_map[key]
        return result, 0.95

    def _fk_validation(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 1.0
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, 1.0
        for attr in concept.attributes.values():
            if attr.name.endswith("_id") or attr.name.endswith("_uuid"):
                fk_value = entity.attributes.get(attr.name)
                if fk_value:
                    ref = self.interpreter.get_entity(fk_value)
                    if not ref:
                        ext = self.interpreter.get_entity_by_external_id(fk_value)
                        if ext:
                            result[attr.name] = ext.id
        return result, 1.0

    def _range_validation(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.98
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, 0.98
        ranges = {
            "percentage": (0, 100),
            "score": (0, 10),
            "priority": (1, 5),
            "hours": (0, 1000),
            "days": (0, 365),
        }
        for attr in concept.attributes.values():
            if attr.value_type in ("integer", "float", "numeric"):
                value = entity.attributes.get(attr.name)
                if value is not None:
                    try:
                        num = float(value)  # type: ignore[arg-type]
                        for rname, (lo, hi) in ranges.items():
                            if rname in attr.name.lower():
                                if num < lo:
                                    result[attr.name] = lo
                                elif num > hi:
                                    result[attr.name] = hi
                                break
                    except (ValueError, TypeError):
                        pass
        return result, 0.98

    def _text_patterns(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.85
        title = entity.attributes.get("title")
        if isinstance(title, str):
            if re.search(r"\b(?:bug|fix|issue|error|crash)\b", title, re.IGNORECASE):
                result["type"] = "Bug"
            elif re.search(r"\b(?:feature|enhancement|add|implement)\b", title, re.IGNORECASE):
                result["type"] = "Feature"
            elif re.search(r"\b(?:task|chore|setup|update)\b", title, re.IGNORECASE):
                result["type"] = "Task"
            if re.search(r"\b(?:critical|urgent|hotfix)\b", title, re.IGNORECASE):
                result["priority"] = "P0"
            elif re.search(r"\b(?:high|important)\b", title, re.IGNORECASE):
                result["priority"] = "P1"
        return result, 0.85

    def _statistical_imputation(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.75
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, 0.75
        same = [
            e
            for e in self.interpreter.entities.values()
            if e.concept_id == concept.id
        ]
        if len(same) < 3:
            return result, 0.75
        for attr in concept.attributes.values():
            if attr.name not in entity.attributes or entity.attributes[attr.name] is None:
                values = [
                    e.attributes.get(attr.name)
                    for e in same
                    if e.attributes.get(attr.name) is not None
                ]
                if not values:
                    continue
                if attr.value_type in ("integer", "float", "numeric"):
                    nums = sorted(float(v) for v in values if v is not None)
                    mid = len(nums) // 2
                    median = (nums[mid - 1] + nums[mid]) / 2 if len(nums) % 2 == 0 else nums[mid]
                    result[attr.name] = median
                else:
                    mode = Counter(values).most_common(1)
                    if mode:
                        result[attr.name] = mode[0][0]
        return result, 0.75

    def _consistency(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.98
        status = entity.attributes.get("status")
        completed_at = entity.attributes.get("completed_at")
        if status in ("Completed", "Done", "Closed") and not completed_at:
            result["completed_at"] = datetime.now()
        elif status not in ("Completed", "Done", "Closed") and completed_at:
            result["completed_at"] = None
        return result, 0.98

    def _business_rules(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 0.9
        if entity.attributes.get("type") == "Bug":
            severity = entity.attributes.get("severity")
            if severity in ("Critical", "High"):
                if entity.attributes.get("priority") not in ("P0", "P1"):
                    result["priority"] = "P1" if severity == "High" else "P0"
            if severity == "Critical" and not entity.attributes.get("assigned_to"):
                result["assigned_to"] = "on-call-team"
        return result, 0.9

    def _state_machine(self, ctx: Dict[str, Any]) -> Tuple[Dict[str, Any], float]:
        result: Dict[str, Any] = {}
        entity = ctx.get("entity")
        if not isinstance(entity, Entity):
            return result, 1.0
        concept = self.interpreter.get_concept(entity.concept_id)
        if not concept:
            return result, 1.0
        state_attr = next(
            (a for a in concept.attributes.values() if a.is_state_attribute), None
        )
        if not state_attr or state_attr.name not in entity.attributes:
            return result, 1.0
        current = entity.attributes.get(state_attr.name)
        for transition in concept.state_transitions:
            if transition.from_value == current:
                conditions_met = True
                for guard in transition.guards:
                    if guard.expression:
                        try:
                            compiled = self.interpreter.expression_compiler.compile_expression(
                                guard.expression
                            )
                            if not compiled(ctx):
                                conditions_met = False
                                break
                        except Exception:
                            conditions_met = False
                            break
                if conditions_met:
                    result[state_attr.name] = transition.to_value
                    result["__transition_applied"] = transition.name
        return result, 1.0


# ── Helpers ──────────────────────────────────────────────────────────


def _infer_enum(current: Any, allowed: List[str]) -> Optional[str]:
    if not allowed:
        return None
    cur = str(current).lower()
    for val in allowed:
        if val.lower() == cur:
            return val
    for val in allowed:
        if cur in val.lower() or val.lower() in cur:
            return val
    cur_tokens = set(cur.replace("_", " ").replace("-", " ").split())
    for val in allowed:
        val_tokens = set(val.lower().replace("_", " ").replace("-", " ").split())
        if cur_tokens & val_tokens:
            return val
    return None
