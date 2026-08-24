"""Fluent query builder and transaction context for the interpreter."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from .expression_compiler import ExpressionCompiler
from .models import (
    Concept,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    Proposition,
)

if TYPE_CHECKING:
    from .interpreter import ResolutionInterpreter


class QueryBuilder:
    """Entry point for building queries over concept entities."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter

    def select(self, concept_name: str) -> Query:
        concept = self.interpreter.get_concept_by_name(concept_name)
        if not concept:
            raise ValueError(f"Concept not found: {concept_name}")
        return Query(self.interpreter, concept)


class Query:
    """Fluent query interface over a single concept."""

    def __init__(
        self, interpreter: ResolutionInterpreter, concept: Concept
    ) -> None:
        self.interpreter = interpreter
        self.concept = concept
        self.filters: List[Expression] = []
        self._order_by: List[Tuple[str, str]] = []
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None
        self._select_fields: List[str] = []

    def filter(self, condition: Expression) -> Query:
        self.filters.append(condition)
        return self

    def where(self, attribute: str, op: Operator, value: Any) -> Query:
        attr = next(
            (a for a in self.concept.attributes.values() if a.name == attribute),
            None,
        )
        if not attr:
            raise ValueError(f"Attribute not found: {attribute}")

        attr_expr = Expression(
            id=str(uuid.uuid4()),
            kind=ExpressionKind.ATTRIBUTE_REF,
            return_type=attr.value_type,
            attribute_id=attr.id,
        )
        literal_expr = Expression(
            id=str(uuid.uuid4()),
            kind=ExpressionKind.LITERAL,
            return_type=attr.value_type,
            literal_value=value,
        )
        op_expr = Expression(
            id=str(uuid.uuid4()),
            kind=ExpressionKind.OPERATOR,
            return_type="boolean",
            operator=op,
            operands=[attr_expr, literal_expr],
        )
        self.filters.append(op_expr)
        return self

    def order_by(self, attribute: str, direction: str = "ASC") -> Query:
        self._order_by.append((attribute, direction))
        return self

    def limit(self, n: int) -> Query:
        self._limit = n
        return self

    def offset(self, n: int) -> Query:
        self._offset = n
        return self

    def select_fields(self, *fields: str) -> Query:
        self._select_fields = list(fields)
        return self

    def execute(self) -> List[Dict[str, Any]]:
        compiler = ExpressionCompiler(self.interpreter)
        entities = [
            e
            for e in self.interpreter.entities.values()
            if e.concept_id == self.concept.id
        ]

        results: List[Dict[str, Any]] = []
        for entity in entities:
            ctx: Dict[str, Any] = {"entity": entity}
            passed = True
            for f_expr in self.filters:
                try:
                    compiled = compiler.compile_expression(f_expr)
                    if not bool(compiled(ctx)):
                        passed = False
                        break
                except Exception:
                    passed = False
                    break
            if not passed:
                continue

            if self._select_fields:
                row: Dict[str, Any] = {}
                for field in self._select_fields:
                    if field in entity.attributes:
                        row[field] = entity.attributes[field]
                    elif field == "id":
                        row["id"] = entity.id
                    elif field == "external_id":
                        row["external_id"] = entity.external_id
                results.append(row)
            else:
                results.append(
                    {"id": entity.id, "external_id": entity.external_id, **entity.attributes}
                )

        if self._order_by:
            for attr_name, direction in reversed(self._order_by):
                reverse = direction.upper() == "DESC"
                results.sort(key=lambda r: r.get(attr_name, ""), reverse=reverse)

        if self._offset:
            results = results[self._offset :]
        if self._limit:
            results = results[: self._limit]

        return results

    def count(self) -> int:
        return len(self.execute())


class TransactionContext:
    """Context manager providing snapshot/rollback semantics."""

    def __init__(self, interpreter: ResolutionInterpreter) -> None:
        self.interpreter = interpreter
        self.changes: List[Dict[str, Any]] = []
        self.snapshot: Dict[str, Any] = {}

    def __enter__(self) -> TransactionContext:
        self.snapshot = {
            "entities": {
                k: copy.deepcopy(v) for k, v in self.interpreter.entities.items()
            },
            "propositions": {
                k: copy.deepcopy(v) for k, v in self.interpreter.propositions.items()
            },
            "evaluation_cache": dict(self.interpreter.evaluation_cache),
        }
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()

    def add_change(self, change_type: str, data: Dict[str, Any]) -> None:
        self.changes.append(
            {"type": change_type, "data": data, "timestamp": datetime.now()}
        )

    def rollback(self) -> None:
        self.interpreter.entities = dict(self.snapshot["entities"])
        self.interpreter.propositions = dict(self.snapshot["propositions"])
        self.interpreter.evaluation_cache = dict(self.snapshot["evaluation_cache"])
        self.changes.clear()

    def commit(self) -> None:
        for change in self.changes:
            ctype = change["type"]
            data = change["data"]
            if ctype == "entity_update":
                entity = data["entity"]
                self.interpreter.entities[entity.id] = entity
                concept = self.interpreter.get_concept(entity.concept_id)
                if concept:
                    self.interpreter.on_change(concept.name, entity.id)
            elif ctype == "proposition_update":
                prop: Proposition = data["proposition"]
                self.interpreter.propositions[prop.id] = prop
        self.changes.clear()
