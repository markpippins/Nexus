"""Tests for solscript.query_builder.QueryBuilder, Query, and TransactionContext."""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest

from solscript import (
    Concept,
    ConceptAttribute,
    Disposition,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    Proposition,
    ResolutionInterpreter,
    Rule,
    RuleType,
    Severity,
)
from solscript.query_builder import QueryBuilder, Query, TransactionContext


def _uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def interp_with_items(interp: ResolutionInterpreter) -> ResolutionInterpreter:
    """Interpreter with Item concept and several entities."""
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

    # Add 5 entities
    statuses = ["Open", "Open", "In Progress", "Done", "Done"]
    priorities = [1, 2, 3, 4, 5]
    for i, (st, pr) in enumerate(zip(statuses, priorities)):
        interp.add_entity(Entity(
            id=f"item-{i}", concept_id=concept.id,
            attributes={"status": st, "priority": pr},
            external_id=f"ITEM-{i:03d}",
        ))

    return interp


# ── QueryBuilder ─────────────────────────────────────────────────────


class TestQueryBuilder:
    def test_select_returns_query(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        q = qb.select("Item")
        assert isinstance(q, Query)
        assert q.concept.name == "Item"

    def test_select_unknown_concept_raises(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        with pytest.raises(ValueError, match="Concept not found"):
            qb.select("Nonexistent")


# ── Query.execute ────────────────────────────────────────────────────


class TestQueryExecute:
    def test_select_all(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").execute()
        assert len(results) == 5

    def test_select_includes_id_and_external_id(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").execute()
        first = results[0]
        assert "id" in first
        assert "external_id" in first
        assert first["external_id"] == "ITEM-000"

    def test_select_includes_attributes(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").execute()
        first = results[0]
        assert "status" in first
        assert "priority" in first


# ── Query.where ──────────────────────────────────────────────────────


class TestQueryWhere:
    def test_where_eq(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("status", Operator.EQ, "Open").execute()
        assert len(results) == 2
        assert all(r["status"] == "Open" for r in results)

    def test_where_neq(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("status", Operator.NEQ, "Done").execute()
        assert len(results) == 3

    def test_where_gt(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("priority", Operator.GT, 3).execute()
        assert len(results) == 2
        assert all(r["priority"] > 3 for r in results)

    def test_where_lt(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("priority", Operator.LT, 3).execute()
        assert len(results) == 2
        assert all(r["priority"] < 3 for r in results)

    def test_where_gte(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("priority", Operator.GTE, 4).execute()
        assert len(results) == 2

    def test_where_lte(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").where("priority", Operator.LTE, 2).execute()
        assert len(results) == 2

    def test_where_unknown_attribute_raises(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        with pytest.raises(ValueError, match="Attribute not found"):
            qb.select("Item").where("nonexistent", Operator.EQ, "x").execute()

    def test_chained_wheres(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = (
            qb.select("Item")
            .where("status", Operator.EQ, "Open")
            .where("priority", Operator.GT, 1)
            .execute()
        )
        assert len(results) == 1
        assert results[0]["priority"] == 2


# ── Query.filter ─────────────────────────────────────────────────────


class TestQueryFilter:
    def test_filter_with_expression(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        concept = interp_with_items.get_concept_by_name("Item")
        assert concept is not None
        attr = next(a for a in concept.attributes.values() if a.name == "status")

        expr = Expression(
            id=_uid(), kind=ExpressionKind.OPERATOR,
            operator=Operator.EQ, return_type="boolean",
            operands=[
                Expression(
                    id=_uid(), kind=ExpressionKind.ATTRIBUTE_REF,
                    return_type="text", attribute_id=attr.id,
                ),
                Expression(
                    id=_uid(), kind=ExpressionKind.LITERAL,
                    return_type="text", literal_value="Done",
                ),
            ],
        )
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").filter(expr).execute()
        assert len(results) == 2
        assert all(r["status"] == "Done" for r in results)


# ── Query.order_by ───────────────────────────────────────────────────


class TestQueryOrderBy:
    def test_order_by_asc(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").order_by("priority", "ASC").execute()
        priorities = [r["priority"] for r in results]
        assert priorities == sorted(priorities)

    def test_order_by_desc(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").order_by("priority", "DESC").execute()
        priorities = [r["priority"] for r in results]
        assert priorities == sorted(priorities, reverse=True)


# ── Query.limit / offset ────────────────────────────────────────────


class TestQueryLimitOffset:
    def test_limit(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").limit(2).execute()
        assert len(results) == 2

    def test_offset(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").offset(3).execute()
        assert len(results) == 2  # 5 total, skip 3

    def test_limit_and_offset(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").order_by("priority", "ASC").offset(1).limit(2).execute()
        assert len(results) == 2
        assert results[0]["priority"] == 2
        assert results[1]["priority"] == 3


# ── Query.select_fields ─────────────────────────────────────────────


class TestQuerySelectFields:
    def test_select_specific_fields(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").select_fields("status").execute()
        assert len(results) == 5
        for r in results:
            assert "status" in r
            assert "priority" not in r
            assert "id" not in r

    def test_select_fields_includes_id(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        results = qb.select("Item").select_fields("id", "status").execute()
        for r in results:
            assert "id" in r
            assert "status" in r


# ── Query.count ──────────────────────────────────────────────────────


class TestQueryCount:
    def test_count(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        assert qb.select("Item").count() == 5

    def test_count_with_filter(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        qb = QueryBuilder(interp_with_items)
        assert qb.select("Item").where("status", Operator.EQ, "Open").count() == 2


# ── TransactionContext ───────────────────────────────────────────────


class TestTransactionContext:
    def test_commit_applies_changes(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        concept = interp_with_items.get_concept_by_name("Item")
        entity = interp_with_items.get_entity("item-0")
        assert entity is not None

        with TransactionContext(interp_with_items) as tx:
            entity.attributes["status"] = "Done"
            tx.add_change("entity_update", {"entity": entity})

        # After commit, entity should be updated
        updated = interp_with_items.get_entity("item-0")
        assert updated is not None
        assert updated.attributes["status"] == "Done"

    def test_rollback_restores_state(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        entity = interp_with_items.get_entity("item-0")
        assert entity is not None
        original_status = entity.attributes["status"]

        try:
            with TransactionContext(interp_with_items) as tx:
                entity.attributes["status"] = "Done"
                tx.add_change("entity_update", {"entity": entity})
                raise ValueError("trigger rollback")
        except ValueError:
            pass

        # After rollback, entity should be restored
        restored = interp_with_items.get_entity("item-0")
        assert restored is not None
        assert restored.attributes["status"] == original_status

    def test_snapshot_captures_entities(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        with TransactionContext(interp_with_items) as tx:
            assert "entities" in tx.snapshot
            assert len(tx.snapshot["entities"]) == 5

    def test_commit_captures_propositions(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        with TransactionContext(interp_with_items) as tx:
            assert "propositions" in tx.snapshot

    def test_multiple_changes_committed(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        entity1 = interp_with_items.get_entity("item-0")
        entity2 = interp_with_items.get_entity("item-1")
        assert entity1 is not None
        assert entity2 is not None

        with TransactionContext(interp_with_items) as tx:
            entity1.attributes["status"] = "Done"
            entity2.attributes["status"] = "Done"
            tx.add_change("entity_update", {"entity": entity1})
            tx.add_change("entity_update", {"entity": entity2})

        assert interp_with_items.get_entity("item-0").attributes["status"] == "Done"
        assert interp_with_items.get_entity("item-1").attributes["status"] == "Done"

    def test_changes_cleared_after_commit(
        self, interp_with_items: ResolutionInterpreter,
    ) -> None:
        entity = interp_with_items.get_entity("item-0")
        assert entity is not None

        tx = TransactionContext(interp_with_items)
        tx.__enter__()
        entity.attributes["status"] = "Done"
        tx.add_change("entity_update", {"entity": entity})
        tx.__exit__(None, None, None)

        assert tx.changes == []
