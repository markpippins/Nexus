"""Hermetic C3 test: Lilac canonical persistence (V139 shapes) (plan 8261639).

Applies the V139 Lilac DDL inside a THROWAWAY schema (repo convention:
create_test_schema/drop_test_schema — never touches resolution.* live) and
exercises the canonical contract end-to-end:

- producer grant enforcement (Q3): allowed kind accepted; wrong kind /
  inactive producer / out-of-range contract_version → refused (P0004).
- R4 receipt idempotency: identical replay → duplicate-equivalent (same
  id); conflicting payload → refused/conflict with BOTH fingerprints.
- ticket issuance idempotency: (workflow_ref, role, position, generation).
- THE fan-out ledger: one row per (input_receipt, kind, policy); replay →
  duplicate-equivalent, no new tickets; close+spawn in one ledger row.
- shadow seam: default OFF (no canonical rows); ON → best-effort record,
  legacy outcome unaffected.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_c3_lilac_persistence.py -v
"""
import json
import os
import sys
import unittest

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tests.test_helpers import (  # noqa: E402
    cleanup_orphaned_test_schemas,
    create_test_schema,
    drop_test_schema,
)
import lilac  # noqa: E402
from lilac import LilacAdapter, LilacPersistenceError  # noqa: E402

_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not _DSN:
    raise RuntimeError("CONDUIT_PG_DSN must be set to run tests (PG is mandatory)")

_ORPHANED = cleanup_orphaned_test_schemas(_DSN)
if _ORPHANED:
    print(f"Cleaned up {_ORPHANED} orphaned test schema(s)", file=sys.stderr)

_V139_SQL = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "sql", "V139__lilac_resolution_canonical_persistence.sql",
)


def _apply_v139(conn, schema: str) -> None:
    """Apply the V139 DDL into the throwaway schema.

    The migration file targets resolution.* literally; inside the test
    schema we rewrite the schema qualification so live data is never
    touched. Trigger/function objects are created with the same rewrite.
    """
    with open(_V139_SQL) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.").replace("$resolution$", f"${schema}$")
    # Strip the R9 comment block header lines referencing other servers —
    # comments are safe to keep, so no further rewriting needed.
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class LilacC3TestBase(unittest.TestCase):
    """Throwaway schema with V139 applied per test."""

    def setUp(self):
        self._raw_conn = psycopg2.connect(_DSN)
        try:
            self.schema_name = create_test_schema(self._raw_conn, "test_c3_lilac")
            _apply_v139(self._raw_conn, self.schema_name)
        except Exception:
            drop_test_schema(_DSN, self.schema_name)
            self._raw_conn.close()
            raise

        def conn_factory():
            return self._raw_conn

        self.adapter = LilacAdapter(conn_factory, schema=self.schema_name,
                                    producer_id="conduit-mcp")
        self.addCleanup(self._teardown)

    def _teardown(self):
        try:
            self._raw_conn.rollback()
        except Exception:
            pass
        try:
            self._raw_conn.close()
        except Exception:
            pass
        drop_test_schema(_DSN, self.schema_name)


class TestProducerGrants(LilacC3TestBase):
    """Q3: kind-scoped grants — a producer cannot write the wrong kind."""

    def test_allowed_kind_accepted(self):
        outcome, rid = self.adapter.insert_receipt(
            self._raw_conn,
            kind="implementation",
            source_receipt_id="rec-test-1",
            payload={"plan_id": "zz-c3", "receipt_type": "IMPLEMENTATION"},
            refs={"plan_id": "zz-c3"},
        )
        self.assertEqual(outcome, "accepted")
        self.assertTrue(len(rid) == 36)

    def test_wrong_kind_refused(self):
        # conduit-mcp has NO 'admission' grant — PEB's kind (Q3 authority).
        with self.assertRaises(LilacPersistenceError) as ctx:
            self.adapter.insert_receipt(
                self._raw_conn,
                kind="admission",
                source_receipt_id="rec-test-2",
                payload={"plan_id": "zz-c3"},
            )
        self.assertIn("refused", str(ctx.exception))

    def test_inactive_producer_refused(self):
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"UPDATE {self.schema_name}.producer_registry SET state='suspended' "
                f"WHERE producer_id='conduit-mcp'"
            )
        self._raw_conn.commit()
        with self.assertRaises(LilacPersistenceError):
            self.adapter.insert_receipt(
                self._raw_conn,
                kind="implementation",
                source_receipt_id="rec-test-3",
                payload={"plan_id": "zz-c3"},
            )

    def test_out_of_range_contract_version_refused(self):
        with self.assertRaises(LilacPersistenceError):
            self.adapter.insert_receipt(
                self._raw_conn,
                kind="implementation",
                source_receipt_id="rec-test-4",
                payload={"plan_id": "zz-c3"},
                contract_version=2,  # producer registered for 1..1
            )


class TestReceiptIdempotency(LilacC3TestBase):
    """R4: (source_system, source_receipt_id, payload_fingerprint)."""

    def test_identical_replay_duplicate_equivalent(self):
        payload = {"plan_id": "zz-c3", "receipt_type": "IMPLEMENTATION", "n": 1}
        outcome1, rid1 = self.adapter.insert_receipt(
            self._raw_conn, kind="implementation",
            source_receipt_id="rec-idem-1", payload=payload,
        )
        outcome2, rid2 = self.adapter.insert_receipt(
            self._raw_conn, kind="implementation",
            source_receipt_id="rec-idem-1", payload=dict(payload),
        )
        self.assertEqual(outcome1, "accepted")
        self.assertEqual(outcome2, "duplicate-equivalent")
        self.assertEqual(rid1, rid2)

    def test_conflicting_payload_recorded_with_both_fingerprints(self):
        outcome1, rid1 = self.adapter.insert_receipt(
            self._raw_conn, kind="implementation",
            source_receipt_id="rec-conflict-1",
            payload={"plan_id": "zz-c3", "n": 1},
        )
        with self.assertRaises(LilacPersistenceError) as ctx:
            self.adapter.insert_receipt(
                self._raw_conn, kind="implementation",
                source_receipt_id="rec-conflict-1",
                payload={"plan_id": "zz-c3", "n": 2},  # different payload
            )
        msg = str(ctx.exception)
        self.assertIn("conflict", msg)
        self.assertIn("existing_fingerprint", msg)
        self.assertIn("incoming_fingerprint", msg)
        # Original row untouched.
        with self._raw_conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {self.schema_name}.receipt")
            self.assertEqual(cur.fetchone()[0], 1)

    def test_fingerprint_deterministic(self):
        a = lilac.payload_fingerprint({"x": 1, "y": [2, 3]})
        b = lilac.payload_fingerprint({"y": [2, 3], "x": 1})
        self.assertEqual(a, b)


class TestTicketAndFanout(LilacC3TestBase):
    """R4 ticket idempotency + THE single receipt-to-ticket fan-out."""

    def _seed_receipt(self, source_id: str) -> str:
        _, rid = self.adapter.insert_receipt(
            self._raw_conn, kind="implementation",
            source_receipt_id=source_id,
            payload={"plan_id": "zz-c3", "receipt_type": "IMPLEMENTATION"},
            refs={"plan_id": "zz-c3"},
        )
        return rid

    def test_ticket_idempotency(self):
        rid = self._seed_receipt("rec-t-1")
        o1, t1 = self.adapter.issue_ticket(
            self._raw_conn, workflow_ref="zz-c3", role="reviewer",
            position=2, predecessor_receipt_id=rid,
        )
        o2, t2 = self.adapter.issue_ticket(
            self._raw_conn, workflow_ref="zz-c3", role="reviewer",
            position=2, predecessor_receipt_id=rid,
        )
        self.assertEqual(o1, "accepted")
        self.assertEqual(o2, "duplicate-equivalent")
        self.assertEqual(t1, t2)

    def test_fanout_close_and_spawn_one_ledger_row(self):
        rid = self._seed_receipt("rec-f-1")
        _, builder_tid = self.adapter.issue_ticket(
            self._raw_conn, workflow_ref="zz-c3", role="builder",
            position=1, predecessor_receipt_id=None,
        )
        outcome, produced = self.adapter.apply_fanout(
            self._raw_conn,
            input_receipt_id=rid, kind="implementation",
            spawn_specs=[{"workflow_ref": "zz-c3", "role": "reviewer",
                          "position": 2, "objective": "review the artifact"}],
            completing_ticket_id=builder_tid,
        )
        self.assertEqual(outcome, "spawned")
        # builder closed + reviewer spawned = 2 produced refs
        self.assertEqual(len(produced), 2)
        with self._raw_conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {self.schema_name}.fanout_transition")
            self.assertEqual(cur.fetchone()[0], 1)
            cur.execute(
                f"SELECT status FROM {self.schema_name}.ticket WHERE id=%s",
                (builder_tid,),
            )
            self.assertEqual(cur.fetchone()[0], "closed")

    def test_fanout_replay_no_new_tickets(self):
        rid = self._seed_receipt("rec-f-2")
        _, builder_tid = self.adapter.issue_ticket(
            self._raw_conn, workflow_ref="zz-c3", role="builder",
            position=1, predecessor_receipt_id=None,
        )
        spec = [{"workflow_ref": "zz-c3", "role": "reviewer", "position": 2}]
        outcome1, produced1 = self.adapter.apply_fanout(
            self._raw_conn, input_receipt_id=rid, kind="implementation",
            spawn_specs=spec, completing_ticket_id=builder_tid,
        )
        outcome2, produced2 = self.adapter.apply_fanout(
            self._raw_conn, input_receipt_id=rid, kind="implementation",
            spawn_specs=spec, completing_ticket_id=builder_tid,
        )
        self.assertEqual(outcome1, "spawned")
        self.assertEqual(outcome2, "duplicate-equivalent")
        self.assertEqual(produced1, produced2,
                         "replay must return the original ledger refs, not re-act")
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"SELECT count(*) FROM {self.schema_name}.ticket "
                f"WHERE workflow_ref='zz-c3' AND role='reviewer'"
            )
            self.assertEqual(cur.fetchone()[0], 1, "replay must not spawn a second reviewer ticket")

    def test_fanout_different_policy_version_distinct(self):
        rid = self._seed_receipt("rec-f-3")
        spec = [{"workflow_ref": "zz-c3", "role": "reviewer", "position": 2}]
        o1, _ = self.adapter.apply_fanout(
            self._raw_conn, input_receipt_id=rid, kind="implementation",
            spawn_specs=spec, fan_out_policy_version=1,
        )
        # Policy v2 is a DISTINCT ledger entry (R4), but the ticket layer
        # still dedupes on its own idempotency key — no second reviewer
        # ticket appears; the re-fanout is a no-op that references the
        # duplicate-equivalent ticket.
        o2, _ = self.adapter.apply_fanout(
            self._raw_conn, input_receipt_id=rid, kind="implementation",
            spawn_specs=spec, fan_out_policy_version=2,
        )
        self.assertEqual(o1, "spawned")
        self.assertEqual(o2, "no-op")
        with self._raw_conn.cursor() as cur:
            cur.execute(f"SELECT count(*) FROM {self.schema_name}.fanout_transition")
            self.assertEqual(cur.fetchone()[0], 2, "distinct policy versions = distinct ledger rows")
            cur.execute(
                f"SELECT count(*) FROM {self.schema_name}.ticket "
                f"WHERE workflow_ref='zz-c3' AND role='reviewer'"
            )
            self.assertEqual(cur.fetchone()[0], 1)


class TestShadowSeam(unittest.TestCase):
    """C3 staging: shadow default OFF; ON → best-effort, legacy-safe."""

    def test_default_off(self):
        self.assertFalse(lilac.shadow_write_enabled())

    def test_shadow_gated_off_writes_nothing(self):
        os.environ.pop("CONDUIT_LILAC_SHADOW", None)

        class _FakeDB:
            called = False

            def _get_connection(self):
                _FakeDB.called = True
                raise AssertionError("shadow must not open a connection when OFF")

        lilac.shadow_record_receipt(_FakeDB(), "resolution", {
            "kind": "implementation", "source_receipt_id": "rec-x",
            "payload": {},
        })
        self.assertFalse(_FakeDB.called)

    def test_shadow_on_attempts_write_and_swallows_errors(self):
        """ON: shadow opens a connection, attempts the record, and any
        failure is swallowed (legacy path stays authoritative)."""
        os.environ["CONDUIT_LILAC_SHADOW"] = "1"
        self.addCleanup(os.environ.pop, "CONDUIT_LILAC_SHADOW", None)

        class _BrokenConn:
            def cursor(self):
                raise RuntimeError("no canonical schema in hermetic env")

        class _FakeDB:
            opened = False

            def _get_connection(self):
                _FakeDB.opened = True
                import contextlib

                @contextlib.contextmanager
                def _cm():
                    yield _BrokenConn()

                return _cm()

        # Must not raise even though the write cannot succeed.
        lilac.shadow_record_receipt(_FakeDB(), "resolution", {
            "kind": "implementation", "source_receipt_id": "rec-y",
            "payload": {},
        })
        self.assertTrue(_FakeDB.opened, "shadow ON must attempt the canonical write")


if __name__ == "__main__":
    unittest.main()
