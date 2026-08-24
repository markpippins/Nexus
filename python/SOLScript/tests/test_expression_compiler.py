"""Tests for solscript.expression_compiler.ExpressionCompiler."""

from __future__ import annotations

import uuid

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    Entity,
    Expression,
    ExpressionKind,
    FunctionBinding,
    Operator,
    ResolutionInterpreter,
)


def _uid() -> str:
    return str(uuid.uuid4())


class TestLiteral:
    def test_returns_literal_value(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="text", literal_value="hello",
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == "hello"

    def test_literal_none(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="text", literal_value=None,
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is None

    def test_literal_int(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="integer", literal_value=42,
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == 42

    def test_literal_bool(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="boolean", literal_value=True,
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True


class TestAttributeRef:
    def test_resolves_from_entity(self, interp: ResolutionInterpreter) -> None:
        concept = Concept(id=_uid(), name="Item", description="test")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="color",
            description="Color", value_type="text", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        entity = Entity(id=_uid(), concept_id=concept.id, attributes={"color": "blue"})
        interp.add_entity(entity)

        expr = Expression(
            id=_uid(), kind=ExpressionKind.ATTRIBUTE_REF,
            return_type="text", attribute_id=attr.id,
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({"entity": entity}) == "blue"

    def test_returns_none_when_entity_missing(self, interp: ResolutionInterpreter) -> None:
        concept = Concept(id=_uid(), name="Item", description="test")
        interp.add_concept(concept)
        attr = ConceptAttribute(
            id=_uid(), concept_id=concept.id, name="color",
            description="Color", value_type="text", is_state_attribute=False,
        )
        concept.attributes[attr.id] = attr

        expr = Expression(
            id=_uid(), kind=ExpressionKind.ATTRIBUTE_REF,
            return_type="text", attribute_id=attr.id,
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is None

    def test_returns_none_when_attribute_not_found(
        self, interp: ResolutionInterpreter,
    ) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.ATTRIBUTE_REF,
            return_type="text", attribute_id="nonexistent",
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({"entity": Entity(id=_uid(), concept_id="x", attributes={})}) is None


class TestOperators:
    def test_eq_true(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.EQ, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="a"),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="a"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_eq_false(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.EQ, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="a"),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="b"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is False

    def test_neq(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.NEQ, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="x"),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="y"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_gt(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.GT, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=10),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=5),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_lt(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.LT, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=3),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=7),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_gte(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.GTE, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=5),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=5),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_lte(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.LTE, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=5),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=10),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_and(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.AND, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=True),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=True),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_and_false(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.AND, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=True),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=False),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is False

    def test_or(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.OR, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=False),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=True),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_not(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.NOT, return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="boolean", literal_value=False),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True


class TestCaching:
    def test_same_expression_returns_cached(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="text", literal_value="cached",
        )
        fn1 = interp.expression_compiler.compile_expression(expr)
        fn2 = interp.expression_compiler.compile_expression(expr)
        assert fn1 is fn2

    def test_different_expressions_are_distinct(self, interp: ResolutionInterpreter) -> None:
        expr1 = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="text", literal_value="a",
        )
        expr2 = Expression(
            id=_uid(), kind=ExpressionKind.LITERAL,
            return_type="text", literal_value="b",
        )
        fn1 = interp.expression_compiler.compile_expression(expr1)
        fn2 = interp.expression_compiler.compile_expression(expr2)
        assert fn1({}) == "a"
        assert fn2({}) == "b"


class TestFunctionCall:
    def test_builtin_count(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="count", return_type="integer",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="a"),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="b"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == 2

    def test_builtin_sum(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="sum", return_type="numeric",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=10),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=20),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == 30.0

    def test_builtin_concat(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="concat", return_type="text",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="hello"),
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value=" world"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == "hello world"

    def test_builtin_is_null(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="is_null", return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value=None),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_builtin_is_not_null(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="is_not_null", return_type="boolean",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="text", literal_value="value"),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) is True

    def test_unknown_function_raises(self, interp: ResolutionInterpreter) -> None:
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="nonexistent", return_type="text",
        )
        with pytest.raises(ValueError, match="Unknown function"):
            interp.expression_compiler.compile_expression(expr)

    def test_custom_python_func(self, interp: ResolutionInterpreter) -> None:
        interp.functions["double"] = FunctionBinding(
            function_name="double", sql_template="", arg_count=1,
            return_type="integer", python_func=lambda x: (x or 0) * 2,
        )
        expr = Expression(
            id=_uid(), kind=ExpressionKind.FUNCTION_CALL,
            function_name="double", return_type="integer",
            operands=[
                Expression(id=_uid(), kind=ExpressionKind.LITERAL,
                           return_type="integer", literal_value=5),
            ],
        )
        compiled = interp.expression_compiler.compile_expression(expr)
        assert compiled({}) == 10
