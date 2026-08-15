"""
T26 Item B conformance: WR birth persists + dedups entity_key.

Guards the T07 emission-boundary dedup: every WR born through the conduit
write paths (``db_adapter.add_work_request`` and the cascade admission
``ensure_nebula_work_request``) carries its deterministic entity_key from
birth, and re-emitting the same WR reuses the existing row instead of
inserting a duplicate (idempotent emission) — backed by the 045 btree_gist
exclusion constraint.

DoD (T26 Item B):
  - WR birth persists + dedups entity_key
  - double-submit test green: same intent twice → one WR / one entity_key /
    no duplicate row

DB-backed: requires the live local PostgreSQL (CONDUIT_PG_DSN). Skips when
unreachable. Self-cleaning (deletes the synthetic rows it inserts).

Usage:
    cd /home/codex/dev/nexus/python
    CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \\
        python3 -m pytest conduit/tests/test_work_request_entity_key.py -v
"""

import json
import os
import sys
import unittest
import uuid as uuid_mod

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))  # python/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))        # conduit/

from nexus_core.wrp.identity import emit_identity  # noqa: E402


def _dsn() -> str:
    return os.environ.get(
        "CONDUIT_PG_DSN",
        "host=localhost port=5432 user=pguser password=pgpass dbname=nexus",
    )


def _canonical_key(wr_id: str) -> str:
    """The entity_key the WR would receive at birth (canonical emit_identity)."""
    birth = {
        "event_id": wr_id,
        "actor": {"type": "system", "id": "conduit"},
        "intent": {"action": "execute", "target_type": "workrequest",
                   "target_id": f"workrequest:{wr_id}"},
        "domain": "execution",
    }
    return emit_identity(birth)[0]


class TestWorkRequestEntityKeyBirth(unittest.TestCase):
    """DB-backed: WR birth persists + dedups entity_key (double-submit)."""

    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("CONDUIT_PG_DSN", _dsn())
        try:
            import psycopg2
            cls._conn = psycopg2.connect(_dsn())
            cls._conn.autocommit = True
            cls._skip_reason = ""
        except Exception as e:  # noqa: BLE001
            cls._conn = None
            cls._skip_reason = str(e)

    @classmethod
    def tearDownClass(cls):
        if cls._conn is not None:
            cls._conn.close()

    def setUp(self):
        if self._conn is None:
            self.skipTest(f"PostgreSQL unreachable: {self._skip_reason}")
        self._synthetic_legacy_ids: list[str] = []

    def tearDown(self):
        if self._conn is not None and self._synthetic_legacy_ids:
            with self._conn.cursor() as cur:
                for lid in self._synthetic_legacy_ids:
                    cur.execute(
                        "DELETE FROM nebula.work_requests_history WHERE legacy_id = %s",
                        (lid,),
                    )

    @staticmethod
    def _make_dco_json(wr_id: str) -> str:
        return json.dumps({
            "id": wr_id,
            "intent": {"problem_statement": "T26 double-submit test",
                       "desired_outcome": "one row"},
        })

    def test_add_work_request_persists_and_dedups(self):
        from db_adapter import DBAdapter, derive_wr_entity_key

        db = DBAdapter("")
        wr_id = f"wr-t26-{uuid_mod.uuid4().hex[:12]}"
        self._synthetic_legacy_ids.append(wr_id)
        dco_json = self._make_dco_json(wr_id)

        expected = _canonical_key(wr_id)
        self.assertEqual(
            derive_wr_entity_key(dco_json, wr_id), expected,
            "derivation must equal the canonical emit_identity key")

        # First submit: inserts with entity_key. Second submit (same intent):
        # must NOT insert a duplicate row.
        db.add_work_request(wr_id, None, dco_json, title="T26 double-submit")
        db.add_work_request(wr_id, None, dco_json, title="T26 double-submit")

        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT count(*), count(entity_key) "
                "FROM nebula.work_requests_history WHERE legacy_id = %s",
                (wr_id,),
            )
            total, non_null = cur.fetchone()
            cur.execute(
                "SELECT entity_key FROM nebula.work_requests_history "
                "WHERE legacy_id = %s",
                (wr_id,),
            )
            keys = [r[0] for r in cur.fetchall()]

        self.assertEqual(total, 1, "double-submit must not create a duplicate row")
        self.assertEqual(non_null, 1, "entity_key must be persisted at birth")
        self.assertEqual(keys, [expected], "persisted entity_key must equal the canonical key")

    def test_ensure_nebula_work_request_persists_and_dedups(self):
        import cascade.admission_subscriber as sub

        wr_id = f"wr-t26-cascade-{uuid_mod.uuid4().hex[:12]}"
        self._synthetic_legacy_ids.append(wr_id)
        wr_uuid = str(uuid_mod.uuid4())
        dco_json = self._make_dco_json(wr_id)
        expected = _canonical_key(wr_id)

        first = sub.ensure_nebula_work_request(
            self._conn, wr_uuid, wr_id, "t", dco_json, None)
        second = sub.ensure_nebula_work_request(
            self._conn, wr_uuid, wr_id, "t", dco_json, None)

        self.assertEqual(first, second, "re-emission must reuse the same row id")

        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM nebula.work_requests_history "
                "WHERE legacy_id = %s",
                (wr_id,),
            )
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT entity_key FROM nebula.work_requests_history "
                "WHERE legacy_id = %s",
                (wr_id,),
            )
            keys = [r[0] for r in cur.fetchall()]

        self.assertEqual(total, 1, "double-submit must not create a duplicate row")
        self.assertEqual(keys, [expected], "persisted entity_key must equal the canonical key")

    def test_exclusion_constraint_rejects_overlapping_entity_key(self):
        """B.4 violation path: the 045 gist constraint rejects an overlapping
        insert (same entity_key, overlapping validity) — DB = \"can't happen\"."""
        import psycopg2

        key = _canonical_key(f"wr-t26-violation-{uuid_mod.uuid4().hex[:8]}")
        lid_a = f"wr-t26-viol-a-{uuid_mod.uuid4().hex[:8]}"
        lid_b = f"wr-t26-viol-b-{uuid_mod.uuid4().hex[:8]}"
        self._synthetic_legacy_ids.extend([lid_a, lid_b])

        with self._conn.cursor() as cur:
            # First row: the legitimate birth.
            cur.execute(
                "INSERT INTO nebula.work_requests_history "
                "(id, legacy_id, title, business_status, entity_key) "
                "VALUES (%s::uuid, %s, 'viol-a', 'DRAFT', %s)",
                (str(uuid_mod.uuid4()), lid_a, key),
            )
            # Second row: same entity_key, overlapping (default now()/sentinel)
            # validity — must be rejected by the exclusion constraint.
            with self.assertRaises(psycopg2.IntegrityError):
                cur.execute(
                    "INSERT INTO nebula.work_requests_history "
                    "(id, legacy_id, title, business_status, entity_key) "
                    "VALUES (%s::uuid, %s, 'viol-b', 'DRAFT', %s)",
                    (str(uuid_mod.uuid4()), lid_b, key),
                )


if __name__ == "__main__":
    unittest.main()
