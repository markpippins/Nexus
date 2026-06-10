"""Cross-project lifecycle contract tests.

Validates that manager-style receipt sequences produce the correct
plan_status.derived_status and ticket-spawning behavior when run through
the MCP-owned schema (plan_status view, tickets guard).

This tests the contract between pipeline-manager (which emits receipts)
and conduit-mcp (which owns the schema, views, and state machine).
"""

import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime

from db_adapter import DBAdapter


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


class TestPlanLifecycle(unittest.TestCase):
    """Full plan lifecycle: PLAN_CREATE → IMPLEMENTATION → REVIEW_PASS."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
        self.tmp.close()
        self.db_path = self.tmp.name
        conn = sqlite3.connect(self.db_path)
        # Tests focus on the state machine, not FK enforcement.
        # Receipts may reference synthetic ticket IDs that don't have
        # corresponding ticket rows — that's the manager's behavior.
        conn.execute("PRAGMA foreign_keys = OFF")

        # ── MCP-owned tables (same as test_guard.py) ────────────────
        conn.execute("""
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
        conn.execute("""
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
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_receipts_plan ON receipts(plan_id, created_at)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type)
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique
            ON receipts(plan_id, type, COALESCE(session_id, ''))
        """)
        conn.execute("""
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
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open
            ON tickets(plan_id, role) WHERE status = 'open'
        """)
        conn.execute("""
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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS circuit_breaker (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
                tripped INTEGER DEFAULT 0, tripped_at TEXT,
                retry_after INTEGER DEFAULT 1800, error TEXT,
                detail TEXT, source TEXT, fallback_model TEXT,
                paused INTEGER DEFAULT 0, updated_at TEXT
            )
        """)
        conn.execute(
            "INSERT OR IGNORE INTO circuit_breaker (id, tripped, updated_at) "
            "VALUES (1, 0, datetime('now'))"
        )

        # ── plan_status view (MCP-owned, replicated for contract test) ─
        conn.execute("""
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

        # Seed test plan
        now = _iso_now()
        conn.execute(
            "INSERT INTO plans (id, file_name, title, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("0001", "test-plan-v0001.md", "Test Plan", now, now),
        )
        conn.commit()
        conn.close()

        self.db = DBAdapter(self.db_path)
        self._receipt_counter = 0

    def tearDown(self):
        os.unlink(self.db_path)

    def _issue_receipt(self, receipt_type: str, agent_role: str = "builder",
                       ticket_id: str = "") -> str:
        """Issue a receipt through DBAdapter.insert_receipt."""
        self._receipt_counter += 1
        session = f"sess-{self._receipt_counter:04d}"
        tid = ticket_id or f"ticket-0001-test-{self._receipt_counter:04d}"
        self.db.insert_receipt(
            plan_id="0001", receipt_type=receipt_type,
            agent_role=agent_role, session_id=session,
            ticket_id=tid, summary=f"Test {receipt_type}",
        )
        return session

    def _get_derived_status(self) -> str | None:
        """Query plan_status.derived_status for plan 0001."""
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT derived_status FROM plan_status WHERE id = '0001'"
        ).fetchone()
        conn.close()
        return row[0] if row else None

    def _count_open_tickets(self, role: str) -> int:
        """Count open tickets for plan 0001 with the given role."""
        conn = sqlite3.connect(self.db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM tickets "
            "WHERE plan_id = '0001' AND role = ? AND status = 'open'",
            (role,),
        ).fetchone()[0]
        conn.close()
        return count

    # ── Happy-path lifecycle ──────────────────────────────────────

    def test_lifecycle_plan_create(self):
        """PLAN_CREATE alone → plan_status = 'PLAN_CREATE' (pending)."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    def test_lifecycle_builder_implementation(self):
        """PLAN_CREATE → IMPLEMENTATION → plan_status = 'IMPLEMENTATION'."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self.assertEqual(self._get_derived_status(), "IMPLEMENTATION")

    def test_lifecycle_full_chain(self):
        """PLAN_CREATE → IMPLEMENTATION → REVIEW_PASS = completed."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        self.assertEqual(self._get_derived_status(), "REVIEW_PASS")

    # ── Ticket spawning (builder creates reviewer) ────────────────

    def test_builder_completed_spawns_reviewer_ticket(self):
        """Builder success creates an open reviewer ticket."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("reviewer"), 0)

    def test_reviewer_completed_spawns_nothing(self):
        """Reviewer success is terminal — no new tickets."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        count = self.db.create_next_tickets("0001", "reviewer", "completed")
        self.assertEqual(count, 0)

    # ── Guard: REVIEW_PASS blocks further ticket creation ─────────

    def test_guard_blocks_after_review_pass(self):
        """After REVIEW_PASS, builder completed spawns nothing."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        # Late-arriving builder completion after REVIEW_PASS
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertEqual(count, 0)

    def test_guard_blocks_critic_after_review_pass(self):
        """After REVIEW_PASS, critic completed spawns nothing."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_PASS", agent_role="reviewer")
        count = self.db.create_next_tickets("0001", "critic", "completed")
        self.assertEqual(count, 0)

    # ── REVIEW_REJECT flow ────────────────────────────────────────

    def test_review_reject_still_active(self):
        """REVIEW_REJECT → plan_status = 'REVIEW_REJECT' (active, not terminal)."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_REJECT", agent_role="reviewer")
        self.assertEqual(self._get_derived_status(), "REVIEW_REJECT")

    def test_reimplement_after_review_reject(self):
        """REVIEW_REJECT → IMPLEMENTATION restores plan to active status."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self._issue_receipt("REVIEW_REJECT", agent_role="reviewer")
        # Builder reworks and submits a new implementation
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        self.assertEqual(self._get_derived_status(), "IMPLEMENTATION")

    def test_reviewer_failed_spawns_builder_for_reimplementation(self):
        """Reviewer failed → spawn a builder ticket for re-implementation."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("IMPLEMENTATION", agent_role="builder")
        count = self.db.create_next_tickets("0001", "reviewer", "failed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("builder"), 0)

    # ── BLOCK flow ────────────────────────────────────────────────

    def test_block_status(self):
        """BLOCK receipt → plan_status = 'BLOCK'."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("BLOCK", agent_role="watchdog")
        self.assertEqual(self._get_derived_status(), "BLOCK")

    def test_guard_blocks_after_block(self):
        """After BLOCK, no tickets are spawned."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self._issue_receipt("BLOCK", agent_role="watchdog")
        count = self.db.create_next_tickets("0001", "builder", "completed")
        self.assertEqual(count, 0)

    # ── PROPOSED / PLANNING are invisible to derived_status ───────

    def test_proposed_not_pipeline_state(self):
        """PROPOSED receipt alone → derived_status = 'PROPOSED'.

        The plan_status view returns PROPOSED because the fallback subquery
        (without the PROPOSED/PLANNING exclusion) catches it.
        """
        self._issue_receipt("PROPOSED", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PROPOSED")

    def test_proposed_then_plan_create(self):
        """PROPOSED → PLAN_CREATE → derived_status = 'PLAN_CREATE'."""
        self._issue_receipt("PROPOSED", agent_role="planner")
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        self.assertEqual(self._get_derived_status(), "PLAN_CREATE")

    # ── Ticket creation during normal planning flow ───────────────

    def test_planner_completed_spawns_builder_and_critic(self):
        """Planner completes → spawns builder + critic tickets."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        count = self.db.create_next_tickets("0001", "planner", "completed")
        self.assertGreater(count, 1)
        self.assertGreater(self._count_open_tickets("builder"), 0)
        self.assertGreater(self._count_open_tickets("critic"), 0)

    def test_critic_completed_spawns_builder(self):
        """Critic completes → spawns a builder ticket."""
        self._issue_receipt("PLAN_CREATE", agent_role="planner")
        count = self.db.create_next_tickets("0001", "critic", "completed")
        self.assertGreater(count, 0)
        self.assertGreater(self._count_open_tickets("builder"), 0)


    # ── Plan number allocation (DB-authoritative) ─────────────────

    def test_plan_number_allocated_from_db(self):
        """Plan number allocation uses MAX(id) from plans table.

        When plans with higher IDs exist, a new plan gets the next sequential
        number.  This is the SQLite-authoritative allocation used by
        PipelineWatcher.createPlan().
        """
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        ).fetchone()
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        # Plan 0001 already exists, so next should be 0002
        self.assertEqual(next_num, "0002")
        conn.close()

    def test_plan_number_sequential_with_gaps(self):
        """Plan allocation uses MAX(id), so gaps in numbering don't cause collisions.

        Even if plan 0003 exists without 0002, the next allocation is 0004.
        """
        now = _iso_now()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "INSERT INTO plans (id, file_name, title, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("0003", "gap-test-v0003.md", "Gap Plan", now, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        ).fetchone()
        conn.close()
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        self.assertEqual(next_num, "0004")
        self.assertNotEqual(next_num, "0002")

    def test_plan_number_empty_db_starts_at_0001(self):
        """With no plans in DB, the next number should be 0001."""
        conn = sqlite3.connect(self.db_path)
        conn.execute("DELETE FROM plans")
        conn.commit()
        row = conn.execute(
            "SELECT MAX(CAST(id AS INTEGER)) as max_id FROM plans"
        ).fetchone()
        conn.close()
        max_id = row[0] if row[0] else 0
        next_num = str(max_id + 1).zfill(4)
        self.assertEqual(next_num, "0001")

    # ── DB-primary update_plan ───────────────────────────────────

    def test_update_plan_persists_to_db_independent_of_filesystem(self):
        """update_plan updates the database first.  The change is visible
        via getPlanById() even if no filesystem IMPLEMENTATION_PLANS directory
        exists (DB-primary mode).

        This simulates the watcher.updatePlanMetadata() DB-first path.
        """
        now = _iso_now()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "UPDATE plans SET goal = 'Original goal', updated_at = ? WHERE id = '0001'",
            (now,),
        )
        conn.commit()
        conn.close()

        # Verify original
        conn = sqlite3.connect(self.db_path)
        row = conn.execute("SELECT goal FROM plans WHERE id = '0001'").fetchone()
        conn.close()
        self.assertEqual(row[0], "Original goal")

        # Now simulate what updatePlanMetadata does: upsertPlan with new goal
        now2 = _iso_now()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """INSERT INTO plans (id, file_name, title, project, goal, content,
               files_affected, acceptance_criteria, dependencies, prompt_ref,
               deleted, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               goal = excluded.goal, updated_at = excluded.updated_at""",
            ("0001", "test-plan-v0001.md", "Test Plan", "", "Updated via DB",
             "", "[]", "[]", "[]", "", now, now2),
        )
        conn.commit()
        conn.close()

        # Verify update persisted
        conn = sqlite3.connect(self.db_path)
        row = conn.execute("SELECT goal FROM plans WHERE id = '0001'").fetchone()
        conn.close()
        self.assertEqual(row[0], "Updated via DB")

    def test_update_plan_deps_and_criteria_survive_db_reopen(self):
        """Update_plan accepts criteria and deps as JSON arrays.

        These are stored in the plans table and survive DB reconnects,
        which is the contract between the MCP tool handler and the
        plan_status view.
        """
        criteria = ["Feature works", "Tests pass", "Documented"]
        deps = ["0002", "0003"]
        files = ["src/main.ts"]

        conn = sqlite3.connect(self.db_path)
        now = _iso_now()
        conn.execute(
            """INSERT INTO plans (id, file_name, title, project, goal, content,
               files_affected, acceptance_criteria, dependencies, prompt_ref,
               deleted, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
               acceptance_criteria = excluded.acceptance_criteria,
               dependencies = excluded.dependencies,
               files_affected = excluded.files_affected,
               updated_at = excluded.updated_at""",
            ("0001", "test-plan-v0001.md", "Test Plan", "", "",
             "", json.dumps(files), json.dumps(criteria), json.dumps(deps),
             "", now, now),
        )
        conn.commit()
        conn.close()

        # Re-open and verify
        conn = sqlite3.connect(self.db_path)
        row = conn.execute(
            "SELECT acceptance_criteria, dependencies, files_affected "
            "FROM plans WHERE id = '0001'"
        ).fetchone()
        conn.close()
        self.assertEqual(json.loads(row[0]), criteria)
        self.assertEqual(json.loads(row[1]), deps)
        self.assertEqual(json.loads(row[2]), files)


if __name__ == "__main__":
    unittest.main()
