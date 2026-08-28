"""Expression compiler — translates expression trees into callable Python functions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional

from .models import (
    ConceptAttribute,
    ConceptRelationship,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    Quantifier,
)

if TYPE_CHECKING:
    from .interpreter import ResolutionInterpreter


class ExpressionCompiler:
    """Compiles expression trees into executable Python callables."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.compiled_cache: Dict[str, Callable[..., Any]] = {}

    # ── Public API ───────────────────────────────────────────────

    def compile_expression(self, expr: Expression) -> Callable[..., Any]:
        """Compile an expression into a callable ``(ctx) -> value``."""
        cache_key = f"{expr.id}_{hash(str(expr))}"
        if cache_key in self.compiled_cache:
            return self.compiled_cache[cache_key]

        compiled = self._compile_node(expr)
        self.compiled_cache[cache_key] = compiled
        return compiled

    # ── Node compiler ────────────────────────────────────────────

    @staticmethod
    def _coerce_literal(value: Any, return_type: Optional[str]) -> Any:
        """Coerce a literal to its declared return type.

        The schema stores literals as text (e.g. `'0'` with
        `return_type='integer'`), so comparisons against typed attribute
        values would otherwise fail with a TypeError. Coerce once at
        compile time; unknown types pass through unchanged.
        """
        if value is None:
            return None
        rt = (return_type or "").lower()
        if rt in ("integer", "int", "bigint", "smallint"):
            try:
                return int(value)
            except (TypeError, ValueError):
                return value
        if rt in ("numeric", "decimal", "double", "double precision", "float", "real"):
            try:
                return float(value)
            except (TypeError, ValueError):
                return value
        if rt == "boolean":
            if isinstance(value, bool):
                return value
            if value in ("true", "True", "t", "1"):
                return True
            if value in ("false", "False", "f", "0"):
                return False
            return value
        if rt in ("timestamp", "timestamptz", "date", "text", "varchar", "uuid", "jsonb"):
            return value
        return value

    def _compile_node(self, expr: Expression) -> Callable[..., Any]:
        if expr.kind == ExpressionKind.LITERAL:
            val = self._coerce_literal(expr.literal_value, expr.return_type)
            return lambda _ctx: val

        if expr.kind == ExpressionKind.ATTRIBUTE_REF:
            attr = self.interpreter.get_attribute(expr.attribute_id or "")
            return lambda ctx, _a=attr: self._resolve_attribute(ctx, _a)

        if expr.kind == ExpressionKind.OPERATOR:
            return self._compile_operator(expr)

        if expr.kind == ExpressionKind.FUNCTION_CALL:
            func = self.interpreter.get_function(expr.function_name or "")
            arg_fns = [self._compile_node(op) for op in expr.operands]
            if func is None or func.python_func is None:
                raise ValueError(f"Unknown function: {expr.function_name}")
            pf = func.python_func
            return lambda ctx, _fns=arg_fns, _pf=pf: _pf(
                *(fn(ctx) for fn in _fns)
            )

        if expr.kind == ExpressionKind.RELATIONSHIP_REF:
            return self._compile_relationship(expr)

        if expr.kind == ExpressionKind.PROPOSITION_REF:
            prop = self.interpreter.get_proposition(
                expr.referenced_proposition_id or ""
            )
            field_name = expr.proposition_ref_field
            if field_name == "value":
                return lambda ctx, _p=prop: _p.value if _p else None
            if field_name == "disposition":
                return lambda ctx, _p=prop: _p.disposition if _p else None
            return lambda ctx, _p=prop: _p

        raise ValueError(f"Unsupported expression kind: {expr.kind}")

    # ── Operator compilation ─────────────────────────────────────

    def _compile_operator(self, expr: Expression) -> Callable[..., Any]:
        left_fn = self._compile_node(expr.operands[0])
        right_fn = (
            self._compile_node(expr.operands[1])
            if len(expr.operands) > 1
            else None
        )
        op = expr.operator

        if op == Operator.AND:
            return lambda ctx: left_fn(ctx) and (right_fn(ctx) if right_fn else True)
        if op == Operator.OR:
            return lambda ctx: left_fn(ctx) or (right_fn(ctx) if right_fn else False)
        if op == Operator.NOT:
            return lambda ctx: not left_fn(ctx)
        if op == Operator.EQ:
            return lambda ctx: left_fn(ctx) == (right_fn(ctx) if right_fn else None)
        if op == Operator.NEQ:
            return lambda ctx: left_fn(ctx) != (right_fn(ctx) if right_fn else None)
        if op == Operator.GT:
            return lambda ctx: left_fn(ctx) > (right_fn(ctx) if right_fn else None)
        if op == Operator.LT:
            return lambda ctx: left_fn(ctx) < (right_fn(ctx) if right_fn else None)
        if op == Operator.GTE:
            return lambda ctx: left_fn(ctx) >= (right_fn(ctx) if right_fn else None)
        if op == Operator.LTE:
            return lambda ctx: left_fn(ctx) <= (right_fn(ctx) if right_fn else None)

        raise ValueError(f"Unsupported operator: {op}")

    # ── Relationship compilation ─────────────────────────────────

    def _compile_relationship(self, expr: Expression) -> Callable[..., Any]:
        relation = self.interpreter.get_relationship(
            expr.concept_relationship_id or ""
        )
        child_expr = expr.operands[0] if expr.operands else None

        if expr.quantifier == Quantifier.EXISTS:
            return lambda ctx, _r=relation, _c=child_expr: (
                self._check_relationship_exists(ctx, _r, _c)
            )
        if expr.quantifier == Quantifier.ALL:
            return lambda ctx, _r=relation, _c=child_expr: (
                self._check_relationship_all(ctx, _r, _c)
            )
        if expr.quantifier == Quantifier.COUNT:
            return lambda ctx, _r=relation, _c=child_expr: (
                self._count_relationship(ctx, _r, _c)
            )
        return lambda ctx, _r=relation, _c=child_expr: (
            self._get_related_entities(ctx, _r, _c)
        )

    # ── Relationship helpers ─────────────────────────────────────

    def _check_relationship_exists(
        self,
        ctx: Dict[str, Any],
        relation: Optional[ConceptRelationship],
        child_expr: Optional[Expression],
    ) -> bool:
        related = self._navigate_relationship(ctx, relation)
        if not related:
            return False
        if child_expr is None:
            return bool(related)
        child_fn = self._compile_node(child_expr)
        for entity in related:
            child_ctx = {**ctx, "entity": entity, "parent": ctx.get("entity")}
            if child_fn(child_ctx):
                return True
        return False

    def _check_relationship_all(
        self,
        ctx: Dict[str, Any],
        relation: Optional[ConceptRelationship],
        child_expr: Optional[Expression],
    ) -> bool:
        related = self._navigate_relationship(ctx, relation)
        if not related:
            return True  # vacuously true
        if child_expr is None:
            return bool(related)
        child_fn = self._compile_node(child_expr)
        for entity in related:
            child_ctx = {**ctx, "entity": entity, "parent": ctx.get("entity")}
            if not child_fn(child_ctx):
                return False
        return True

    def _count_relationship(
        self,
        ctx: Dict[str, Any],
        relation: Optional[ConceptRelationship],
        child_expr: Optional[Expression],
    ) -> int:
        related = self._navigate_relationship(ctx, relation)
        if not related:
            return 0
        if child_expr is None:
            return len(related)
        child_fn = self._compile_node(child_expr)
        return sum(
            1
            for entity in related
            if child_fn({**ctx, "entity": entity, "parent": ctx.get("entity")})
        )

    def _get_related_entities(
        self,
        ctx: Dict[str, Any],
        relation: Optional[ConceptRelationship],
        _child_expr: Optional[Expression],
    ) -> List[Entity]:
        return self._navigate_relationship(ctx, relation)

    def _navigate_relationship(
        self,
        ctx: Dict[str, Any],
        relation: Optional[ConceptRelationship],
    ) -> List[Entity]:
        entity = ctx.get("entity") or ctx.get("target_entity") or ctx.get("subject")
        if not entity or not relation:
            return []
        related: List[Entity] = []
        for other in self.interpreter.entities.values():
            if other.concept_id == relation.to_concept_id:
                if self._relationship_exists(entity, other, relation):
                    related.append(other)
        return related

    @staticmethod
    def _relationship_exists(
        from_entity: Entity,
        to_entity: Entity,
        relation: ConceptRelationship,
    ) -> bool:
        binding = relation.binding
        if binding:
            from_val = from_entity.attributes.get(binding.from_column)
            to_val = to_entity.attributes.get(binding.to_column)
            return from_val == to_val
        return False

    @staticmethod
    def _resolve_attribute(
        ctx: Dict[str, Any], attr: Optional[ConceptAttribute]
    ) -> Any:
        if attr is None:
            return None
        entity = ctx.get("entity")
        if entity and hasattr(entity, "attributes"):
            return entity.attributes.get(attr.name)
        if attr.name in ctx:
            return ctx[attr.name]
        return None
