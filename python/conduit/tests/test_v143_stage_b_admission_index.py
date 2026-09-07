"""Hermetic Stage B tests (V143, plan 8261639): PEB admission replay-proofing.

Throwaway canonical schema: V139+V141+V143 DDL, schema-rewritten (never
touches resolution.* live). V143's legacy-surface probe is skipped inside
throwaway schemas by design (documented in the migration).

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_v143_stage_b_admission_index.py -v
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
from lilac import LilacAdapter, LilacPersistenceError  # noqa: E402

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
_V142_SQL = os.path.join(_SQL_DIR, "V142__lilac_register_conduit_python_producer.sql")
_V143_SQL = os.path.join(_SQL_DIR, "V143__lilac_stage_b_admission_peb_txn_index.sql")

PRODUCER = "peb-srv"          # Q3/C2: PEB is the sole admission grantee
LIFECYCLE_PRODUCER = "nexus-conduit-python"  # V142-registered


def _apply_reschema(conn, sql_path: str, schema: str) -> None:
    with open(sql_path) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.").replace("nebula.", f"{schema}.")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class StageBTestBase(unittest.TestCase):

    def setUp(self):
        self._raw_conn = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw_conn, "test_v143_canon")
            _apply_reschema(self._raw_conn, _V139_SQL, self.canon)
            _apply_reschema(self._raw_conn, _V141_SQL, self.canon)
            _apply_reschema(self._raw_conn, _V142_SQL, self.canon)
            _apply_reschema(self._raw_conn, _V143_SQL, self.canon)
            self.addCleanup(self._teardown)
        except Exception:
            self._raw_conn.close()
            raise

    def _teardown(self):
        try:
            drop_test_schema(_DSN, self.canon)
        except Exception:
            pass
        self._raw_conn.close()

    def _insert(self, kind, producer, source_id, payload):
        adapter = LilacAdapter(lambda: self._raw_conn, schema=self.canon,
                               producer_id=producer)
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"SELECT 1 FROM {self.canon}.receipt WHERE source_receipt_id=%s "
                f"AND source_system='stageb-test'", (source_id,))
            exists = cur.fetchone()
        if exists:
            with self._raw_conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {self.canon}.receipt WHERE source_receipt_id=%s "
                    f"AND source_system='stageb-test'", (source_id,))
            self._raw_conn.commit()
        return adapter.insert_receipt(
            self._raw_conn, kind=kind, source_receipt_id=source_id,
            payload=payload, refs={"plan_id": payload.get("plan_id")},
            source_system="stageb-test")

    def _count_admission(self, txn):
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"SELECT count(*) FROM {self.canon}.receipt "
                f"WHERE kind='admission' AND payload->>'peb_transaction_id'=%s",
                (txn,))
            n = cur.fetchone()[0]
        self._raw_conn.commit()
        return n


class TestV143AdmissionIndex(StageBTestBase):

    def test_admission_replay_same_txn_duplicates(self):
        """Same peb_transaction_id → duplicate-equivalent, ONE row (Stage B)."""
        txn = str(uuid.uuid4())
        payload = {"plan_id": "p1", "peb_transaction_id": txn,
                   "decision": "ADMIT", "generation": 1}
        outcome1, rid1 = self._insert("admission", PRODUCER, f"adm-{txn}-1", dict(payload))
        outcome2, rid2 = self._insert("admission", PRODUCER, f"adm-{txn}-2", dict(payload))
        self.assertEqual(outcome1, "accepted")
        self.assertEqual(outcome2, "duplicate-equivalent",
                         "same txn id must replay as duplicate-equivalent")
        self.assertEqual(rid1, rid2)
        self.assertEqual(self._count_admission(txn), 1)

    def test_admission_conflicting_payload_refused(self):
        """Same txn id, different payload → R4 conflict (fail-closed)."""
        txn = str(uuid.uuid4())
        self._insert("admission", PRODUCER, f"adm-{txn}-1",
                     {"plan_id": "p1", "peb_transaction_id": txn, "decision": "ADMIT"})
        with self.assertRaises(LilacPersistenceError):
            self._insert("admission", PRODUCER, f"adm-{txn}-2",
                         {"plan_id": "p1", "peb_transaction_id": txn,
                          "decision": "ADMIT", "tampered": True})

    def test_admission_index_present_and_partial(self):
        with self._raw_conn.cursor() as cur:
            cur.execute(
                "SELECT indexdef FROM pg_indexes "
                "WHERE schemaname=%s AND indexname='uq_resolution_receipt_admission_peb_txn'",
                (self.canon,))
            row = cur.fetchone()
        self._raw_conn.commit()
        self.assertIsNotNone(row)
        self.assertIn("UNIQUE", row[0])
        self.assertIn("kind = 'admission'", row[0])

    def test_admission_rows_append_only(self):
        txn = str(uuid.uuid4())
        _, rid = self._insert("admission", PRODUCER, f"adm-{txn}-1",
                              {"plan_id": "p1", "peb_transaction_id": txn})
        with self._raw_conn.cursor() as cur:
            with self.assertRaises(psycopg2.errors.RestrictViolation):
                cur.execute(f"UPDATE {self.canon}.receipt SET payload=%s::jsonb "
                            f"WHERE id=%s",
                            (json.dumps({"peb_transaction_id": txn, "x": 1}), rid))
        self._raw_conn.rollback()
        with self._raw_conn.cursor() as cur:
            with self.assertRaises(psycopg2.errors.RestrictViolation):
                cur.execute(f"DELETE FROM {self.canon}.receipt WHERE id=%s", (rid,))
        self._raw_conn.rollback()

    def test_lifecycle_rows_unaffected_by_append_only(self):
        """WHEN(kind='admission') scoping: lifecycle UPDATE/DELETE still legal
        (ops tooling parity); no admission semantics leak onto lifecycle."""
        payload = {"plan_id": "p1", "receipt_type": "PLANNING"}
        _, rid = self._insert("planning", LIFECYCLE_PRODUCER, "lc-1", payload)
        with self._raw_conn.cursor() as cur:
            cur.execute(f"UPDATE {self.canon}.receipt SET payload=%s::jsonb WHERE id=%s",
                        (json.dumps({**payload, "corrected": True}), rid))
            cur.execute(f"DELETE FROM {self.canon}.receipt WHERE id=%s", (rid,))
        self._raw_conn.commit()

    def test_self_gate_refuses_on_preexisting_duplicates(self):
        """Q-C self-gate: a schema where duplicates exist BEFORE V143 must
        refuse the migration (simulate by inserting a dup with the index
        absent, then re-applying V143)."""
        dup_schema = create_test_schema(self._raw_conn, "test_v143_gate")
        try:
            _apply_reschema(self._raw_conn, _V139_SQL, dup_schema)
            _apply_reschema(self._raw_conn, _V141_SQL, dup_schema)
            txn = str(uuid.uuid4())
            with self._raw_conn.cursor() as cur:
                for i in range(2):
                    cur.execute(
                        f"INSERT INTO {dup_schema}.receipt (producer_id, kind, "
                        f"source_system, source_receipt_id, payload_fingerprint, "
                        f"payload, refs, contract_version) "
                        f"VALUES ('peb-srv','admission','gate-test',%s,%s,%s,'{{}}',1)",
                        (f"gate-{txn}-{i}", f"fp{i}",
                         json.dumps({"peb_transaction_id": txn})))
            self._raw_conn.commit()
            with self.assertRaises(psycopg2.Error) as ctx:
                _apply_reschema(self._raw_conn, _V143_SQL, dup_schema)
            self.assertEqual(getattr(ctx.exception, "pgcode", None), "P0003",
                             "self-gate must refuse with its dedicated errcode")
            self.assertIn("pre-verification FAILED", str(ctx.exception))
        finally:
            self._raw_conn.rollback()
            drop_test_schema(_DSN, dup_schema)


if __name__ == "__main__":
    unittest.main()
