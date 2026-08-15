"""
wr-conf-012: pipeline-health drift-flag conformance — the report-only flag
in bin/pipeline-health-sweep.py (QUERY_DRIFT, drift v3, to-do 299fce45) can
never silently regress.

The drift check flags a plan only when ALL THREE hold: latest receipt
PLAN_CREATE >24h AND a builder ticket expired or unclaimed >24h AND external
completion evidence (IMPLEMENTATION/REVIEW_PASS receipts or agent records).
That ANDed contract is what the architect accepted (finding 89d7fbe3 item 4)
and what the sweep's emit_drift_findings() routes on (type:finding records
to:architect + to:watchdog). A hand-edit that weakens the flag to a single
signal (e.g. unclaimed-only, or ticket-only, or evidence-only) silently
re-opens the 1274/1275 drift class without anyone noticing — exactly the
corruption class wr-conf-006 guards for the seed.

This test extracts QUERY_DRIFT from the SOURCE file (the script is the
canonical home — never a copy), re-points its three table references at
pg_temp shadow tables inside the live DB (nothing persists), loads synthetic
fixtures covering every flag branch, and asserts the flag fires exactly when
the ANDed contract holds.

    AC1 — Positive: stuck PLAN_CREATE + expired builder ticket +
          IMPLEMENTATION receipt → drift_flag = t (the acceptance-case combo)
    AC2 — Positive (unclaimed branch): stuck + open unclaimed>24h builder
          ticket + agent-record evidence → drift_flag = t
    AC3 — Negative: stuck + expired ticket but NO evidence → drift_flag = f
    AC4 — Negative: stuck + evidence but NO expired/unclaimed ticket →
          drift_flag = f
    AC5 — Exclusion: recent PLAN_CREATE (not stuck) is absent from results
    AC6 — Structural: the source query still expresses the ANDed
          (unclaimed OR expired) AND evidence form — a revert to a
          single-signal flag is caught even before fixtures run.

The fixtures are self-contained: each test inserts its own rows into the
temp tables, so tests are independent and the live tables are never touched
or read (beyond the schema the temp tables are modelled on).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_drift_flag.py -v
"""

import os
import re
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")

# Repo root = nexus/ (parent of nexus/python).
_REPO_ROOT = os.path.abspath(os.path.join(_NEXUS_PYTHON, ".."))
SWEEP_SOURCE = os.path.join(_REPO_ROOT, "bin", "pipeline-health-sweep.py")


def _query_drift_source():
    """Extract the QUERY_DRIFT constant from the sweep script source.

    Extracting from the file (rather than importing the module, whose name
    contains a hyphen) keeps the tested artifact identical to what the
    production sweep runs, and lets the structural guard (AC6) read it as
    text.
    """
    src = open(SWEEP_SOURCE, encoding="utf-8").read()
    m = re.search(r'QUERY_DRIFT = """(.*?)"""\n', src, re.S)
    if not m:
        raise AssertionError(f"QUERY_DRIFT constant not found in {SWEEP_SOURCE}")
    return m.group(1)


def _shadow_query(query):
    """Re-point the three live tables at pg_temp shadow tables.

    Plain string replacement over the whole query, mirroring the seed-guard
    shadow technique. The query references each table by its fully qualified
    name, so the replacement is unambiguous.
    """
    return (
        query
        .replace("vision.receipts", "pg_temp.receipts")
        .replace("vision.tickets", "pg_temp.tickets")
        .replace("nebula.agent_records", "pg_temp.agent_records")
    )


def _db():
    import psycopg2
    return psycopg2.connect(DSN)


# Columns the query actually references, modelled as minimal temp tables.
_CREATE_RECEIPTS = (
    "CREATE TEMP TABLE receipts ("
    " plan_id TEXT, type TEXT, created_at TIMESTAMPTZ)"
)
_CREATE_TICKETS = (
    "CREATE TEMP TABLE tickets ("
    " plan_id TEXT, role TEXT, status TEXT, claimed_at TIMESTAMPTZ,"
    " created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)"
)
_CREATE_RECORDS = (
    "CREATE TEMP TABLE agent_records ("
    " plan_ref TEXT, content TEXT, record_type TEXT, title TEXT)"
)


def _run_drift(query, receipts=(), tickets=(), records=()):
    """Load fixtures into temp tables, run the shadowed query, return rows.

    Each row is a tuple in the query's SELECT order:
      (plan_id, last_plan_create, expired_tickets, cancelled_tickets,
       evidence_rows, unclaimed_24h, drift_flag)
    """
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(_CREATE_RECEIPTS)
        cur.execute(_CREATE_TICKETS)
        cur.execute(_CREATE_RECORDS)
        for row in receipts:
            cur.execute(
                "INSERT INTO pg_temp.receipts (plan_id, type, created_at) VALUES (%s,%s,%s)",
                row,
            )
        for row in tickets:
            cur.execute(
                "INSERT INTO pg_temp.tickets (plan_id, role, status, claimed_at, created_at, expires_at)"
                " VALUES (%s,%s,%s,%s,%s,%s)",
                row,
            )
        for row in records:
            cur.execute(
                "INSERT INTO pg_temp.agent_records (plan_ref, content, record_type, title)"
                " VALUES (%s,%s,%s,%s)",
                row,
            )
        conn.commit()
        cur.execute(_shadow_query(query))
        rows = cur.fetchall()
        conn.commit()
        return rows
    finally:
        conn.close()


def _hours_ago(hours):
    import datetime
    return datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)


def _by_plan(rows):
    return {r[0]: r for r in rows}


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — Positive: stuck + expired ticket + IMPLEMENTATION receipt → flag
# ═══════════════════════════════════════════════════════════════════════

class TestAc1ExpiredTicketPositive(unittest.TestCase):
    """The acceptance-case combo (stuck + expired builder ticket + receipt
    evidence) must flag — the 1274/1275 class of drift."""

    def test_stuck_expired_ticket_plus_receipt_flags(self):
        """Latest receipt PLAN_CREATE >24h, but an OLDER IMPLEMENTATION
        receipt (work done outside the pipeline) is the external evidence."""
        rows = _run_drift(
            _query_drift_source(),
            receipts=[
                ("9001", "IMPLEMENTATION", _hours_ago(48)),  # older — evidence
                ("9001", "PLAN_CREATE", _hours_ago(30)),  # latest → stuck
            ],
            tickets=[
                ("9001", "builder", "expired", None, _hours_ago(40), _hours_ago(30)),
            ],
            records=[],
        )
        by = _by_plan(rows)
        self.assertIn("9001", by, "stuck+expired+evidence plan must appear in drift")
        self.assertEqual(by["9001"][6], True, "drift_flag must be true for the acceptance combo")
        self.assertGreaterEqual(by["9001"][2], 1, "expired ticket must be counted")
        self.assertGreaterEqual(by["9001"][4], 1, "IMPLEMENTATION receipt must count as evidence")


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — Positive (unclaimed branch): open unclaimed>24h ticket flags too
# ═══════════════════════════════════════════════════════════════════════

class TestAc2UnclaimedBranch(unittest.TestCase):
    """The unclaimed-ticket branch (open, never claimed, >24h old) must also
    flag — the to-do's wording was 'expired builder ticket (>24h unclaimed)'."""

    def test_stuck_unclaimed_open_ticket_plus_record_evidence_flags(self):
        rows = _run_drift(
            _query_drift_source(),
            receipts=[("9002", "PLAN_CREATE", _hours_ago(30))],
            tickets=[
                ("9002", "builder", "open", None, _hours_ago(36), None),
            ],
            records=[
                ("9002", "plan 9002 implemented outside the pipeline", "report",
                 "Verification: plan 9002 complete"),
            ],
        )
        by = _by_plan(rows)
        self.assertIn("9002", by, "stuck+unclaimed+record-evidence plan must appear")
        self.assertEqual(by["9002"][6], True, "drift_flag must be true via unclaimed branch")
        self.assertGreaterEqual(by["9002"][5], 1, "unclaimed_24h must be counted")
        self.assertGreaterEqual(by["9002"][4], 1, "agent-record evidence must count")

    def test_expired_and_unclaimed_both_satisfy_the_flag(self):
        """A plan with BOTH an expired ticket and a separate unclaimed one
        still flags (the OR branch), with both counters populated."""
        rows = _run_drift(
            _query_drift_source(),
            receipts=[("9003", "PLAN_CREATE", _hours_ago(30))],
            tickets=[
                ("9003", "builder", "expired", None, _hours_ago(40), _hours_ago(28)),
                ("9003", "builder", "open", None, _hours_ago(36), None),
            ],
            records=[("9003", "done", "inspection", "verification inspection")],
        )
        by = _by_plan(rows)
        self.assertEqual(by["9003"][6], True)
        self.assertGreaterEqual(by["9003"][2], 1, "expired count")
        self.assertGreaterEqual(by["9003"][5], 1, "unclaimed count")


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — Negative: stuck + ticket but NO external evidence → no flag
# ═══════════════════════════════════════════════════════════════════════

class TestAc3NoEvidenceNoFlag(unittest.TestCase):
    """Stuck with an expired ticket but zero external completion evidence is
    an *abandoned* plan (close via CANCELLED), not an implemented-but-pending
    one — it must NOT flag."""

    def test_stuck_expired_ticket_without_evidence_does_not_flag(self):
        rows = _run_drift(
            _query_drift_source(),
            receipts=[("9004", "PLAN_CREATE", _hours_ago(30))],
            tickets=[
                ("9004", "builder", "expired", None, _hours_ago(40), _hours_ago(28)),
            ],
            records=[],
        )
        by = _by_plan(rows)
        self.assertIn("9004", by, "stuck plan still surfaces in drift (report-only)")
        self.assertEqual(by["9004"][6], False,
                         "no external evidence ⇒ no flag (abandoned, not implemented)")


# ═══════════════════════════════════════════════════════════════════════
#  AC4 — Negative: stuck + evidence but NO expired/unclaimed ticket → no flag
# ═══════════════════════════════════════════════════════════════════════

class TestAc4NoTicketNoFlag(unittest.TestCase):
    """Stuck with evidence but a healthy (claimed/active) ticket is NOT the
    drift class — the ticket is still alive, work may be in flight. No flag."""

    def test_stuck_with_evidence_but_no_expired_ticket_does_not_flag(self):
        """Latest is still PLAN_CREATE (stuck) and evidence exists, but the
        builder ticket is CLAIMED and unexpired — work may be in flight."""
        rows = _run_drift(
            _query_drift_source(),
            receipts=[
                ("9005", "IMPLEMENTATION", _hours_ago(48)),  # older — evidence
                ("9005", "PLAN_CREATE", _hours_ago(30)),  # latest → stuck
            ],
            tickets=[
                ("9005", "builder", "claimed", _hours_ago(20), _hours_ago(26),
                 _hours_ago(-2)),  # expires in the future → NOT expired
            ],
            records=[],
        )
        by = _by_plan(rows)
        self.assertIn("9005", by)
        self.assertEqual(by["9005"][6], False,
                         "claimed ticket still alive ⇒ no flag")

    def test_stuck_with_evidence_and_no_ticket_at_all_does_not_flag(self):
        """Latest is PLAN_CREATE (stuck) with REVIEW_PASS evidence but no
        builder ticket at all — not the drift class."""
        rows = _run_drift(
            _query_drift_source(),
            receipts=[
                ("9006", "REVIEW_PASS", _hours_ago(48)),  # older — evidence
                ("9006", "PLAN_CREATE", _hours_ago(30)),  # latest → stuck
            ],
            tickets=[],
            records=[],
        )
        by = _by_plan(rows)
        self.assertIn("9006", by)
        self.assertEqual(by["9006"][6], False,
                         "no builder ticket at all ⇒ no flag")


# ═══════════════════════════════════════════════════════════════════════
#  AC5 — Exclusion: recent PLAN_CREATE is not stuck → absent from results
# ═══════════════════════════════════════════════════════════════════════

class TestAc5NotStuckExcluded(unittest.TestCase):
    """A plan whose latest receipt is a *recent* PLAN_CREATE (or any non-
    PLAN_CREATE terminal receipt) is not stuck — it must not appear at all."""

    def test_recent_plan_create_absent(self):
        rows = _run_drift(
            _query_drift_source(),
            receipts=[("9007", "PLAN_CREATE", _hours_ago(2))],
            tickets=[],
            records=[],
        )
        self.assertNotIn("9007", _by_plan(rows),
                         "recent PLAN_CREATE is not stuck — must be excluded")

    def test_terminal_plan_absent(self):
        """1274/1275 closed properly: latest receipt REVIEW_PASS → not stuck."""
        rows = _run_drift(
            _query_drift_source(),
            receipts=[
                ("9008", "PLAN_CREATE", _hours_ago(72)),
                ("9008", "IMPLEMENTATION", _hours_ago(48)),
                ("9008", "REVIEW_PASS", _hours_ago(24)),
            ],
            tickets=[("9008", "builder", "expired", None, _hours_ago(70), _hours_ago(50))],
            records=[],
        )
        self.assertNotIn("9008", _by_plan(rows),
                         "terminal REVIEW_PASS overrides PLAN_CREATE — must be excluded")


# ═══════════════════════════════════════════════════════════════════════
#  AC6 — Structural: the source still expresses the ANDed flag contract
# ═══════════════════════════════════════════════════════════════════════

class TestAc6StructuralContract(unittest.TestCase):
    """Static probes on the source query encoding the ANDed flag semantics —
    a revert to a single-signal flag (the pre-fix bug where abandoned tickets
    live as status='expired' and unclaimed-only never fired) is caught here
    even before fixtures run."""

    def test_drift_flag_requires_both_ticket_signal_and_evidence(self):
        q = _query_drift_source()
        # The flag must OR the two ticket signals…
        self.assertIn("COALESCE(t.unclaimed_24h,0) > 0 OR COALESCE(t.expired,0) > 0", q,
                      "flag must consider BOTH unclaimed>24h AND expired tickets")
        # …and AND them with external evidence.
        self.assertIn("AND (COALESCE(ev.n,0) + COALESCE(re.n,0)) > 0", q,
                      "flag must require external completion evidence")
        self.assertIn("AS drift_flag", q, "drift_flag column must be computed")

    def test_query_references_all_three_tables(self):
        q = _query_drift_source()
        for ref in ("vision.receipts", "vision.tickets", "nebula.agent_records"):
            self.assertIn(ref, q, f"drift query must read {ref}")

    def test_shadow_query_repoints_all_three_tables(self):
        q = _shadow_query(_query_drift_source())
        for live, shadow in (("vision.receipts", "pg_temp.receipts"),
                             ("vision.tickets", "pg_temp.tickets"),
                             ("nebula.agent_records", "pg_temp.agent_records")):
            self.assertIn(shadow, q, f"shadow query must reference {shadow}")
            self.assertNotIn(live, q, f"live table {live} must be fully re-pointed")

    def test_evidence_excludes_noise_titles(self):
        """The evidence scan still excludes the documented noise classes, so
        the sweep's own drift-finding records (titles containing 'drift') can
        never self-qualify as completion evidence."""
        q = _query_drift_source()
        for pat in ("%drift%", "%ghost%", "%pre-fk-snapshot%"):
            self.assertIn(pat, q, f"noise exclusion {pat} must remain in the evidence scan")


if __name__ == "__main__":
    unittest.main()
