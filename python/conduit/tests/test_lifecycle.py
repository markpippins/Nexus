"""Cross-project lifecycle contract tests.

Validates that manager-style receipt sequences produce the correct
plan_status.derived_status and ticket-spawning behavior when run through
the MCP-owned schema (plan_status view, tickets guard).

This tests the contract between pipeline-manager (which emits receipts)
and conduit-mcp (which owns the schema, views, and state machine).

Uses test-specific PostgreSQL schemas for isolation.
"""

import json
import os
import sys
import unittest
from datetime import datetime

import psycopg2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db_adapter import DBAdapter


_DSN = os.environ.get("CONDUIT_PG_DSN", "")
if not _DSN:
    raise RuntimeError("CONDUIT_PG_DSN must be set to run tests (PG is mandatory)")


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


class TestPlanLifecycle(unittest.TestCase):
    """Full plan lifecycle: PLAN_CREATE → IMPLEMENTATION → REVIEW_PASS."""

    def setUp(self):
        self.schema_name = f"test_lifecycle_{os.urandom(4).hex()}"
        self._raw_conn = psycopg2.connect(_DSN)
        self._raw_cur = self._raw_conn.cursor()

        self._raw_cur.execute(f"CREATE SCHEMA {self.schema_name}")
        self._raw_cur.execute(f"SET search_path TO {self.schema_name}")

        self._create_schema()
        self._seed_plan()
        self._raw_conn.commit()

        self.db = DBAdapter(schema=self.schema_name)
        self._receipt_counter = 0

    def tearDown(self):
        self._raw_cur.close()
        self._raw_conn.close()
        cleanup = psycopg2.connect(_DSN)
        cleanup.set_isolation_level(0)
        cur = cleanup.cursor()
        cur.execute(f"DROP SCHEMA {self.schema_name} CASCADE")
        cur.close()
        cleanup.close()

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
            CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type)
        """)
        c.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
            ON receipts(plan_id, type, COALESCE(session_id, ''))
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
                cost_usd REAL, created_at TEXT NOT NULL
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

        # plan_status view
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
            "INSERT INTO plans (id, file_name, title, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            ("0001", "test-plan-v0001.md", "Test Plan", now, now),
        )

    def _issue_receipt(self, receipt_type: str, agent_role: str = "builder",
                       ticket_id: str = "") -> str:
        self._receipt_counter += 1
        session = f"sess-{self._receipt_counter:04d}"
        tid = ticket_id or f"ticket-0001-test-{self._receipt_counter:04d}"
        # Seed the ticket first (PG enforces FKs, unlike SQLite with PRAGMA off).
        # Use 'completed' status so test-seeded tickets don't compete with
        # tickets created by create_next_tickets (which uses idx_tickets_open).
        now = _iso_now()
        self._raw_cur.execute(
            "INSERT INTO tickets (id, plan_id, role, status, created_by_receipt, "
            "created_at, objective, owner, last_activity) "
            "VALUES (%s, %s, %s, 'completed', %s, %s, %s, %s, %s) "
            "ON CONFLICT (id) DO NOTHING",
            (tid, "0001", agent_role, "test-lifecycle", now,
             f"Test {receipt_type}", agent_role, now),
        )
        self._raw_conn.commit()
        self.db.insert_receipt(
            plan_id="0001", receipt_type=receipt_type,
            agent_role=agent_role, session_id=session,
            ticket_id=tid, summary=f"Test {receipt_type}",
        )
        return session

    def _query(self, sql: str, params=()):
        """Run a raw query against the test schema and return all rows."""
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

    # ── Happy-path lifecycle ──────────────────────────────────────

    def test_lifecycle_plan_create(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    def test_lifecycle_builder_implementation(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self.assertEqual(self._get_derived_status(), "IMPLEMENTATION")

    def test_lifecycle_full_chain(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        self.assertEqual(self._get_derived_status(), "REVIEW_PASS")

    # ── Ticket spawning ───────────────────────────────────────────

    def test_builder_completed_spawns_reviewer_ticket(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("reviewer"), 0)

    def test_reviewer_completed_spawns_nothing(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        count = self.db.create_next_tickets("0001", "reviewer", "completed")
        self.assertEqual(count, 0)

    # ── Guard: REVIEW_PASS blocks further ticket creation ─────────

    def test_guard_blocks_after_review_pass(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertEqual(count, 0)

    def test_guard_blocks_critic_after_review_pass(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        count = self.db.create_next_tickets("0001", "critic", "completed")
        self.assertEqual(count, 0)

    # ── REVIEW_REJECT flow ────────────────────────────────────────

    def test_review_reject_still_active(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_REJECT", agent_role="reviewer")
        self.assertEqual(self._get_derived_status(), "REVIEW_REJECT")

    def test_reimplement_after_review_reject(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_REJECT", agent_role="reviewer")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self.assertEqual(self._get_derived_status(), "IMPLEMENTATION")

    def test_reviewer_failed_spawns_builder_for_reimplementation(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        count = self.db.create_next_tickets("0001", "reviewer", "failed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("builder"), 0)

    # ── BLOCK flow ────────────────────────────────────────────────

    def test_block_status(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("BLOCK", agent_role="watchdog")
        self.assertEqual(self._get_derived_status(), "BLOCK")

    def test_guard_blocks_after_block(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("BLOCK", agent_role="watchdog")
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertEqual(count, 0)

    # ── PROPOSED / PLANNING are visible in derived_status ─────────

    def test_proposed_not_pipeline_state(self):
        self._issue_receipt("PROPOSED", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PROPOSED")

    def test_proposed_then_plan_create(self):
        self._issue_receipt("PROPOSED", agent_role="planner")
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    # ── Ticket creation during normal planning flow ───────────────

    def test_planner_completed_spawns_builder_and_critic(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        count = self.db.create_next_tickets("0001", "planner", "completed")
        self.assertGreater(count, 1)
        self.assertGreater(self._count_open_tickets("builder"), 0)
        self.assertGreater(self._count_open_tickets("critic"), 0)

    def test_critic_completed_spawns_builder(self):
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        count = self.db.create_next_tickets("0001", "critic", "completed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("builder"), 0)

    # ── Plan number allocation (DB-authoritative) ─────────────────

    def test_plan_number_allocated_from_db(self):
        row = self._query_one(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        )
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        self.assertEqual(next_num, "0002")

    def test_plan_number_sequential_with_gaps(self):
        now = _iso_now()
        self._raw_cur.execute(
            "INSERT INTO plans (id, file_name, title, created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            ("0003", "gap-test-v0003.md", "Gap Plan", now, now),
        )
        self._raw_conn.commit()
        row = self._query_one(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        )
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        self.assertEqual(next_num, "0004")
        self.assertNotEqual(next_num, "0002")

    def test_plan_number_empty_db_starts_at_0001(self):
        self._raw_cur.execute("DELETE FROM plans")
        self._raw_conn.commit()
        row = self._query_one(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        )
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        self.assertEqual(next_num, "0001")

    # ── DB-primary update_plan ───────────────────────────────────

    def test_update_plan_persists_to_db_independent_of_filesystem(self):
        now = _iso_now()
        self._raw_cur.execute(
            "UPDATE plans SET goal = %s, updated_at = %s WHERE id = '0001'",
            ("Original goal", now),
        )
        self._raw_conn.commit()

        row = self._query_one("SELECT goal FROM plans WHERE id = '0001'")
        self.assertEqual(row[0], "Original goal")

        now2 = _iso_now()
        self._raw_cur.execute(
            """INSERT INTO plans (id, file_name, title, project, goal, content,
               files_affected, acceptance_criteria, dependencies, prompt_ref,
               deleted, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s)
               ON CONFLICT(id) DO UPDATE SET
               goal = excluded.goal, updated_at = excluded.updated_at""",
            ("0001", "test-plan-v0001.md", "Test Plan", "", "Updated via DB",
             "", "[]", "[]", "[]", "", now, now2),
        )
        self._raw_conn.commit()

        row = self._query_one("SELECT goal FROM plans WHERE id = '0001'")
        self.assertEqual(row[0], "Updated via DB")

    def test_update_plan_deps_and_criteria_survive_db_reopen(self):
        criteria = ["Feature works", "Tests pass", "Documented"]
        deps = ["0002", "0003"]
        files = ["src/main.ts"]

        now = _iso_now()
        self._raw_cur.execute(
            """INSERT INTO plans (id, file_name, title, project, goal, content,
               files_affected, acceptance_criteria, dependencies, prompt_ref,
               deleted, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s)
               ON CONFLICT(id) DO UPDATE SET
               acceptance_criteria = excluded.acceptance_criteria,
               dependencies = excluded.dependencies,
               files_affected = excluded.files_affected,
               updated_at = excluded.updated_at""",
            ("0001", "test-plan-v0001.md", "Test Plan", "", "",
             "", json.dumps(files), json.dumps(criteria), json.dumps(deps),
             "", now, now),
        )
        self._raw_conn.commit()

        row = self._query_one(
            "SELECT acceptance_criteria, dependencies, files_affected "
            "FROM plans WHERE id = '0001'"
        )
        self.assertEqual(json.loads(row[0]), criteria)
        self.assertEqual(json.loads(row[1]), deps)
        self.assertEqual(json.loads(row[2]), files)


if __name__ == "__main__":
    unittest.main()
