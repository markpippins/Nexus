"""Hermetic C3 cutover-prep test: drift-fixture parity (plan 8261639).

Applies the V139 DDL into a THROWAWAY schema (repo convention, zero live
contact) and exercises the golden fixture and the three-layer parity
checker in lilac_drift.py:

- Fixture pin: fixture_fingerprint() is pinned at the value ratified with
  contract v1 — any transformation change fails here and forces an
  explicit contract discussion.
- Layer 1 (fixture vs adapter code): lilac.py mapping must equal the
  fixture; mutations of either side are detected.
- Layer 2 (fixture vs DB registry): producer seeds, grants, version
  ranges, grant trigger; wrong-kind grant / missing seed / drifted
  version range are all detected.
- Layer 3 (legacy vs canonical): parity_row classification — parity,
  missing_twin, kind_drift, payload_drift, unmapped_type — including the
  shadow-seam parity of the payload contract.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_c3_drift_fixture_parity.py -v
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
import lilac_drift  # noqa: E402

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

GOLDEN_FIXTURE_FINGERPRINT = "5ed75c1b49a43c62a08aceac661e1dc65ba0e53ee66c1a72fae53ad989a4ae45"
# Recomputed after the producer-parity correction (python-direct declares
# nexus-conduit-python, registered in V142; shadow stamps the declaring
# producer). Run: python3 -c "import lilac_drift; print(lilac_drift.fixture_fingerprint())"


def _apply_v139(conn, schema: str) -> None:
    """Apply the V139 DDL inside the throwaway schema (rewrite qualification)."""
    with open(_V139_SQL) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.").replace("$resolution$", f"${schema}$")
    with conn.cursor() as cur:
        cur.execute(sql)
    # V142 seed parity (nexus-conduit-python) so layer-2 matches production.
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {schema}.producer_registry "
            f"(producer_id, name, allowed_kinds, contract_version_min, "
            f" contract_version_max, registered_by) "
            f"VALUES ('nexus-conduit-python', 'Conduit Python kernel (test seed)', "
            f" ARRAY['plan_create','planning','implementation','review','review_pass',"
            f"         'review_reject','critique','critique_pass','critique_reject','block',"
            f"         'hold','ccnf_execution','requeued','api_limit','abandoned',"
            f"         'cancelled','plan_block'], 1, 1, 'test-seed') "
            f"ON CONFLICT (producer_id) DO NOTHING"
        )
    conn.commit()


class DriftFixtureBase(unittest.TestCase):
    """Throwaway schema with V139 applied per test."""

    def setUp(self):
        self._raw_conn = psycopg2.connect(_DSN)
        try:
            self.schema_name = create_test_schema(self._raw_conn, "test_c3_drift")
            _apply_v139(self._raw_conn, self.schema_name)
        except Exception:
            drop_test_schema(_DSN, self.schema_name)
            self._raw_conn.close()
            raise
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

    # ── helpers ──────────────────────────────────────────────────────
    def _canonical_twin(self, legacy_id: str, kind: str,
                        payload: dict, contract_version: int = 1):
        """Insert a canonical twin exactly as the shadow seam would."""
        self._raw_conn.cursor().execute(
            f"INSERT INTO {self.schema_name}.receipt "
            f"(producer_id, kind, source_system, source_receipt_id, "
            f" payload_fingerprint, payload, refs, contract_version) "
            f"VALUES ('conduit-mcp', %s, 'conduit', %s, 'fp', %s, %s, %s)",
            (kind, legacy_id, json.dumps(payload), "{}", contract_version),
        )
        self._raw_conn.commit()

    def _twin_payload(self, legacy: dict, **over):
        """Payload exactly as the shadow seam writes it (adapter contract)."""
        payload = {f: legacy[f] for f in lilac_drift.PAYLOAD_IDENTITY_FIELDS
                   if f in legacy}
        payload["receipt_type"] = legacy["type"]
        payload.update(over)
        return payload

    def _legacy_row(self, legacy_id: str = "rec-x-1", rtype: str = "PLANNING",
                    **over):
        row = {"id": legacy_id, "type": rtype, "plan_id": "zz-drift",
               "agent_role": "engineer", "session_id": "sess-1",
               "ticket_id": "", "summary": "row", "tokens_used": 0}
        row.update(over)
        return row


class TestFixturePin(DriftFixtureBase):
    """The fixture IS contract — pinned at the ratified transformation."""

    def test_fingerprint_pinned(self):
        self.assertNotEqual(GOLDEN_FIXTURE_FINGERPRINT, "<recompute>",
                            "pin the recomputed golden fingerprint before commit")
        self.assertEqual(lilac_drift.fixture_fingerprint(),
                         GOLDEN_FIXTURE_FINGERPRINT)

    def test_unmapped_legacy_type_documented(self):
        # PROPOSED exists in the legacy type check but has no canonical kind.
        self.assertIn("PROPOSED", lilac_drift.UNMAPPED_LEGACY_TYPES)
        self.assertNotIn("PROPOSED", lilac_drift.KIND_BY_TYPE)
        self.assertNotIn("PROPOSED", lilac.RECEIPT_KIND_BY_TYPE)


class TestLayer1AdapterConsistency(DriftFixtureBase):
    """Fixture vs merged adapter code (lilac.py)."""

    def test_merged_adapter_matches_fixture(self):
        self.assertEqual(lilac_drift.check_adapter_consistency(lilac), [])

    def test_detects_kind_map_mutation(self):
        original = dict(lilac.RECEIPT_KIND_BY_TYPE)
        try:
            lilac.RECEIPT_KIND_BY_TYPE = dict(original, PLANNING="sneaky")
            drift = lilac_drift.check_adapter_consistency(lilac)
            self.assertTrue(any("KIND_BY_TYPE" in d for d in drift))
        finally:
            lilac.RECEIPT_KIND_BY_TYPE = original

    def test_detects_contract_version_mutation(self):
        original = lilac.LILAC_CONTRACT_VERSION
        try:
            lilac.LILAC_CONTRACT_VERSION = 2
            drift = lilac_drift.check_adapter_consistency(lilac)
            self.assertTrue(any("contract_version" in d for d in drift))
        finally:
            lilac.LILAC_CONTRACT_VERSION = original


class TestLayer2DbRegistry(DriftFixtureBase):
    """Fixture vs the live producer registry / trigger."""

    def test_seeded_registry_matches_fixture(self):
        drift = lilac_drift.check_db_registry(self._raw_conn.cursor(),
                                              self.schema_name)
        self.assertEqual(drift, [])

    def test_detects_wrong_kind_grant(self):
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"UPDATE {self.schema_name}.producer_registry "
                f"SET allowed_kinds = allowed_kinds || '{{admission}}' "
                f"WHERE producer_id = 'conduit-mcp'")
        self._raw_conn.commit()
        drift = lilac_drift.check_db_registry(self._raw_conn.cursor(),
                                              self.schema_name)
        self.assertTrue(any("conduit-mcp allowed_kinds" in d for d in drift))

    def test_detects_missing_producer_seed(self):
        with self._raw_conn.cursor() as cur:
            cur.execute(f"DELETE FROM {self.schema_name}.producer_registry "
                        f"WHERE producer_id = 'peb-srv'")
        self._raw_conn.commit()
        drift = lilac_drift.check_db_registry(self._raw_conn.cursor(),
                                              self.schema_name)
        self.assertTrue(any("peb-srv" in d for d in drift))

    def test_detects_version_range_drift(self):
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"UPDATE {self.schema_name}.producer_registry "
                f"SET contract_version_max = 2 "
                f"WHERE producer_id = 'nexus-execution-worker'")
        self._raw_conn.commit()
        drift = lilac_drift.check_db_registry(self._raw_conn.cursor(),
                                              self.schema_name)
        self.assertTrue(any("version range" in d for d in drift))


class TestLayer3Parity(DriftFixtureBase):
    """Legacy rows vs canonical twins — the classification contract."""

    def test_parity_when_twin_matches(self):
        legacy = self._legacy_row()
        self._canonical_twin(legacy["id"], "planning",
                             self._twin_payload(legacy))
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name, legacy)
        self.assertEqual(result["class"], "parity")

    def test_missing_twin(self):
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name,
                                        self._legacy_row())
        self.assertEqual(result["class"], "missing_twin")
        self.assertEqual(result["expected_kind"], "planning")

    def test_kind_drift(self):
        legacy = self._legacy_row()
        self._canonical_twin(legacy["id"], "implementation",
                             self._twin_payload(legacy))
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name, legacy)
        self.assertEqual(result["class"], "kind_drift")
        self.assertEqual(result["expected_kind"], "planning")
        self.assertEqual(result["actual_kind"], "implementation")

    def test_payload_drift(self):
        legacy = self._legacy_row(summary="row")
        payload = self._twin_payload(legacy, summary="REWRITTEN UNDER DRIFT")
        self._canonical_twin(legacy["id"], "planning", payload)
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name, legacy)
        self.assertEqual(result["class"], "payload_drift")
        self.assertIn("summary", result["fields"])

    def test_payload_drift_on_contract_version(self):
        legacy = self._legacy_row()
        # Simulate a premature v2 roll-out: widen the producer range in the
        # throwaway registry so the v2 twin can exist, then verify the
        # checker flags it against the v1 fixture. (The grant trigger
        # otherwise refuses v2 rows outright — the contract working.)
        with self._raw_conn.cursor() as cur:
            cur.execute(
                f"UPDATE {self.schema_name}.producer_registry "
                f"SET contract_version_max = 2 "
                f"WHERE producer_id = 'conduit-mcp'")
        self._raw_conn.commit()
        self._canonical_twin(legacy["id"], "planning",
                             self._twin_payload(legacy), contract_version=2)
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name, legacy)
        self.assertEqual(result["class"], "payload_drift")
        self.assertIn("contract_version", result["fields"])

    def test_unmapped_type_is_not_drift(self):
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name,
                                        self._legacy_row(rtype="PROPOSED"))
        self.assertEqual(result["class"], "unmapped_type")

    def test_unknown_type_is_not_drift(self):
        result = lilac_drift.parity_row(self._raw_conn, self.schema_name,
                                        self._legacy_row(rtype="SOMETHING_NEW"))
        self.assertEqual(result["class"], "unmapped_type")


if __name__ == "__main__":
    unittest.main()
