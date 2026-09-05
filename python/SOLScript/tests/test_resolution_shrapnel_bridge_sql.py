"""PostgreSQL conformance tests for the v36 Shrapnel bridge.

The migration is applied inside each test transaction and rolled back in
teardown. The test proves both the direct bridge function and the Resolution
compiler/function-binding path without persisting fixture data or copied state.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

try:
    import psycopg2
except ImportError:  # pragma: no cover - optional local integration dependency
    psycopg2 = None  # type: ignore[assignment]


_REPO_ROOT = Path(__file__).resolve().parents[3]
_MIGRATION = _REPO_ROOT / "schemas/migrations/resolution/resolution_migration_v36_shrapnel_bridge.sql"
_DSN = os.environ.get(
    "CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"
)


def _migration_body() -> str:
    lines = _MIGRATION.read_text(encoding="utf-8").splitlines()
    return "\n".join(
        line for line in lines if line.strip() not in {"BEGIN;", "COMMIT;"}
    )


@pytest.mark.skipif(psycopg2 is None, reason="psycopg2 is not installed")
def test_shrapnel_bridge_and_function_binding() -> None:
    try:
        conn = psycopg2.connect(_DSN)
    except Exception as exc:  # pragma: no cover - depends on local services
        pytest.skip(f"PostgreSQL is unavailable: {exc}")

    conn.autocommit = False
    cur = conn.cursor()
    asset_id = f"asset:test:keychains-bridge:{uuid.uuid4()}"
    expression_id = str(uuid.uuid4())
    literal_ids = [str(uuid.uuid4()) for _ in range(3)]
    rule_id = str(uuid.uuid4())
    proposition_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    try:
        cur.execute(_migration_body())

        # The long-lived local nexus database has a legacy set_updated_at
        # trigger attached to shrapnel.field, although that legacy table no
        # longer has updated_at. Disable only user triggers for this rollback-
        # scoped fixture; the bridge migration does not alter that unrelated
        # schema defect.
        cur.execute("ALTER TABLE shrapnel.field DISABLE TRIGGER USER")
        cur.execute("INSERT INTO shrapnel.object_instance DEFAULT VALUES RETURNING id")
        object_id = cur.fetchone()[0]

        def add_value(property_name: str, type_code: int, value_sql: str, value: object) -> None:
            cur.execute(
                """
                INSERT INTO shrapnel.field
                    (is_calculated, field_index, label, name, property_name, field_type_code)
                VALUES (false, 0, %s, %s, %s, %s)
                ON CONFLICT (property_name) DO UPDATE SET property_name = EXCLUDED.property_name
                RETURNING id
                """,
                (property_name, property_name, property_name, type_code),
            )
            field_id = cur.fetchone()[0]
            cur.execute(
                "INSERT INTO shrapnel.value (value_type_code) VALUES (%s) RETURNING id",
                (type_code,),
            )
            value_id = cur.fetchone()[0]
            cur.execute(value_sql, (value_id, value))
            cur.execute(
                """
                INSERT INTO shrapnel.object_attribute_value (object_id, field_id, value_id)
                VALUES (%s, %s, %s)
                """,
                (object_id, field_id, value_id),
            )

        add_value("asset_id", 2, "INSERT INTO shrapnel.value_string (id, value) VALUES (%s, %s)", asset_id)
        add_value(
            "partial_implementation",
            4,
            "INSERT INTO shrapnel.value_boolean (id, value) VALUES (%s, %s)",
            True,
        )

        cur.execute("ALTER TABLE shrapnel.field ENABLE TRIGGER USER")
        cur.execute("SELECT now()")
        as_of = cur.fetchone()[0]
        cur.execute(
            "SELECT resolution.read_shrapnel_state_member(%s, %s, %s)",
            (asset_id, "partial_implementation", as_of),
        )
        result = cur.fetchone()[0]
        assert result["status"] == "resolved"
        assert result["value"] is True
        assert result["source_refs"][0]["object_id"] == object_id

        cur.execute(
            "SELECT resolution.read_shrapnel_state_member(%s, %s, %s)",
            (asset_id, "not_allowlisted", as_of),
        )
        assert cur.fetchone()[0]["status"] == "refusal"

        cur.execute(
            "SELECT resolution.read_shrapnel_state_member(%s, %s, %s)",
            (asset_id, "detailed_analysis", as_of),
        )
        missing = cur.fetchone()[0]
        assert missing["status"] == "unavailable"
        assert missing["reason"] == "required_field_missing"

        # Build the same call through Resolution's declarative function binding.
        cur.execute(
            """
            INSERT INTO resolution.expression
                (id, kind, function_name, return_type, label)
            VALUES (%s, 'function_call', 'shrapnel_state_member_true', 'boolean', 'v36 bridge boolean test')
            """,
            (expression_id,),
        )
        literals = [(literal_ids[0], asset_id), (literal_ids[1], "partial_implementation"), (literal_ids[2], as_of.isoformat())]
        for literal_id, literal in literals:
            cur.execute(
                """
                INSERT INTO resolution.expression (id, kind, literal_value, return_type)
                VALUES (%s, 'literal', %s, 'text')
                """,
                (literal_id, literal),
            )
        for position, literal_id in enumerate(literal_ids, start=1):
            cur.execute(
                """
                INSERT INTO resolution.expression_operand
                    (parent_expression_id, child_expression_id, position)
                VALUES (%s, %s, %s)
                """,
                (expression_id, literal_id, position),
            )
        cur.execute(
            "SELECT resolution.compile_root(%s, %s)",
            (expression_id, "'unused-root'") ,
        )
        compiled_sql = cur.fetchone()[0]
        assert "shrapnel_state_member_true" in compiled_sql
        assert "function_binding" not in compiled_sql
        cur.execute(f"SELECT {compiled_sql}")
        assert cur.fetchone()[0] is True

        # The same evaluator path fails closed for an unavailable source.
        cur.execute(
            "SELECT resolution.shrapnel_state_member_true(%s, %s, %s)",
            (asset_id, "detailed_analysis", as_of),
        )
        assert cur.fetchone()[0] is False

        # Exercise the full Resolution proposition evaluator, not only its
        # compiler primitive. The function-call rule reads Shrapnel through
        # the boolean binding and therefore proves the DB evaluator sees the
        # same affirmative state as the normalized SOLScript bridge.
        cur.execute("SELECT id FROM resolution.concept WHERE name = 'PromotionCandidate' LIMIT 1")
        concept_row = cur.fetchone()
        assert concept_row is not None
        concept_id = concept_row[0]
        cur.execute(
            """
            INSERT INTO resolution.rule
                (id, name, rule_type, expression_id, severity, concept_id)
            VALUES (%s, %s, 'invariant', %s, 'hard', %s)
            """,
            (rule_id, f"v36 bridge parity {rule_id}", expression_id, concept_id),
        )
        cur.execute(
            """
            INSERT INTO resolution.proposition
                (id, title, description, asset_concept_id, subject_entity_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                proposition_id,
                "v36 Shrapnel bridge parity",
                "Rollback-scoped parity assertion for the generic Shrapnel bridge",
                concept_id,
                subject_id,
            ),
        )
        cur.execute(
            "INSERT INTO resolution.proposition_assertion (proposition_id, rule_id) VALUES (%s, %s)",
            (proposition_id, rule_id),
        )
        cur.execute(
            """
            SELECT disposition, all_passed, context_status
            FROM resolution.evaluate_proposition(%s, 'manual', NULL)
            """,
            (proposition_id,),
        )
        disposition, all_passed, context_status = cur.fetchone()
        assert disposition == "Asserted"
        assert all_passed is True
        assert context_status == "not_scoped"
    finally:
        conn.rollback()
        cur.close()
        conn.close()
