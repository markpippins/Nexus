"""Hermetic V146 tests: three-signatory C6 retirement gate (plan 8261639).

Throwaway canonical schema (V139+V141+V146 reschema'd — vision.* literals
reschema'd so the gate's legacy probes see throwaway minimal surfaces, never
the shared live vision tables). Never touches resolution.*/vision.* live.

Binding regression surfaces (architect ruling on DBA record 9872f297):

- Gate FALSE with dba missing even when operator+architect present
  (the pre-V146 gate would have read satisfied with exactly these 2 rows).
- A present dba row IS counted (binding_signoffs=3 → satisfied, all other
  conditions seeded).
- Non-signatory roles (e.g. 'engineer', admitted by the table CHECK) are
  never counted — the IN-list is the discipline.
- Function definition guard: the deployed body keys on the three-role IN-list
  and requires exactly 3 (regression against accidental reversion to V141).
- Composition: under V146, V144 refuses (P1000) with 2 signoffs and applies
  cleanly with 3 — the amendment flows through the Stage D self-gate.

Run:
  CONDUIT_PG_DSN='host=localhost port=5432 user=pguser password=pgpass dbname=nexus' \
      python3 -m pytest conduit/tests/test_v146_three_signatory_gate.py -v
"""
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
_V146_SQL = os.path.join(_SQL_DIR, "V146__lilac_c6_gate_three_signatory.sql")


def _apply_reschema(conn, sql_path: str, schema: str, extra_prefixes=()) -> None:
    with open(sql_path) as f:
        raw = f.read()
    sql = raw.replace("resolution.", f"{schema}.")
    for prefix in extra_prefixes:
        sql = sql.replace(prefix, f"{schema}.")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


class V146ThreeSignatoryGateTest(unittest.TestCase):
    """The amended c6_retirement_gate: operator + architect + dba, = 3."""

    def setUp(self):
        self._raw = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw, "test_v146_gate")
            # V139: canonical infra (gate probe 1 needs the 4 tables).
            _apply_reschema(self._raw, _V139_SQL, self.canon)
            # V141 reschema'd INCLUDING vision.* literals: the gate's legacy
            # probes must see the throwaway minimal surfaces created below.
            _apply_reschema(self._raw, _V141_SQL, self.canon,
                            extra_prefixes=("vision.",))
            # V146: the amendment under test (also reschema'd — its body
            # carries the same vision.* literals it amends).
            _apply_reschema(self._raw, _V146_SQL, self.canon,
                            extra_prefixes=("vision.",))
            # Minimal legacy surfaces (empty = conditions 2 and 3 pass).
            with self._raw.cursor() as cur:
                cur.execute(f"CREATE TABLE {self.canon}.receipts"
                            f" (id text PRIMARY KEY, type text)")
                cur.execute(f"CREATE TABLE {self.canon}.tickets"
                            f" (id text PRIMARY KEY, status text, plan_id text)")
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

    def _gate(self):
        with self._raw.cursor() as cur:
            cur.execute(f"SELECT {self.canon}.c6_retirement_gate()")
            row = cur.fetchone()
        self._raw.commit()
        return row[0]

    def _seed(self, roles, green_days=0):
        with self._raw.cursor() as cur:
            for i in range(green_days):
                cur.execute(
                    f"""INSERT INTO {self.canon}.soak_evidence
                           (evidence_date, report, green, recorded_by)
                        VALUES (CURRENT_DATE - %s, '{{}}'::jsonb, true, 'test')""",
                    (i,))
            for role in roles:
                cur.execute(
                    f"""INSERT INTO {self.canon}.retirement_signoff
                           (role, signoff, signed_by)
                        VALUES (%s, 'approved', %s)""",
                    (role, role))
        self._raw.commit()

    def test_gate_false_with_dba_missing(self):
        """Binding regression: operator+architect alone no longer satisfies.

        Under V141 this exact state read satisfied=true; V146 must read
        binding_signoffs=2 and satisfied=false — a dba row cannot be inert
        because the rule now requires it.
        """
        self._seed(["operator", "architect"], green_days=7)
        gate = self._gate()
        self.assertEqual(gate["binding_signoffs"], 2)
        self.assertFalse(gate["satisfied"])

    def test_gate_counts_present_dba_row(self):
        """A dba row written at verification time advances the gate to 3/3."""
        self._seed(["operator", "architect", "dba"], green_days=7)
        gate = self._gate()
        self.assertEqual(gate["binding_signoffs"], 3)
        self.assertTrue(gate["satisfied"])

    def test_gate_never_counts_non_signatory_roles(self):
        """'engineer' is admitted by the table CHECK but is not a signatory.

        The IN-list is the discipline: padding with a non-signatory row must
        not substitute for the dba signature.
        """
        self._seed(["operator", "architect", "engineer"], green_days=7)
        gate = self._gate()
        self.assertEqual(gate["binding_signoffs"], 2)
        self.assertFalse(gate["satisfied"])

    def test_function_definition_keys_on_three_roles(self):
        """Definitional guard: the deployed body is the V146 amendment.

        Guards against accidental reversion to the V141 definition (e.g. a
        re-applied V141 silently restoring the 2-signatory rule — CREATE OR
        REPLACE means last-writer-wins).
        """
        with self._raw.cursor() as cur:
            cur.execute(
                "SELECT pg_get_functiondef(%s::regprocedure)",
                (f"{self.canon}.c6_retirement_gate()",))
            body = cur.fetchone()[0]
        self._raw.commit()
        self.assertIn("'operator','architect','dba'", body)
        self.assertIn("v_signoffs = 3", body)
        self.assertNotIn("v_signoffs = 2", body)
        self.assertIn("three-signatory", body)  # comment landed too


class V144UnderV146CompositionTest(unittest.TestCase):
    """The amendment flows through the Stage D self-gate unchanged."""

    def setUp(self):
        self._raw = psycopg2.connect(_DSN)
        try:
            self.canon = create_test_schema(self._raw, "test_v146_v144")
            _apply_reschema(self._raw, _V139_SQL, self.canon)
            _apply_reschema(self._raw, _V141_SQL, self.canon,
                            extra_prefixes=("vision.",))
            _apply_reschema(self._raw, _V146_SQL, self.canon,
                            extra_prefixes=("vision.",))
            with self._raw.cursor() as cur:
                cur.execute(f"CREATE TABLE {self.canon}.receipts"
                            f" (id text PRIMARY KEY, type text)")
                cur.execute(f"CREATE TABLE {self.canon}.tickets"
                            f" (id text PRIMARY KEY, status text, plan_id text)")
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

    def _seed(self, roles):
        with self._raw.cursor() as cur:
            for i in range(7):
                cur.execute(
                    f"""INSERT INTO {self.canon}.soak_evidence
                           (evidence_date, report, green, recorded_by)
                        VALUES (CURRENT_DATE - %s, '{{}}'::jsonb, true, 'test')""",
                    (i,))
            for role in roles:
                cur.execute(
                    f"""INSERT INTO {self.canon}.retirement_signoff
                           (role, signoff, signed_by)
                        VALUES (%s, 'approved', %s)""",
                    (role, role))
        self._raw.commit()

    def _apply_v144(self):
        _apply_reschema(self._raw, _V144_SQL, self.canon,
                        extra_prefixes=("vision.",))

    def test_v144_refuses_with_two_signoffs(self):
        self._seed(["operator", "architect"])
        with self.assertRaises(psycopg2.Error) as ctx:
            self._apply_v144()
        self.assertEqual(getattr(ctx.exception, "pgcode", None), "P1000",
                         "Stage D must refuse while the dba signature is missing")
        self.assertIn("self-gate FAILED", str(ctx.exception))

    def test_v144_applies_with_three_signoffs(self):
        self._seed(["operator", "architect", "dba"])
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
