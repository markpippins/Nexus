"""Hermetic C6 tests (plan 8261639): ticket-lane dispositions + Q-D soak.

Throwaway canonical schema (V139+V141, schema-rewritten — never touches
resolution.* live); canary-prefixed rows on the shared-live vision.tickets
surface with teardown-guaranteed cleanup.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_c6_ticket_dispositions.py -v
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
import disposition_c6_tickets  # noqa: E402
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

TICKET_PREFIX = "zz-c6-test-"


def _apply_reschema(conn, sql_path: str, schema: str) -> None:
    with open(sql_path) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.").replace("nebula.", f"{schema}.")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class C6TestBase(unittest.TestCase):

    def setUp(self):
        self._raw_conn = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw_conn, "test_c6_canon")
            _apply_reschema(self._raw_conn, _V139_SQL, self.canon)
            _apply_reschema(self._raw_conn, _V141_SQL, self.canon)
            # V142 seed parity (same as the redirect/backfill test bases):
            # the drift registry check expects the V142-registered producer.
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
            self.ticket_ids = []
            self.addCleanup(self._teardown)
        except Exception:
            self._raw_conn.close()
            raise

    def _teardown(self):
        try:
            cur = self._raw_conn.cursor()
            for tid in self.ticket_ids:
                cur.execute("DELETE FROM vision.tickets WHERE id = %s", (tid,))
            self._raw_conn.commit()
        except Exception:
            self._raw_conn.rollback()
        try:
            drop_test_schema(_DSN, self.canon)
        except Exception:
            pass
        self._raw_conn.close()

    def _ticket(self, status="completed", role="builder",
                created_at="2020-01-01T00:00:00Z"):
        """2020 timestamps sort FIRST (ORDER BY created_at ASC) so test rows
        are deterministic within any --limit despite the live pool."""
        tid = TICKET_PREFIX + uuid.uuid4().hex[:12]
        cur = self._raw_conn.cursor()
        cur.execute(
            """INSERT INTO vision.tickets (id, plan_id, role, status, created_at)
               VALUES (%s, %s, %s, %s, %s)""",
            (tid, f"zz-c6-plan-{uuid.uuid4().hex[:8]}", role, status, created_at))
        self._raw_conn.commit()
        self.ticket_ids.append(tid)
        return tid

    def _run(self, dry_run=False, limit=2000, max_seconds=30.0):
        return disposition_c6_tickets.run(
            self._raw_conn, legacy_schema="vision", canonical_schema=self.canon,
            dry_run=dry_run, limit=limit, max_seconds=max_seconds)

    def _disposition(self, ticket_id):
        cur = self._raw_conn.cursor()
        cur.execute(
            f"SELECT disposition_class, target_refs FROM {self.canon}.migration_disposition "
            f"WHERE source_schema='vision' AND source_table='tickets' "
            f"AND source_pk=%s AND migration_version='C6'", (ticket_id,))
        row = cur.fetchone()
        self._raw_conn.commit()
        return row


class TestTicketDispositions(C6TestBase):

    def test_terminal_ticket_retired_with_outcome(self):
        tid = self._ticket(status="cancelled")
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("retired", 0), 1)
        disp = self._disposition(tid)
        self.assertEqual(disp[0], "retired")
        refs = disp[1] if isinstance(disp[1], dict) else json.loads(disp[1])
        self.assertEqual(refs["final_status"], "cancelled")

    def test_open_ticket_unlinked_not_closed(self):
        tid = self._ticket(status="open")
        report = self._run()
        self.assertGreaterEqual(report["counts"].get("unlinked", 0), 1)
        disp = self._disposition(tid)
        self.assertEqual(disp[0], "unlinked")
        cur = self._raw_conn.cursor()
        cur.execute("SELECT status FROM vision.tickets WHERE id = %s", (tid,))
        self.assertEqual(cur.fetchone()[0], "open",
                         "live tickets must NEVER be closed by disposition")
        self._raw_conn.commit()

    def test_rerun_is_idempotent(self):
        tid = self._ticket(status="expired")
        self._run()
        disp1 = self._disposition(tid)
        self._run()
        self.assertEqual(self._disposition(tid), disp1)

    def test_dry_run_writes_nothing(self):
        self._ticket(status="completed")
        report = self._run(dry_run=True)
        self.assertIn("retired", report["counts"])
        cur = self._raw_conn.cursor()
        cur.execute(f"SELECT count(*) FROM {self.canon}.migration_disposition")
        self.assertEqual(cur.fetchone()[0], 0)
        self._raw_conn.commit()

    def test_limit_processes_subset(self):
        ids = [self._ticket(status="failed") for _ in range(3)]
        self._run(limit=2)
        disposed = [i for i in ids if self._disposition(i) is not None]
        self.assertEqual(len(disposed), 2)

    def test_remaining_matches_gate_shape(self):
        # (created_at dates stagger the two canary rows deterministically.)
        open_tid = self._ticket(status="open", created_at="2020-01-02T00:00:00Z")
        done_tid = self._ticket(status="completed", created_at="2020-01-01T00:00:00Z")
        # First pass: exactly one row dispositioned (the earliest = done_tid);
        # the still-open canary AND the live pool remain undisposed.
        report = self._run(limit=1)
        self.assertIsNotNone(self._disposition(done_tid))
        self.assertIsNone(self._disposition(open_tid))
        self.assertGreaterEqual(report["remaining_undisposed"], 1)
        # Full pass: everything dispositioned; the open ticket unlinked,
        # not closed; remaining drains to zero (pool fits the limit).
        report2 = self._run()
        self.assertIn(open_tid, report2["unlinked_ids"])
        self.assertEqual(self._disposition(open_tid)[0], "unlinked")
        self.assertEqual(report2["remaining_undisposed"], 0)


class TestSoakRecorder(C6TestBase):

    def _record(self):
        return lilac_drift.record_soak_evidence(self._raw_conn,
                                                schema=self.canon)

    def test_green_day_recorded_and_idempotent(self):
        result = self._record()
        self.assertTrue(result["green"], f"expected green: {result['summary']}")
        cur = self._raw_conn.cursor()
        cur.execute(f"SELECT green, recorded_by FROM {self.canon}.soak_evidence "
                    f"WHERE evidence_date = CURRENT_DATE")
        row = cur.fetchone()
        self.assertIsNotNone(row)
        self.assertTrue(row[0])
        self.assertEqual(row[1], "soak-cron")
        self._raw_conn.commit()
        # Rerun: same day, still one row (evidence_date UNIQUE).
        self._record()
        cur.execute(f"SELECT count(*) FROM {self.canon}.soak_evidence")
        self.assertEqual(cur.fetchone()[0], 1)
        self._raw_conn.commit()

    def test_shadow_failed_day_not_green(self):
        """A day carrying legacy_shadow_failed events is RED (Q-B: expected
        during Stage C but never green evidence), and the recorder's merge
        must PRESERVE the events."""
        cur = self._raw_conn.cursor()
        cur.execute(
            f"INSERT INTO {self.canon}.soak_evidence "
            f"(evidence_date, report, green, recorded_by) "
            f"VALUES (CURRENT_DATE, %s::jsonb, false, 'legacy_shadow_failed')",
            (json.dumps({"legacy_shadow_failed": [
                {"source_receipt_id": "rec-x", "error": "simulated"}]}),))
        self._raw_conn.commit()
        result = self._record()
        self.assertFalse(result["green"])
        cur.execute(f"SELECT report->'legacy_shadow_failed' FROM {self.canon}.soak_evidence "
                    f"WHERE evidence_date = CURRENT_DATE")
        events = cur.fetchone()[0]
        if isinstance(events, str):
            events = json.loads(events)
        self.assertEqual(len(events), 1, "merge must preserve failure events")
        self._raw_conn.commit()


if __name__ == "__main__":
    unittest.main()
