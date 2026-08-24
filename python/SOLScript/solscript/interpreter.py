"""ResolutionInterpreter — in-memory interpreter for the resolution language."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple

from .expression_compiler import ExpressionCompiler
from .models import (
    Concept,
    ConceptAttribute,
    ConceptRelationship,
    ConceptStateTransition,
    Disposition,
    Entity,
    Expression,
    FrameDimension,
    FrameDimensionMeaning,
    FrameDimensionValue,
    FunctionBinding,
    Proposition,
    PropositionFrameValue,
    Representation,
    RepresentationComparison,
    Rule,
    RuleType,
    Severity,
)

# Avoid circular import at module level; TYPE_CHECKING guard suffices.


class ResolutionInterpreter:
    """In-memory interpreter for the resolution language.

    Holds the full concept graph, entity store, propositions, rules,
    and expression/function registries.  Evaluation uses compiled
    expression trees for performance.
    """

    def __init__(self) -> None:
        # Core data stores
        self.concepts: Dict[str, Concept] = {}
        self.entities: Dict[str, Entity] = {}
        self.propositions: Dict[str, Proposition] = {}
        self.expressions: Dict[str, Expression] = {}
        self.rules: Dict[str, Rule] = {}
        self.functions: Dict[str, FunctionBinding] = {}
        self.representations: Dict[str, Representation] = {}
        self.relationships: Dict[str, ConceptRelationship] = {}
        self.state_transitions: Dict[str, ConceptStateTransition] = {}
        # v31: frame discipline
        self.frame_dimensions: Dict[str, FrameDimension] = {}
        self.frame_dimension_values: Dict[str, FrameDimensionValue] = {}
        # v35: frame semantics — propositions describing what a dimension means
        self.frame_dimension_meanings: Dict[str, FrameDimensionMeaning] = {}

        # Runtime state
        self.evaluation_cache: Dict[str, Any] = {}
        self.execution_context: Dict[str, Any] = {}
        self.event_handlers: List[Callable[..., Any]] = []

        # Components
        self.expression_compiler = ExpressionCompiler(self)

        # Register built-in functions
        self._register_builtin_functions()

    # ── Built-in functions ───────────────────────────────────────

    def _register_builtin_functions(self) -> None:
        builtins: Dict[str, Callable[..., Any]] = {
            "count": lambda *args: len([a for a in args if a is not None]),
            "sum": lambda *args: sum(
                float(a) if a is not None else 0 for a in args
            ),
            "avg": lambda *args: (
                sum(float(a) if a is not None else 0 for a in args)
                / max(len([a for a in args if a is not None]), 1)
            ),
            "min": lambda *args: min(
                float(a) if a is not None else float("inf") for a in args
            ),
            "max": lambda *args: max(
                float(a) if a is not None else float("-inf") for a in args
            ),
            "coalesce": lambda *args: next(
                (a for a in args if a is not None), None
            ),
            "concat": lambda *args: "".join(
                str(a) if a is not None else "" for a in args
            ),
            "contains": lambda s, sub: sub in str(s) if s is not None else False,
            "starts_with": lambda s, prefix: (
                str(s).startswith(prefix) if s is not None else False
            ),
            "ends_with": lambda s, suffix: (
                str(s).endswith(suffix) if s is not None else False
            ),
            "is_null": lambda v: v is None,
            "is_not_null": lambda v: v is not None,
        }
        for name, func in builtins.items():
            self.functions[name] = FunctionBinding(
                function_name=name,
                sql_template="",
                arg_count=0,
                return_type="any",
                notes=f"Built-in: {name}",
                python_func=func,
            )

    # ── Concept / entity / proposition lookups ────────────────────

    def add_concept(self, concept: Concept) -> None:
        self.concepts[concept.id] = concept

    def get_concept(self, concept_id: str) -> Optional[Concept]:
        return self.concepts.get(concept_id)

    def get_concept_by_name(self, name: str) -> Optional[Concept]:
        for c in self.concepts.values():
            if c.name == name:
                return c
        return None

    def add_entity(self, entity: Entity) -> None:
        self.entities[entity.id] = entity

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        return self.entities.get(entity_id)

    def get_entity_by_external_id(self, external_id: str) -> Optional[Entity]:
        for e in self.entities.values():
            if e.external_id == external_id:
                return e
        return None

    def add_proposition(self, proposition: Proposition) -> None:
        self.propositions[proposition.id] = proposition

    def get_proposition(self, proposition_id: str) -> Optional[Proposition]:
        return self.propositions.get(proposition_id)

    def get_attribute(self, attribute_id: str) -> Optional[ConceptAttribute]:
        for concept in self.concepts.values():
            for attr in concept.attributes.values():
                if attr.id == attribute_id:
                    return attr
        return None

    def get_relationship(
        self, relationship_id: str
    ) -> Optional[ConceptRelationship]:
        return self.relationships.get(relationship_id)

    def get_state_transition(
        self, transition_id: str
    ) -> Optional[ConceptStateTransition]:
        return self.state_transitions.get(transition_id)

    def get_function(self, function_name: str) -> Optional[FunctionBinding]:
        return self.functions.get(function_name)

    # ── Expression evaluation ────────────────────────────────────

    def evaluate(
        self, expression: Expression, context: Dict[str, Any]
    ) -> Any:
        compiled = self.expression_compiler.compile_expression(expression)
        return compiled(context)

    # ── Rule evaluation ──────────────────────────────────────────

    def check_rule(
        self, rule: Rule, entity: Entity
    ) -> Tuple[bool, str]:
        context: Dict[str, Any] = {"entity": entity}
        try:
            if rule.expression:
                result = self.evaluate(rule.expression, context)
                passed = bool(result)
                return passed, f"Rule '{rule.name}' {'passed' if passed else 'failed'}"
            return False, f"Rule '{rule.name}' has no expression"
        except Exception as exc:
            if rule.severity == Severity.HARD:
                return False, f"Rule '{rule.name}' error: {exc}"
            return True, f"Rule '{rule.name}' soft error: {exc}"

    def check_transition_guard(
        self, transition: ConceptStateTransition, entity: Entity
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        results: List[Dict[str, Any]] = []
        all_passed = True

        for rule in transition.guards:
            passed, reason = self.check_rule(rule, entity)
            results.append(
                {"rule_id": rule.id, "rule_name": rule.name, "passed": passed, "reason": reason}
            )
            if not passed:
                all_passed = False

        concept = self.concepts.get(transition.concept_id)
        if concept:
            for rule in concept.invariants:
                passed, reason = self.check_rule(rule, entity)
                results.append(
                    {"rule_id": rule.id, "rule_name": rule.name, "passed": passed, "reason": reason}
                )
                if not passed:
                    all_passed = False

        return all_passed, results

    # ── State transitions ────────────────────────────────────────

    def transition_entity(
        self, entity_id: str, transition_id: str
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        entity = self.entities.get(entity_id)
        if not entity:
            return False, [{"error": "Entity not found"}]
        transition = self.state_transitions.get(transition_id)
        if not transition:
            return False, [{"error": "Transition not found"}]

        all_passed, results = self.check_transition_guard(transition, entity)
        if not all_passed:
            return False, results

        concept = self.concepts.get(entity.concept_id)
        if concept:
            state_attr = next(
                (a for a in concept.attributes.values() if a.is_state_attribute), None
            )
            if state_attr:
                target = next(
                    (v for v in state_attr.allowed_values if v == transition.to_value),
                    None,
                )
                if target is not None:
                    entity.attributes[state_attr.name] = target

        return True, results

    def add_frame_dimension(self, dim: FrameDimension) -> None:
        self.frame_dimensions[dim.id] = dim

    def get_frame_dimension(self, dim_id: str) -> Optional[FrameDimension]:
        return self.frame_dimensions.get(dim_id)

    def get_frame_dimension_by_name(self, name: str) -> Optional[FrameDimension]:
        for d in self.frame_dimensions.values():
            if d.name == name:
                return d
        return None

    def add_frame_dimension_value(self, val: FrameDimensionValue) -> None:
        self.frame_dimension_values[val.id] = val

    def add_proposition_frame_value(self, pfv: PropositionFrameValue) -> None:
        prop = self.propositions.get(pfv.proposition_id)
        if prop:
            prop.frame_values.append(pfv)

    def add_frame_dimension_meaning(self, meaning: FrameDimensionMeaning) -> None:
        self.frame_dimension_meanings[meaning.id] = meaning

    def meanings_of(
        self,
        dimension: str,
        value: Optional[str] = None,
    ) -> List[Proposition]:
        """Return the meaning propositions describing a frame dimension.

        `dimension` may be a dimension id or name.  When `value` is given,
        only value-level meanings for that specific value are returned;
        otherwise whole-dimension meanings (plus value-level meanings for all
        values, since they jointly describe the dimension's meaning).
        """
        dim = self.frame_dimensions.get(dimension) or self.get_frame_dimension_by_name(dimension)
        if dim is None:
            return []

        results: List[Proposition] = []
        for meaning in self.frame_dimension_meanings.values():
            prop = self.propositions.get(meaning.proposition_id)
            if prop is None:
                continue
            if meaning.dimension_id == dim.id:
                # whole-dimension meaning always applies
                results.append(prop)
            elif meaning.frame_dimension_value_id:
                fdv = self.frame_dimension_values.get(meaning.frame_dimension_value_id)
                if fdv and fdv.dimension_id == dim.id:
                    if value is None or fdv.value == value:
                        results.append(prop)
        return results

    # ── Proposition evaluation ───────────────────────────────────

    def evaluate_proposition(
        self,
        prop: Proposition,
        context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Disposition, bool, str]:
        """Evaluate a proposition with optional frame-context discipline (v32).

        Returns (disposition, all_passed, context_status) where:
          context_status: 'not_scoped' | 'context_required' | 'context_mismatch' | 'scoped'
        """
        # ── Context gate: frame discipline (v31/v32) ─────────────
        framed_count = len(prop.frame_values)

        if framed_count > 0:
            if context is None:
                # Refuse — framed but no context supplied
                return (None, False, "context_required")  # type: ignore[return-value]

            if not isinstance(context, dict):
                raise ValueError(
                    f"evaluate_proposition: context must be a dict, got {type(context).__name__}"
                )

            # Unknown keys in context raise for framed propositions
            for key in context:
                dim = self.get_frame_dimension_by_name(key)
                if dim is None:
                    raise ValueError(
                        f"evaluate_proposition: context key '{key}' names no known frame_dimension"
                    )

            # Every framed dimension must be covered AND matched
            for pfv in prop.frame_values:
                dim = self.frame_dimensions.get(pfv.dimension_id)
                if dim is None:
                    return (None, False, "context_required")  # type: ignore[return-value]

                ctx_val = context.get(dim.name)
                if ctx_val is None:
                    return (None, False, "context_required")  # type: ignore[return-value]

                if dim.value_kind == "governed_reference":
                    fdv = self.frame_dimension_values.get(
                        pfv.reference_value_id or ""
                    )
                    if fdv is None or fdv.value != str(ctx_val):
                        return (None, False, "context_mismatch")  # type: ignore[return-value]

                elif dim.value_kind == "typed_scalar":
                    scalar_type = dim.scalar_type or "text"
                    scalar = pfv.scalar_value
                    try:
                        if scalar_type == "integer":
                            if int(ctx_val) != int(scalar):  # type: ignore[arg-type]
                                return (None, False, "context_mismatch")  # type: ignore[return-value]
                        elif scalar_type == "numeric":
                            if float(ctx_val) != float(scalar):  # type: ignore[arg-type]
                                return (None, False, "context_mismatch")  # type: ignore[return-value]
                        elif scalar_type == "boolean":
                            if bool(ctx_val) != (scalar in ("true", "True", "1")):
                                return (None, False, "context_mismatch")  # type: ignore[return-value]
                        else:  # text / timestamp
                            if str(ctx_val) != str(scalar):
                                return (None, False, "context_mismatch")  # type: ignore[return-value]
                    except (ValueError, TypeError):
                        return (None, False, "context_mismatch")  # type: ignore[return-value]
                else:
                    raise ValueError(
                        f"evaluate_proposition: dimension {dim.name} has "
                        f"unrecognized value_kind {dim.value_kind}"
                    )

            context_status = "scoped"
        else:
            context_status = "not_scoped"

        # ── Assertion evaluation ─────────────────────────────────
        entity = self.entities.get(prop.subject_entity_id)
        if not entity:
            return (Disposition.REJECTED, False, context_status)

        all_passed = True
        relational_failed = False

        for rule in prop.assertions:
            passed, _ = self.check_rule(rule, entity)
            if not passed:
                all_passed = False
                if rule.is_relational_check:
                    relational_failed = True

        if all_passed:
            disposition = Disposition.ASSERTED
        elif relational_failed:
            disposition = Disposition.DISPUTED
        else:
            disposition = Disposition.REJECTED

        return (disposition, all_passed, context_status)

    def reopen_disputed_proposition(
        self, prop: Proposition, external_id: str  # noqa: ARG002
    ) -> Disposition:
        if prop.disposition != Disposition.DISPUTED:
            return prop.disposition
        disposition, _, _ = self.evaluate_proposition(prop)
        return disposition or prop.disposition

    # ── Change events ────────────────────────────────────────────

    def on_change(
        self, concept_name: str, entity_id: str
    ) -> List[Tuple[str, str, Disposition]]:
        results: List[Tuple[str, str, Disposition]] = []
        entity = self.entities.get(entity_id)
        if not entity:
            return results
        concept = self.get_concept_by_name(concept_name)
        if not concept:
            return results

        external_id = entity.external_id

        for prop in self.propositions.values():
            if (
                prop.subject_entity_id == entity_id
                and prop.asset_concept_id == concept.id
            ):
                old = prop.disposition
                if old == Disposition.DISPUTED and external_id:
                    new = self.reopen_disputed_proposition(prop, external_id)
                else:
                    new, _, _ = self.evaluate_proposition(prop)
                if new and new != old:
                    prop.disposition = new
                    prop.last_evaluated_at = datetime.now()
                    results.append((prop.id, "event_evaluate", new))

        for handler in self.event_handlers:
            try:
                handler(concept_name, entity_id, results)
            except Exception:
                pass
        return results

    def register_event_handler(self, handler: Callable[..., Any]) -> None:
        self.event_handlers.append(handler)

    # ── Convenience helpers ──────────────────────────────────────

    def add_entity_by_concept_name(
        self,
        concept_name: str,
        attributes: Dict[str, Any],
        external_id: Optional[str] = None,
    ) -> Entity:
        import uuid

        concept = self.get_concept_by_name(concept_name)
        if not concept:
            raise ValueError(f"Concept not found: {concept_name}")
        entity = Entity(
            id=str(uuid.uuid4()),
            concept_id=concept.id,
            attributes=attributes,
            external_id=external_id,
        )
        self.entities[entity.id] = entity
        return entity
