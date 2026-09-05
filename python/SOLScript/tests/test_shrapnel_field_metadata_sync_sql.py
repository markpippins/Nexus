"""PostgreSQL conformance tests for the v37 field metadata sync.

The migration is installed and exercised inside one transaction, then rolled
back. The tests verify that only Resolution metadata/evidence is changed and
that Shrapnel instance values are never copied or touched.
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
_MIGRATION = _REPO_ROOT / "schemas/migrations/resolution/resolution_migration_v37_shrapnel_field_metadata_sync.sql"
_DSN = os.environ.get(
    "CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"
)


def _migration_body() -> str:
    lines = _MIGRATION.read_text(encoding="utf-8").splitlines()
    return "\n".join(
        line for line in lines if line.strip() not in {"BEGIN;", "COMMIT;"}
    )


def _disable_legacy_field_trigger(cur) -> None:
    """Avoid the known legacy updated_at trigger without disabling v37."""
    cur.execute(
        """
        DO $block$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_trigger
                WHERE tgrelid = 'shrapnel.field'::regclass
                  AND tgname = 'trg_field_set_updated_at'
            ) THEN
                ALTER TABLE shrapnel.field DISABLE TRIGGER trg_field_set_updated_at;
            END IF;
        END
        $block$;
        """
    )


def _insert_field(cur, property_name: str, type_code: int) -> int:
    cur.execute(
        """
        INSERT INTO shrapnel.field
            (is_calculated, field_index, label, name, property_name, field_type_code)
        VALUES (false, 0, %s, %s, %s, %s)
        RETURNING id
        """,
        (property_name, property_name, property_name, type_code),
    )
    return cur.fetchone()[0]


@pytest.mark.skipif(psycopg2 is None, reason="psycopg2 is not installed")
def test_shrapnel_field_metadata_sync_is_replayable_and_fail_closed() -> None:
    try:
        conn = psycopg2.connect(_DSN)
    except Exception as exc:  # pragma: no cover - depends on local services
        pytest.skip(f"PostgreSQL is unavailable: {exc}")

    conn.autocommit = False
    cur = conn.cursor()
    suffix = uuid.uuid4().hex
    new_property = f"v37_new_field_{suffix}"
    preserved_property = f"v37_preserved_{suffix}"
    conflict_property = f"v37_conflict_{suffix}"
    unsupported_property = f"v37_unsupported_{suffix}"
    try:
        cur.execute(_migration_body())
        _disable_legacy_field_trigger(cur)

        cur.execute(
            "SELECT id FROM resolution.concept WHERE name = 'ShrapnelFact' AND expired_at IS NULL"
        )
        concept_id = cur.fetchone()[0]

        # A new supported field is synchronized by the authoritative Shrapnel
        # event trigger and is mapped to the closed PostgreSQL type vocabulary.
        field_id = _insert_field(cur, new_property, 2)
        cur.execute(
            """
            SELECT ca.value_type, ca.description
            FROM resolution.concept_attribute ca
            WHERE ca.concept_id = %s AND ca.name = %s
            """,
            (concept_id, new_property),
        )
        value_type, description = cur.fetchone()
        assert value_type == "text"
        assert description == "Synchronized from shrapnel.field metadata"

        cur.execute(
            """
            SELECT count(*)
            FROM resolution.shrapnel_field_sync_evidence
            WHERE field_id = %s
            """,
            (field_id,),
        )
        assert cur.fetchone()[0] == 1

        # Explicit replay is idempotent: one metadata row and one evidence row.
        cur.execute("SELECT resolution.sync_shrapnel_field(%s)", (field_id,))
        assert cur.fetchone()[0] == "already_present"
        cur.execute("SELECT resolution.sync_shrapnel_field(%s)", (field_id,))
        assert cur.fetchone()[0] == "already_present"
        cur.execute(
            """
            SELECT count(*)
            FROM resolution.concept_attribute
            WHERE concept_id = %s AND name = %s
            """,
            (concept_id, new_property),
        )
        assert cur.fetchone()[0] == 1
        cur.execute(
            """
            SELECT count(*)
            FROM resolution.shrapnel_field_sync_evidence
            WHERE field_id = %s
            """,
            (field_id,),
        )
        assert cur.fetchone()[0] == 1

        # Existing metadata is preserved; synchronization does not overwrite
        # descriptions or turn an existing attribute into a copied value.
        cur.execute(
            """
            INSERT INTO resolution.concept_attribute
                (concept_id, name, description, value_type, is_state_attribute)
            VALUES (%s, %s, 'human-authored metadata', 'boolean', false)
            """,
            (concept_id, preserved_property),
        )
        preserved_field_id = _insert_field(cur, preserved_property, 4)
        cur.execute(
            """
            SELECT description, value_type
            FROM resolution.concept_attribute
            WHERE concept_id = %s AND name = %s
            """,
            (concept_id, preserved_property),
        )
        assert cur.fetchone() == ("human-authored metadata", "boolean")
        cur.execute(
            """
            SELECT details->>'instance_values_copied'
            FROM resolution.shrapnel_field_sync_evidence
            WHERE field_id = %s
            """,
            (preserved_field_id,),
        )
        assert cur.fetchone()[0] == "false"

        # A same-name, wrong-type Resolution attribute is a hard conflict.
        cur.execute(
            """
            INSERT INTO resolution.concept_attribute
                (concept_id, name, description, value_type, is_state_attribute)
            VALUES (%s, %s, 'conflicting metadata', 'boolean', false)
            """,
            (concept_id, conflict_property),
        )
        cur.execute("SAVEPOINT v37_conflict")
        with pytest.raises(Exception, match="conflicts with ShrapnelFact attribute"):
            _insert_field(cur, conflict_property, 2)
        cur.execute("ROLLBACK TO SAVEPOINT v37_conflict")

        # A synchronized field cannot silently change shape. The trigger
        # catches an UPDATE to the authoritative metadata and leaves the
        # existing bridge evidence untouched.
        cur.execute("SAVEPOINT v37_changed_type")
        with pytest.raises(Exception, match="metadata changed after synchronization"):
            cur.execute(
                "UPDATE shrapnel.field SET field_type_code = 4 WHERE id = %s",
                (field_id,),
            )
        cur.execute("ROLLBACK TO SAVEPOINT v37_changed_type")
        cur.execute(
            "SELECT field_type_code FROM shrapnel.field WHERE id = %s",
            (field_id,),
        )
        assert cur.fetchone()[0] == 2

        # Evidence is append-only; consumers cannot rewrite or erase the
        # provenance that explains how metadata crossed the bridge.
        cur.execute("SAVEPOINT v37_evidence_update")
        with pytest.raises(Exception, match="append-only"):
            cur.execute(
                "UPDATE resolution.shrapnel_field_sync_evidence SET details = '{}' WHERE field_id = %s",
                (field_id,),
            )
        cur.execute("ROLLBACK TO SAVEPOINT v37_evidence_update")
        cur.execute("SAVEPOINT v37_evidence_delete")
        with pytest.raises(Exception, match="append-only"):
            cur.execute(
                "DELETE FROM resolution.shrapnel_field_sync_evidence WHERE field_id = %s",
                (field_id,),
            )
        cur.execute("ROLLBACK TO SAVEPOINT v37_evidence_delete")

        # Unsupported codes are rejected by the sync even if an extension to
        # field_type is present; the mapping remains closed by this contract.
        cur.execute(
            "INSERT INTO shrapnel.field_type (code, name, description, pg_type) VALUES (99, %s, %s, %s)",
            (f"Unsupported-{suffix}", "test-only unsupported type", "text"),
        )
        cur.execute("SAVEPOINT v37_unsupported")
        with pytest.raises(Exception, match="unsupported Shrapnel field_type_code"):
            _insert_field(cur, unsupported_property, 99)
        cur.execute("ROLLBACK TO SAVEPOINT v37_unsupported")

        # Reconciliation uses the same path as event delivery and must not
        # create any instance-value copy in Resolution.
        cur.execute("SELECT * FROM resolution.reconcile_shrapnel_field_metadata()")
        processed, created, already_present = cur.fetchone()
        assert processed >= 15
        assert created == 0
        assert already_present >= processed
        cur.execute(
            """
            SELECT count(*)
            FROM resolution.concept_attribute_value cav
            JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id
            WHERE ca.concept_id = %s AND ca.name = %s
            """,
            (concept_id, new_property),
        )
        assert cur.fetchone()[0] == 0
    finally:
        conn.rollback()
        cur.close()
        conn.close()
