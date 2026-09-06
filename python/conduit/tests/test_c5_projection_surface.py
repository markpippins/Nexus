"""Hermetic C5 test: receipts_unified dual-read projection (plan 8261639).

Applies V139 + V140 in a THROWAWAY schema and verifies:

1. Projection identity: with shadow OFF, the dual-read VIEW returns
   exactly the legacy rows (behavior-identical to V111).
2. Canonical branch: shadow-only canonical rows surface through the
   unified contract (14 columns) with correct legacy type mapping.
3. Deduplication: a receipt present both canonically and in a legacy
   surface appears ONCE — from the legacy branch.
4. Sequence-NULL defect preserved as-is (retired at C6, not patched here).
5. Consumer migration source contract: the db.ts legacy backfill JOIN and
   the shared readers read the projection surface, with dispositions for
   the documented exceptions.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest tests/test_c5_projection_surface.py -v
"""
import json
import os
import sys
import unittest
from datetime import datetime, timezone

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.test_helpers import (  # noqa: E402
    cleanup_orphaned_test_schemas,
    create_test_schema,
    drop_test_schema,
)

_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not _DSN:
    raise RuntimeError("CONDUIT_PG_DSN must be set to run tests (PG is mandatory)")

_ORPHANED = cleanup_orphaned_test_schemas(_DSN)
if _ORPHANED:
    print(f"Cleaned up {_ORPHANED} orphaned test schema(s)", file=sys.stderr)

_NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_V139 = os.path.join(_NEXUS_ROOT, "sql", "V139__lilac_resolution_canonical_persistence.sql")
_V140 = os.path.join(_NEXUS_ROOT, "sql", "V140__receipts_unified_lilac_dual_read.sql")


def _apply_v(sql_path: str, conn, schema: str, schema_map: dict) -> None:
    with open(sql_path) as f:
        raw = f.read()
    for src, dst in schema_map.items():
        raw = raw.replace(f"{src}.", f"{dst}.")
    raw = raw.replace("$resolution$", f"${schema_map['resolution']}$")
    with conn.cursor() as cur:
        cur.execute(raw)
    conn.commit()


class TestC5DualRead(unittest.TestCase):
    def setUp(self):
        self._raw = psycopg2.connect(_DSN)
        try:
            # All Lilac objects live in the throwaway schema; legacy branch
            # tables are faked as same-schema tables (v_schema.vision etc.)
            # because V140 references them qualified.
            self.schema_name = create_test_schema(self._raw, "test_c5_dual")
            schema_map = {
                "resolution": self.schema_name,
                "execution": self.schema_name,
                "vision": self.schema_name,
            }
            # Minimal legacy-branch stand-ins (unified contract columns).
            with self._raw.cursor() as cur:
                cur.execute(f"""
                    CREATE SCHEMA {self.schema_name}_exec;
                    CREATE SCHEMA {self.schema_name}_vis;
                    CREATE TABLE {self.schema_name}_exec.receipts (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        request_id uuid NOT NULL,
                        attempt_id text,
                        type text NOT NULL,
                        agent_role text NOT NULL DEFAULT '',
                        summary text NOT NULL DEFAULT '',
                        metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                        lineage_source text NOT NULL DEFAULT 'conduit',
                        lineage_original_id text,
                        issued_at timestamptz NOT NULL DEFAULT now()
                    );
                    CREATE TABLE {self.schema_name}_exec.requests (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        source_plan_id text NOT NULL
                    );
                    CREATE TABLE {self.schema_name}_vis.receipts (
                        id text PRIMARY KEY,
                        plan_id text NOT NULL,
                        type text NOT NULL,
                        agent_role text NOT NULL DEFAULT '',
                        session_id text NOT NULL DEFAULT '',
                        ticket_id text,
                        artifact_path text,
                        summary text NOT NULL DEFAULT '',
                        metadata_json text NOT NULL DEFAULT '{{}}',
                        tokens_used integer NOT NULL DEFAULT 0,
                        sequence integer,
                        recorded_on_dt timestamptz,
                        recorded_until_dt timestamptz,
                        created_at timestamptz NOT NULL DEFAULT now()
                    );
                """)
            self._raw.commit()
            schema_map = {
                "resolution": self.schema_name,
                "execution": f"{self.schema_name}_exec",
                "vision": f"{self.schema_name}_vis",
                # CRITICAL: nebula MUST be mapped — V140 CREATE OR REPLACEs
                # nebula.receipts_unified. An unmapped nebula would rewrite
                # the LIVE view (incident 2026-09-06, caught + restored by
                # the post-apply sanity count).
                "nebula": self.schema_name,
            }
            _apply_v(_V139, self._raw, self.schema_name, schema_map)
            _apply_v(_V140, self._raw, self.schema_name, schema_map)
            # Post-apply guard: the LIVE unified view must still exist and
            # be owned by the live nebula schema (regclass check).
            with self._raw.cursor() as cur:
                cur.execute("SELECT to_regclass('nebula.receipts_unified')")
                assert cur.fetchone()[0] is not None, "live unified view missing"
        except Exception:
            drop_test_schema(_DSN, self.schema_name)
            drop_test_schema(_DSN, f"{self.schema_name}_exec")
            drop_test_schema(_DSN, f"{self.schema_name}_vis")
            self._raw.close()
            raise
        self.addCleanup(self._teardown)

    def _teardown(self):
        try:
            self._raw.rollback()
        except Exception:
            pass
        try:
            self._raw.close()
        except Exception:
            pass
        for s in (self.schema_name, f"{self.schema_name}_exec", f"{self.schema_name}_vis"):
            drop_test_schema(_DSN, s)

    # ── helpers ──────────────────────────────────────────────────────

    def _insert_legacy_vision(self, rid: str, plan_id: str, rtype: str):
        with self._raw.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {self.schema_name}_vis.receipts
                    (id, plan_id, type, agent_role) VALUES (%s,%s,%s,'planner')""",
                (rid, plan_id, rtype),
            )
        self._raw.commit()

    def _insert_canonical(self, source_receipt_id: str, plan_id: str, kind: str,
                          producer: str = "conduit-mcp"):
        # Mirror the real shadow-seam payload (db_adapter → lilac
        # shadow_record_receipt) so projection extraction matches production.
        payload = json.dumps({
            "agent_role": "planner",
            "session_id": "",
            "artifact_path": "",
            "summary": "c5",
            "ticket_id": None,
            "tokens_used": 0,
            "metadata": {},
            "producer_id": producer,
            "source_channel": "conduit-python",
            "correlation_id": source_receipt_id,
        })
        with self._raw.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {self.schema_name}.receipt
                    (producer_id, kind, source_system, source_receipt_id,
                     payload_fingerprint, payload, refs, contract_version)
                    VALUES (%s,%s,'conduit',%s,'fp-'||%s,%s,
                            jsonb_build_object('plan_id',%s),1)""",
                (producer, kind, source_receipt_id, source_receipt_id, payload, plan_id),
            )
        self._raw.commit()

    def _unified_rows(self, plan_id: str):
        with self._raw.cursor() as cur:
            cur.execute(
                f"""SELECT id, plan_id, type FROM {self.schema_name}.receipts_unified
                    WHERE plan_id = %s ORDER BY created_at""",
                (plan_id,),
            )
            return cur.fetchall()

    # ── tests ────────────────────────────────────────────────────────

    def test_shadow_off_projection_is_legacy_identical(self):
        self._insert_legacy_vision("rec-v1", "zz-c5", "PLANNING")
        rows = self._unified_rows("zz-c5")
        self.assertEqual([(r[0], r[2]) for r in rows], [("rec-v1", "PLANNING")])

    def test_canonical_shadow_only_row_surfaces(self):
        self._insert_canonical("rec-shadow-1", "zz-c5s", "planning")
        rows = self._unified_rows("zz-c5s")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], "rec-shadow-1")
        self.assertEqual(rows[0][2], "PLANNING", "canonical kind must map to legacy type")

    def test_dedup_prefers_legacy_branch(self):
        self._insert_legacy_vision("rec-dup", "zz-c5d", "IMPLEMENTATION")
        self._insert_canonical("rec-dup", "zz-c5d", "implementation")
        rows = self._unified_rows("zz-c5d")
        self.assertEqual(len(rows), 1, "dual-present receipt must appear once")
        self.assertEqual(rows[0][2], "IMPLEMENTATION")

    def test_admission_kind_excluded(self):
        self._insert_canonical("rec-adm-1", "zz-c5a", "admission", producer="peb-srv")
        self.assertEqual(self._unified_rows("zz-c5a"), [],
                         "admission receipts must not leak into the unified surface")

    def test_sequence_null_defect_preserved_not_patched(self):
        self._insert_canonical("rec-seq-1", "zz-c5q", "implementation")
        with self._raw.cursor() as cur:
            cur.execute(
                f"""SELECT sequence FROM {self.schema_name}.receipts_unified
                    WHERE plan_id='zz-c5q' AND id='rec-seq-1'"""
            )
            self.assertIsNone(cur.fetchone()[0], "canonical branch keeps sequence NULL (retired at C6)")


class TestC5ConsumerSourceContract(unittest.TestCase):
    """Source contract: which readers sit on the projection, which are
    documented exceptions (execution-domain / C3-cutover / C6 seam)."""

    def test_backfill_join_reads_projection(self):
        src_path = os.path.join(_NEXUS_ROOT, "typescript/conduit-mcp/src/db.ts")
        with open(src_path) as f:
            src = f.read()
        self.assertIn("JOIN nebula.receipts_unified r ON r.plan_id = p.id", src)
        # The specific legacy backfill must no longer JOIN the raw table.
        import re
        m = re.search(r"INSERT INTO execution\.requests.*?GROUP BY p\.id, p\.title, p\.goal", src, re.DOTALL)
        self.assertIsNotNone(m)
        self.assertNotIn("JOIN vision.receipts", m.group(0))

    def test_plan_status_views_documented_as_legacy_seam(self):
        src_path = os.path.join(_NEXUS_ROOT, "typescript/nebula-srv/migrations/040-create-plan-status-views.sql")
        with open(src_path) as f:
            src = f.read()
        self.assertIn("vision.receipts", src, "plan_status family is part of the legacy seam")


if __name__ == "__main__":
    unittest.main()
