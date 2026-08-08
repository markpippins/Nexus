"""E2E pipeline test: proposed -> planning -> PLAN_CREATE -> scheduler dispatches builder/critic.

Verifies the full pipeline lifecycle from receipt issuance through derived status
derivation, ticket spawning, role eligibility, and the complete _dispatch_one flow
with a fake executor. Follows conventions from test_lifecycle.py and
test_dispatch_integration.py.
"""

import json
import os
import sys
import unittest
from datetime import datetime

import psycopg2

from tests.test_helpers import (
    cleanup_orphaned_test_schemas,
    create_test_schema,
    drop_test_schema,
)

# ── Set env vars BEFORE importing main (which reads them at module load) ──
os.environ["PIPELINE_LOCK_PATH"] = "/tmp/pipeline-e2e-test.lock"
os.environ["PIPELINE_WATCHDOG_STALE"] = "86400"
os.environ["API_LIMIT_RETRY_DELAY"] = "1"
os.environ["API_LIMIT_MAX_RETRIES"] = "3"
os.environ["PIPELINE_EXECUTOR_TIMEOUT"] = "30"

_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not _DSN:
    raise RuntimeError("CONDUIT_PG_DSN must be set to run tests (PG is mandatory)")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
# _dispatch_one removed — replaced by Temporal PlanExecutionWorkflow
from db_adapter import DBAdapter

# Clean up any orphaned test schemas from previous crashed runs
_ORPHANED = cleanup_orphaned_test_schemas(_DSN)
if _ORPHANED:
    print(f"Cleaned up {_ORPHANED} orphaned test schema(s) from previous runs",
          file=sys.stderr)


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"



class TestE2EPipeline(unittest.TestCase):
    """Full E2E pipeline from PROPOSED -> PLANNING -> PLAN_CREATE -> dispatch."""

    @classmethod
    def setUpClass(cls):
        pass

    @classmethod
    def tearDownClass(cls):
        pass

    def setUp(self):
        self._raw_conn = psycopg2.connect(_DSN)
        self._raw_cur = self._raw_conn.cursor()

        try:
            self.schema_name = create_test_schema(self._raw_conn, "test_e2e")

            self._create_schema()
            self._seed_plan()
            self._raw_conn.commit()

            self.db = DBAdapter(schema=self.schema_name)
            self._receipt_counter = 0
        except Exception:
            # Clean up the schema if setup fails mid-way
            if hasattr(self, 'schema_name') and self.schema_name:
                drop_test_schema(_DSN, self.schema_name)
            self._raw_cur.close()
            self._raw_conn.close()
            raise

    def tearDown(self):
        lock_path = os.environ.get("PIPELINE_LOCK_PATH", "/tmp/pipeline-e2e-test.lock")
        if os.path.exists(lock_path):
            try:
                os.unlink(lock_path)
            except OSError:
                pass

        # Close the test connection first (releases locks on test schema)
        try:
            self._raw_cur.close()
        except Exception:
            pass
        try:
            self._raw_conn.close()
        except Exception:
            pass

        # Drop the test schema using a fresh connection (avoids lock issues)
        if hasattr(self, 'schema_name') and self.schema_name:
            drop_test_schema(_DSN, self.schema_name)

    def _create_schema(self):
        c = self._raw_cur
        c.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY, file_name TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '', project TEXT NOT NULL DEFAULT '',
                goal TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
                files_affected TEXT NOT NULL DEFAULT '[]',
                acceptance_criteria TEXT NOT NULL DEFAULT '[]',
                dependencies TEXT NOT NULL DEFAULT '[]',
                prompt_ref TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id),
                role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN ('open','claimed','completed','failed',
                        'abandoned','superseded','cancelled','stale','expired')),
                session_id TEXT,
                created_by_receipt TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL, claimed_at TEXT, closed_at TEXT,
                token_budget INTEGER, tokens_used INTEGER,
                objective TEXT, completion_criteria TEXT,
                owner TEXT NOT NULL DEFAULT '',
                parent_ticket_id TEXT REFERENCES tickets(id),
                spawn_reason TEXT, last_activity TEXT, expires_at TEXT,
                confidence REAL, closure_reason TEXT,
                replacement_of TEXT REFERENCES tickets(id)
            )
        """)
        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open
            ON tickets(plan_id, role) WHERE status = 'open'
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id),
                type TEXT NOT NULL CHECK(type IN (
                    'PLAN_CREATE','IMPLEMENTATION','REVIEW_PASS','REVIEW_REJECT','BLOCK',
                    'PROPOSED','PLANNING','REVIEW','CRITIQUE','CRITIQUE_PASS',
                    'CRITIQUE_REJECT','PLAN_BLOCK','API_LIMIT'
                )),
                agent_role TEXT NOT NULL, session_id TEXT,
                artifact_path TEXT, summary TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                ticket_id TEXT REFERENCES tickets(id),
                tokens_used INTEGER DEFAULT 0
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_receipts_plan ON receipts(plan_id, created_at)
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, agent_role TEXT NOT NULL,
                start_iso TEXT NOT NULL, end_iso TEXT, exit_code INTEGER,
                retries_used INTEGER DEFAULT 0,
                plans_processed TEXT NOT NULL DEFAULT '[]',
                plan_count INTEGER DEFAULT 0, pid INTEGER,
                is_running INTEGER DEFAULT 1, last_activity TEXT,
                model TEXT, fallback_used INTEGER DEFAULT 0,
                cost_usd REAL, total_work_seconds REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS circuit_breaker (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
                tripped INTEGER DEFAULT 0, tripped_at TEXT,
                retry_after INTEGER DEFAULT 1800, error TEXT,
                detail TEXT, source TEXT, fallback_model TEXT,
                paused INTEGER DEFAULT 0, updated_at TEXT
            )
        """)
        c.execute(
            "INSERT INTO circuit_breaker (id, tripped, updated_at) "
            "VALUES (1, 0, %s) ON CONFLICT (id) DO NOTHING",
            (_iso_now(),),
        )
        c.execute("""
            CREATE VIEW plan_status AS
            SELECT p.*,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM receipts r
                  WHERE r.plan_id = p.id AND r.type = 'REVIEW_PASS'
                ) THEN 'REVIEW_PASS'
                WHEN EXISTS (
                  SELECT 1 FROM receipts r
                  WHERE r.plan_id = p.id AND r.type = 'REVIEW_REJECT'
                ) THEN COALESCE(
                  (SELECT r.type FROM receipts r
                   WHERE r.plan_id = p.id AND r.type != 'BLOCK'
                   ORDER BY r.created_at DESC LIMIT 1),
                  'PLAN_CREATE'
                )
                ELSE COALESCE(
                  (SELECT r.type FROM receipts r
                   WHERE r.plan_id = p.id
                   AND r.type NOT IN ('PROPOSED', 'PLANNING')
                   ORDER BY r.created_at DESC LIMIT 1),
                  (SELECT r.type FROM receipts r
                   WHERE r.plan_id = p.id
                   ORDER BY r.created_at DESC LIMIT 1),
                  NULL
                )
              END AS derived_status
            FROM plans p WHERE p.deleted = 0
        """)

    def _seed_plan(self):
        now = _iso_now()
        self._raw_cur.execute(
            """INSERT INTO plans (id, file_name, title, project, goal, content,
               files_affected, acceptance_criteria, dependencies, prompt_ref,
               created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            ("0001", "e2e-test-v0001.md", "E2E Pipeline Test",
             "conduit-test", "Verify full pipeline end-to-end",
             "Test the full pipeline flow from proposed to dispatch",
             json.dumps(["src/main.py"]),
             json.dumps(["Feature works", "Tests pass"]),
             json.dumps([]), "", now, now),
        )

    def _issue_receipt(self, receipt_type: str, agent_role: str = "builder") -> str:
        self._receipt_counter += 1
        session = f"sess-e2e-{self._receipt_counter:04d}"
        tid = f"ticket-e2e-{self._receipt_counter:04d}"
        now = _iso_now()
        self._raw_cur.execute(
            "INSERT INTO tickets (id, plan_id, role, status, created_by_receipt, "
            "created_at, objective, owner, last_activity) "
            "VALUES (%s, %s, %s, 'completed', %s, %s, %s, %s, %s) "
            "ON CONFLICT (id) DO NOTHING",
            (tid, "0001", agent_role, "test-e2e", now,
             f"Test {receipt_type}", agent_role, now),
        )
        self._raw_conn.commit()
        self.db.insert_receipt(
            plan_id="0001", receipt_type=receipt_type,
            agent_role=agent_role, session_id=session,
            ticket_id=tid, summary=f"Test {receipt_type}",
        )
        return session

    def _seed_open_ticket(self, role: str) -> str:
        now = _iso_now()
        ticket_id = f"ticket-0001-{role}-e2e"
        self._raw_cur.execute(
            "INSERT INTO tickets "
            "(id, plan_id, role, status, created_by_receipt, created_at, "
            "objective, owner, last_activity) "
            "VALUES (%s, %s, %s, 'open', %s, %s, %s, %s, %s) "
            "ON CONFLICT (id) DO NOTHING",
            (ticket_id, "0001", role, "test-e2e", now,
             "E2E Pipeline Test", role, now),
        )
        self._raw_conn.commit()
        return ticket_id

    def _query(self, sql: str, params=()):
        conn = psycopg2.connect(_DSN)
        cur = conn.cursor()
        cur.execute(f"SET search_path TO {self.schema_name}")
        cur.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows

    def _query_one(self, sql: str, params=()):
        rows = self._query(sql, params)
        return rows[0] if rows else None

    def _get_derived_status(self) -> str | None:
        row = self._query_one(
            "SELECT derived_status FROM plan_status WHERE id = '0001'"
        )
        return row[0] if row else None

    def _count_open_tickets(self, role: str) -> int:
        row = self._query_one(
            "SELECT COUNT(*) FROM tickets "
            "WHERE plan_id = '0001' AND role = %s AND status = 'open'",
            (role,),
        )
        return row[0] if row else 0

    def _count_receipts(self, receipt_type: str) -> int:
        row = self._query_one(
            "SELECT COUNT(*) FROM receipts WHERE plan_id = '0001' AND type = %s",
            (receipt_type,),
        )
        return row[0] if row else 0

    def _get_plan(self) -> dict:
        conn = psycopg2.connect(_DSN)
        cur = conn.cursor()
        cur.execute(f"SET search_path TO {self.schema_name}")
        cur.execute("SELECT * FROM plans WHERE id = '0001'")
        cols = [d.name for d in cur.description]
        row = cur.fetchone()
        cur.close()
        conn.close()
        return dict(zip(cols, row)) if row else {}

    # ── Status derivation ───────────────────────────────────────

    def test_no_receipts_returns_null(self):
        """A plan with no receipts has a NULL derived_status."""
        self.assertIsNone(self._get_derived_status())

    def test_proposed_receipt_derives_proposed(self):
        """A plan with only a PROPOSED receipt shows derived_status = PROPOSED."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PROPOSED")

    def test_planning_receipt_derives_planning(self):
        """PROPOSED + PLANNING receipts give derived_status = PLANNING."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self._issue_receipt("PLANNING", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLANNING")

    def test_plan_create_receipt_derives_plan_create(self):
        """A plan with a PLAN_CREATE receipt has derived_status = PLAN_CREATE."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    def test_full_status_chain(self):
        """Status derives correctly through PROPOSED -> PLANNING -> PLAN_CREATE."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PROPOSED")
        self._issue_receipt("PLANNING", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLANNING")
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    # ── Role eligibility (via get_eligible_plans) ───────────────

    def test_planner_eligible_with_proposed_and_ticket(self):
        """Planner is eligible when plan has PROPOSED receipt + open planner ticket."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self._seed_open_ticket("planner")
        plans = self.db.get_eligible_plans("planner")
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["id"], "0001")
        self.assertEqual(plans[0]["derived_status"], "PROPOSED")

    def test_planner_eligible_with_planning_and_ticket(self):
        """Planner is eligible when plan has PLANNING receipt + open planner ticket."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self._issue_receipt("PLANNING", agent_role="planner")
        self._seed_open_ticket("planner")
        plans = self.db.get_eligible_plans("planner")
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["derived_status"], "PLANNING")

    def test_planner_not_eligible_without_ticket(self):
        """Plan with PROPOSED but no open planner ticket is NOT eligible for planner."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        plans = self.db.get_eligible_plans("planner")
        self.assertEqual(len(plans), 0)

    def test_planner_not_eligible_after_plan_create(self):
        """Plan with PLAN_CREATE is NOT eligible for planner (status mismatch)."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._seed_open_ticket("planner")
        plans = self.db.get_eligible_plans("planner")
        self.assertEqual(len(plans), 0)

    # ── Ticket spawning ─────────────────────────────────────────

    def test_planner_completed_spawns_builder_and_critic(self):
        """Planner completing (PLAN_CREATE) spawns both builder and critic tickets."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        count = self.db.create_next_tickets("0001", "planner", "completed")
        self.assertGreater(count, 1)
        self.assertGreater(self._count_open_tickets("builder"), 0)
        self.assertGreater(self._count_open_tickets("critic"), 0)

    def test_builder_eligible_after_planner_completes(self):
        """Builder is eligible after planner completes (PLAN_CREATE + open ticket)."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.db.create_next_tickets("0001", "planner", "completed")
        plans = self.db.get_eligible_plans("builder")
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["id"], "0001")
        self.assertEqual(plans[0]["derived_status"], "PLAN_CREATE")

    def test_critic_eligible_after_planner_completes(self):
        """Critic is eligible after planner completes (PLAN_CREATE + open ticket)."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.db.create_next_tickets("0001", "planner", "completed")
        plans = self.db.get_eligible_plans("critic")
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0]["derived_status"], "PLAN_CREATE")

    # ── Full _dispatch_one flow ─────────────────────────────────
    # Superseded by Temporal PlanExecutionWorkflow.
    # Equivalent coverage: nexus/python/conduit/temporal/tests/


if __name__ == "__main__":
    unittest.main()
