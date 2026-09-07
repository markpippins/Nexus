"""Hermetic Stage C/D prep tests (V145 C2 gate + V144 self-gate), plan 8261639.

Throwaway schemas, never touching resolution.*/vision.* live:

- C2 gate tests: V141+V145 reschema'd (soak_evidence + producer_refusals +
  c2_trailing_gate). Covers clean window, real-writer refusal, declared-canary
  exclusion by identity (rec-zz-redirect- prefix), window expiry, and Q-A
  per-producer scoping.
- Adapter leg-1 feed: DBAdapter._record_producer_refusal writes real-writer
  refusals and suppresses declared-canary ids BY CONSTRUCTION (C2: identity,
  never inference).
- V144 self-gate: refuses (P1000) while c6_retirement_gate is unsatisfied;
  applies cleanly once every gate condition is seeded (7 green days, 2
  signoffs, empty legacy surfaces) and renames the legacy tables.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_v144_v145_stage_cd_prep.py -v
"""
import contextlib
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
from lilac import LilacPersistenceError  # noqa: E402
from db_adapter import DBAdapter, _ConnectionProxy  # noqa: E402

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
_V144_SQL = os.path.join(_SQL_DIR, "V144__lilac_stage_d_legacy_retirement.sql")
_V145_SQL = os.path.join(_SQL_DIR, "V145__lilac_stage_c_trailing_gate.sql")

PRODUCER = "conduit-mcp"
OTHER_PRODUCER = "nexus-execution-worker"


def _apply_reschema(conn, sql_path: str, schema: str, extra_prefixes=()) -> None:
    with open(sql_path) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.")
    for prefix in extra_prefixes:
        sql = sql.replace(prefix, f"{schema}.")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class C2TrailingGateTest(unittest.TestCase):
    """V145: the executable C2 trailing-24h gate (legs 1 + 2)."""

    def setUp(self):
        self._raw = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw, "test_v145_c2")
            _apply_reschema(self._raw, _V141_SQL, self.canon)
            _apply_reschema(self._raw, _V145_SQL, self.canon)
            self.addCleanup(self._teardown)
        except Exception:
            self._raw.close()
            raise

    def _teardown(self):
        try:
            drop_test_schema(_DSN, self.canon)
        except Exception:
            pass
        self._raw.close()

    def _gate(self, producer=PRODUCER, hours=24):
        with self._raw.cursor() as cur:
            cur.execute(f"SELECT {self.canon}.c2_trailing_gate(%s, %s)",
                        (producer, hours))
            row = cur.fetchone()
        self._raw.commit()
        return row[0]

    def _add_refusal(self, producer=PRODUCER, receipt_id=None, age_hours=0):
        receipt_id = receipt_id or f"rec-{uuid.uuid4().hex[:8]}"
        with self._raw.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {self.canon}.producer_refusals
                       (producer_id, receipt_type, source_receipt_id, plan_id,
                        sqlstate, error, recorded_at)
                    VALUES (%s,'PLANNING',%s,'p1','P0004','refused',
                            now() - make_interval(hours => %s))""",
                (producer, receipt_id, age_hours))
        self._raw.commit()
        return receipt_id

    def _add_shadow_failed(self, source_id, evidence_date=None):
        evidence_date = evidence_date or "CURRENT_DATE"
        with self._raw.cursor() as cur:
            cur.execute(
                f"""INSERT INTO {self.canon}.soak_evidence
                       (evidence_date, report, green, recorded_by)
                    VALUES ({evidence_date},
                            %s::jsonb, false, 'test')""",
                (json.dumps({"legacy_shadow_failed": [
                    {"source_receipt_id": source_id}]}),))
        self._raw.commit()

    def test_clean_window_satisfied(self):
        g = self._gate()
        self.assertTrue(g["satisfied"])
        self.assertEqual(g["real_refusals"], 0)
        self.assertEqual(g["non_canary_shadow_failures"], 0)

    def test_real_writer_refusal_blocks(self):
        self._add_refusal()
        g = self._gate()
        self.assertFalse(g["satisfied"])
        self.assertEqual(g["real_refusals"], 1)

    def test_canary_refusals_never_enter_leg1_by_construction(self):
        """C2: canary exclusion keys on DECLARED identity — the adapter never
        inserts canary refusals into producer_refusals (tested in the adapter
        class); a canary-prefixed row here would be a contract violation, so
        the gate additionally excludes it by identity (defense in depth)."""
        self._add_refusal(receipt_id="rec-zz-redirect-canary-1")
        g = self._gate()
        self.assertTrue(g["satisfied"],
                        "declared-canary refusal must not block the gate")

    def test_non_canary_shadow_failure_blocks(self):
        self._add_shadow_failed("rec-real-1")
        g = self._gate()
        self.assertFalse(g["satisfied"])
        self.assertEqual(g["non_canary_shadow_failures"], 1)

    def test_canary_shadow_failure_excluded_by_identity(self):
        self._add_shadow_failed("rec-zz-redirect-canary-2")
        g = self._gate()
        self.assertTrue(g["satisfied"])

    def test_window_expiry(self):
        self._add_refusal(age_hours=25)
        g = self._gate(hours=24)
        self.assertTrue(g["satisfied"], "refusal older than the window expires")

    def test_per_producer_scoping(self):
        """Q-A: the gate is per-producer — another producer's refusal does
        not block THIS producer's flip."""
        self._add_refusal(producer=OTHER_PRODUCER)
        g = self._gate(producer=PRODUCER)
        self.assertTrue(g["satisfied"])
        g_other = self._gate(producer=OTHER_PRODUCER)
        self.assertFalse(g_other["satisfied"])


class ProducerRefusalFeedTest(C2TrailingGateTest):
    """Adapter leg-1 feed: _record_producer_refusal (V145 consumer)."""

    def setUp(self):
        super().setUp()
        # The adapter resolves the canonical schema from CONDUIT_LILAC_SCHEMA
        # at call time (default 'resolution') — point it at the throwaway.
        self._prev_schema_env = os.environ.get("CONDUIT_LILAC_SCHEMA")
        os.environ["CONDUIT_LILAC_SCHEMA"] = self.canon
        self.addCleanup(self._restore_schema_env)

    def _restore_schema_env(self):
        if self._prev_schema_env is None:
            os.environ.pop("CONDUIT_LILAC_SCHEMA", None)
        else:
            os.environ["CONDUIT_LILAC_SCHEMA"] = self._prev_schema_env

    def _stub_adapter(self):
        stub = type("Stub", (), {})()

        @contextlib.contextmanager
        def fake_get_connection():
            yield _ConnectionProxy(self._raw, schema=self.canon)

        stub._get_connection = fake_get_connection
        return stub

    def _record(self, source_id, producer=PRODUCER):
        DBAdapter._record_producer_refusal(
            self._stub_adapter(), producer, "PLANNING", source_id, "p1",
            LilacPersistenceError("refused: producer grant violation"))

    def _refusal_count(self):
        with self._raw.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {self.canon}.producer_refusals")
            n = cur.fetchone()[0]
        self._raw.commit()
        return n

    def test_real_writer_refusal_recorded_and_counts(self):
        self._record("rec-real-77")
        self.assertEqual(self._refusal_count(), 1)
        g = self._gate()
        self.assertFalse(g["satisfied"])
        self.assertEqual(g["real_refusals"], 1)

    def test_canary_refusal_suppressed_by_construction(self):
        self._record("rec-zz-redirect-canary-9")
        self.assertEqual(self._refusal_count(), 0,
                         "declared canary ids must never enter the leg-1 stream")
        self.assertTrue(self._gate()["satisfied"])


class V144SelfGateTest(unittest.TestCase):
    """V144: the self-gating retirement DDL."""

    def setUp(self):
        self._raw = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw, "test_v144_gate")
            # V139 first: the canonical tables (receipt/ticket/ticket_transition/
            # fanout_transition) — without them the gate's infra probes crash
            # with 42P01 before the self-gate can raise P1000.
            _apply_reschema(self._raw, _V139_SQL, self.canon)
            # V141 reschema'd INCLUDING the vision.* literals: the gate's
            # legacy-surface probes must see the throwaway minimal surfaces
            # created below (empty = conditions pass), never the shared live
            # vision tables.
            _apply_reschema(self._raw, _V141_SQL, self.canon,
                            extra_prefixes=("vision.",))
            _apply_reschema(self._raw, _V145_SQL, self.canon)
            # Minimal legacy surfaces inside the throwaway schema (the gate
            # reads {canon}.receipts / {canon}.tickets after the vision.*
            # reschema — these simulate the legacy surfaces V144 renames).
            with self._raw.cursor() as cur:
                cur.execute(f"""CREATE TABLE {self.canon}.receipts
                                  (id text PRIMARY KEY, type text)""")
                cur.execute(f"""CREATE TABLE {self.canon}.tickets
                                  (id text PRIMARY KEY, status text, plan_id text)""")
            self._raw.commit()
            self.addCleanup(self._teardown)
        except Exception:
            self._raw.close()
            raise

    def _teardown(self):
        try:
            drop_test_schema(_DSN, self.canon)
        except Exception:
            pass
        self._raw.close()

    def _apply_v144(self):
        _apply_reschema(self._raw, _V144_SQL, self.canon,
                        extra_prefixes=("vision.",))

    def _seed_satisfied_gate(self):
        with self._raw.cursor() as cur:
            for i in range(7):
                cur.execute(
                    f"""INSERT INTO {self.canon}.soak_evidence
                           (evidence_date, report, green, recorded_by)
                        VALUES (CURRENT_DATE - %s, '{{}}'::jsonb, true, 'test')""",
                    (i,))
            cur.execute(
                f"""INSERT INTO {self.canon}.retirement_signoff (role, signoff, signed_by)
                    VALUES ('operator','approved','operator'),
                            ('architect','approved','architect')""")
        self._raw.commit()

    def test_v144_refuses_when_gate_unsatisfied(self):
        with self.assertRaises(psycopg2.Error) as ctx:
            self._apply_v144()
        self.assertEqual(getattr(ctx.exception, "pgcode", None), "P1000",
                         "self-gate must refuse with its dedicated errcode")
        self.assertIn("self-gate FAILED", str(ctx.exception))

    def test_v144_applies_when_gate_satisfied(self):
        self._seed_satisfied_gate()
        self._apply_v144()  # must not raise
        with self._raw.cursor() as cur:
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema=%s AND table_name IN "
                "('receipts','tickets','receipts_retired','tickets_retired')",
                (self.canon,))
            names = {r[0] for r in cur.fetchall()}
        self._raw.commit()
        self.assertNotIn("receipts", names, "legacy name must go dark")
        self.assertNotIn("tickets", names, "legacy name must go dark")
        self.assertIn("receipts_retired", names)
        self.assertIn("tickets_retired", names)


if __name__ == "__main__":
    unittest.main()
