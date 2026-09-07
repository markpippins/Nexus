"""Hermetic C4 backfill test (plan 8261639) — time-boxed, idempotent pass.

Exercises backfill_c4.run against a THROWAWAY canonical schema (V139+V141
DDL, schema-rewritten — never touches resolution.* live) with canary-
namespaced legacy rows on the shared-live vision.receipts surface
(test_lifecycle convention; teardown-guaranteed).

Covers the ratified C4 ruling (e29eb6a1 / 1b02c07c) + Q-A..Q-D semantics:

- map:        mappable row, no twin → imported, disposition 'mapped'
- replay:     identical rerun → zero changes (duplicate-equivalent → mapped)
- natural:    pre-existing shadow twin, fingerprint-consistent → 'mapped'
              via existing-twin, NO second canonical row
- quarantine: existing twin diverging on identity fields → 'quarantined',
              divergence preserved (R4/R5)
- discarded:  legacy-only type (PROPOSED) → 'discarded', no canonical row
- dry-run:    classifies everything, writes NOTHING
- limit:      processes at most N rows per run; rerun drains

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_c4_backfill.py -v
"""
import json
import os
import sys
import unittest
import uuid

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.test_helpers import (  # noqa: E402
    cleanup_orphaned_test_schemas,
    create_test_schema,
    drop_test_schema,
)
import backfill_c4  # noqa: E402
import lilac_drift  # noqa: E402

_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not _DSN:
    raise RuntimeError("CONDUIT_PG_DSN must be set to run tests (PG is mandatory)")

_ORPHANED = cleanup_orphaned_test_schemas(_DSN)
if _ORPHANED:
    print(f"Cleaned up {_ORPHANED} orphaned test schema(s)", file=sys.stderr)

_SQL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "sql")
_V139_SQL = os.path.join(_SQL_DIR, "V139__lilac_resolution_canonical_persistence.sql")
_V141_SQL = os.path.join(_SQL_DIR, "V141__lilac_c6_soak_and_retirement_gate.sql")

LEGACY_PREFIX = "rec-zz-c4-"


def _apply_reschema(conn, sql_path: str, schema: str) -> None:
    with open(sql_path) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.").replace("nebula.", f"{schema}.")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class C4BackfillTestBase(unittest.TestCase):

    def setUp(self):
        self._env_stack = []
        self._raw_conn = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw_conn, "test_c4_canon")
            _apply_reschema(self._raw_conn, _V139_SQL, self.canon)
            _apply_reschema(self._raw_conn, _V141_SQL, self.canon)
            # V142 seed parity (same as test_c3_receipt_redirect): the
            # backfill imports as nexus-conduit-python — register it so
            # grant semantics match production (V139 seeds only the
            # original three producers).
            with self._raw_conn.cursor() as cur:
                cur.execute(
                    f"INSERT INTO {self.canon}.producer_registry "
                    f"(producer_id, name, allowed_kinds, contract_version_min, "
                    f" contract_version_max, registered_by) "
                    f"VALUES ('nexus-conduit-python', 'Conduit Python kernel (test seed)', "
                    f" ARRAY['plan_create','planning','implementation','review','review_pass',"
                    f"         'review_reject','critique','critique_pass','critique_reject','block',"
                    f"         'hold','ccnf_execution','requeued','api_limit','abandoned',"
                    f"         'cancelled','plan_block'], 1, 1, 'test-seed') "
                    f"ON CONFLICT (producer_id) DO NOTHING")
            self._raw_conn.commit()
            self.legacy_ids = []
            self.addCleanup(self._teardown)
        except Exception:
            self._raw_conn.close()
            raise

    def _teardown(self):
        try:
            cur = self._raw_conn.cursor()
            for rid in self.legacy_ids:
                cur.execute("DELETE FROM vision.receipts WHERE id = %s", (rid,))
            self._raw_conn.commit()
        except Exception:
            self._raw_conn.rollback()
        try:
            drop_test_schema(_DSN, self.canon)
        except Exception:
            pass
        self._raw_conn.close()
        for key, old in reversed(self._env_stack):
            if old is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old

    # ── legacy row factory (shared-live surface, canary ids) ─────────

    def _legacy_row(self, rtype="PLANNING", summary="c4 probe",
                    created_at="2020-01-01T00:00:00Z"):
        # 2020 timestamp sorts FIRST (ORDER BY created_at ASC) so the test's
        # own rows are deterministic within any --limit despite the large
        # live pending pool.
        rid = LEGACY_PREFIX + uuid.uuid4().hex[:12]
        plan_id = f"zz-c4-{uuid.uuid4().hex[:8]}"
        cur = self._raw_conn.cursor()
        cur.execute(
            """INSERT INTO vision.receipts
                   (id, plan_id, type, agent_role, session_id, ticket_id,
                    summary, artifact_path, metadata_json, tokens_used, created_at)
               VALUES (%s,%s,%s,'engineer','sess-c4','',%s,'','{}',0,%s)""",
            (rid, plan_id, rtype, summary, created_at))
        self._raw_conn.commit()
        self.legacy_ids.append(rid)
        return {"id": rid, "plan_id": plan_id, "type": rtype, "summary": summary}

    def _run(self, dry_run=False, limit=500, max_seconds=30.0):
        return backfill_c4.run(self._raw_conn, legacy_schema="vision",
                               canonical_schema=self.canon, dry_run=dry_run,
                               limit=limit, max_seconds=max_seconds)

    def _disposition(self, legacy_id):
        cur = self._raw_conn.cursor()
        cur.execute(
            f"SELECT disposition_class, target_refs FROM {self.canon}.migration_disposition "
            f"WHERE source_schema='vision' AND source_table='receipts' "
            f"AND source_pk=%s AND migration_version='C4'", (legacy_id,))
        row = cur.fetchone()
        self._raw_conn.commit()
        return row

    def _canonical_count(self, legacy_id):
        cur = self._raw_conn.cursor()
        cur.execute(
            f"SELECT count(*) FROM {self.canon}.receipt WHERE source_receipt_id=%s",
            (legacy_id,))
        n = cur.fetchone()[0]
        self._raw_conn.commit()
        return n


class TestC4Map(C4BackfillTestBase):

    def test_mappable_row_imported_and_mapped(self):
        row = self._legacy_row(rtype="PLANNING")
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("mapped", 0), 1)
        self.assertEqual(self._canonical_count(row["id"]), 1)
        disp = self._disposition(row["id"])
        self.assertIsNotNone(disp)
        self.assertEqual(disp[0], "mapped")
        refs = disp[1] if isinstance(disp[1], dict) else json.loads(disp[1])
        self.assertIn("canonical_receipt_id", refs)

    def test_rerun_is_idempotent(self):
        row = self._legacy_row(rtype="IMPLEMENTATION")
        self._run()
        disp1 = self._disposition(row["id"])
        self.assertEqual(self._canonical_count(row["id"]), 1)
        # Rerun: the test row must not be re-processed, re-imported, or
        # re-dispositioned. (The whole-schema canonical count is NOT stable
        # across runs — each run legitimately drains more live pending rows
        # into the throwaway schema.)
        self._run()
        self.assertEqual(self._disposition(row["id"]), disp1)
        self.assertEqual(self._canonical_count(row["id"]), 1)

    def _count_canon_total(self):
        cur = self._raw_conn.cursor()
        cur.execute(f"SELECT count(*) FROM {self.canon}.receipt")
        n = cur.fetchone()[0]
        self._raw_conn.commit()
        return n


class TestC4TwinCases(C4BackfillTestBase):

    def test_natural_twin_mapped_without_second_row(self):
        """Pre-existing shadow twin + consistent identity → mapped, no import."""
        row = self._legacy_row(rtype="PLANNING", summary="shadow twin probe")
        # Seed the natural twin exactly as the shadow seam would (same payload
        # reconstruction the backfill compares against).
        import backfill_c4 as b
        cur = self._raw_conn.cursor()
        payload = b._legacy_payload({
            "plan_id": row["plan_id"], "type": "PLANNING",
            "agent_role": "engineer", "session_id": "sess-c4",
            "ticket_id": "", "summary": row["summary"],
            "artifact_path": "", "tokens_used": 0,
            "metadata_json": "{}", "created_at": "2026-08-01T00:00:00Z",
        })
        import lilac
        cur.execute(
            f"""INSERT INTO {self.canon}.receipt
                (producer_id, kind, source_system, source_receipt_id,
                 payload_fingerprint, payload, refs, contract_version)
                VALUES ('nexus-conduit-python','planning','conduit',%s,%s,%s,%s,1)""",
            (row["id"], lilac.payload_fingerprint(payload),
             json.dumps(payload), json.dumps({"plan_id": row["plan_id"]})))
        self._raw_conn.commit()
        n_before = self._canonical_count(row["id"])
        self.assertEqual(n_before, 1)
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("mapped", 0), 1)
        self.assertEqual(self._canonical_count(row["id"]), 1,
                         "existing twin must NOT be duplicated")
        disp = self._disposition(row["id"])
        refs = disp[1] if isinstance(disp[1], dict) else json.loads(disp[1])
        self.assertEqual(refs.get("via"), "conduit")

    def test_divergent_twin_quarantined(self):
        """Existing twin diverging on identity fields → quarantined (R4/R5)."""
        row = self._legacy_row(rtype="BLOCK", summary="original truth")
        import lilac
        cur = self._raw_conn.cursor()
        divergent = {
            "plan_id": row["plan_id"], "receipt_type": "BLOCK",
            "agent_role": "engineer", "session_id": "sess-c4",
            "ticket_id": "", "summary": "DIVERGENT-summary",
            "artifact_path": "", "tokens_used": 0, "metadata": {},
        }
        cur.execute(
            f"""INSERT INTO {self.canon}.receipt
                (producer_id, kind, source_system, source_receipt_id,
                 payload_fingerprint, payload, refs, contract_version)
                VALUES ('nexus-conduit-python','block','import:vision.receipts',%s,%s,%s,'{{}}',1)""",
            (row["id"], lilac.payload_fingerprint(divergent),
             json.dumps(divergent)))
        self._raw_conn.commit()
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("quarantined", 0), 1)
        disp = self._disposition(row["id"])
        self.assertEqual(disp[0], "quarantined")
        self.assertEqual(self._canonical_count(row["id"]), 1,
                         "divergence must be preserved, never overwritten")


class TestC4Discarded(C4BackfillTestBase):

    def test_legacy_only_type_discarded(self):
        row = self._legacy_row(rtype="PROPOSED")
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("discarded", 0), 1)
        self.assertEqual(self._canonical_count(row["id"]), 0,
                         "discarded rows must never gain a canonical twin")
        disp = self._disposition(row["id"])
        self.assertEqual(disp[0], "discarded")
        refs = disp[1] if isinstance(disp[1], dict) else json.loads(disp[1])
        self.assertIn("no ratified canonical kind", refs.get("reason", ""))


class TestC4Bounded(C4BackfillTestBase):

    def test_dry_run_writes_nothing(self):
        self._legacy_row(rtype="PLANNING")
        self._legacy_row(rtype="PROPOSED")
        report = self._run(dry_run=True)
        self.assertIn("to_import", report["counts"])
        self.assertIn("discarded", report["counts"])
        cur = self._raw_conn.cursor()
        cur.execute(f"SELECT count(*) FROM {self.canon}.receipt")
        self.assertEqual(cur.fetchone()[0], 0, "dry-run must not write canonical rows")
        cur.execute(f"SELECT count(*) FROM {self.canon}.migration_disposition")
        self.assertEqual(cur.fetchone()[0], 0, "dry-run must not write dispositions")
        self._raw_conn.commit()

    def test_limit_processes_subset_then_drains(self):
        rows = [self._legacy_row(rtype="REVIEW_PASS") for _ in range(4)]
        self._run(limit=2)   # first two test rows (they sort first)
        self._run(limit=2)   # next two
        # All four test rows are now dispositioned exactly once.
        for r in rows:
            disp = self._disposition(r["id"])
            self.assertIsNotNone(disp, f"{r['id']} not dispositioned")
            self.assertEqual(disp[0], "mapped")
            self.assertEqual(self._canonical_count(r["id"]), 1)


class TestC4LiveSanity(C4BackfillTestBase):
    """Read-only sanity of the live surfaces the pass will touch."""

    def test_live_counts_are_sane(self):
        cur = self._raw_conn.cursor()
        cur.execute("SELECT count(*) FROM vision.receipts")
        legacy_total = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM vision.receipts WHERE type = ANY(%s)",
            (list(lilac_drift.KIND_BY_TYPE),))
        mappable = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM resolution.migration_disposition "
                    "WHERE migration_version='C4'")
        disposed = cur.fetchone()[0]
        self._raw_conn.commit()
        self.assertGreater(legacy_total, 0)
        self.assertGreaterEqual(mappable, disposed)


if __name__ == "__main__":
    unittest.main()
