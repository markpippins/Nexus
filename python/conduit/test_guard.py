"""Tests for create_next_tickets terminal-plan guard.

Verifies that the guard blocks spawning new tickets when the plan already
has a terminal receipt (REVIEW_PASS, BLOCK, PLAN_BLOCK), and allows the
normal flow when no terminal receipt exists.
"""

import os
import sqlite3
import tempfile
import unittest
from datetime import datetime

from db_adapter import DBAdapter


class TestCreateNextTicketsGuard(unittest.TestCase):
    """Guard: plan with REVIEW_PASS/BLOCK/PLAN_BLOCK should not spawn tickets."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.tmp.close()
        self.db_path = self.tmp.name

        # Create all MCP-owned tables before DBAdapter.init verifies them.
        # DBAdapter now only creates manager-owned tables (work_requests,
        # pipeline_cursor) and fails fast if MCP-owned tables are missing.
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS receipts (
                id TEXT PRIMARY KEY,
                plan_id TEXT,
                type TEXT NOT NULL,
                agent_role TEXT NOT NULL DEFAULT '',
                session_id TEXT,
                ticket_id TEXT,
                tokens_used INTEGER DEFAULT 0,
                summary TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL REFERENCES plans(id),
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open'
                    CHECK(status IN (
                        'open','claimed','completed','failed',
                        'abandoned','superseded','cancelled',
                        'stale','expired'
                    )),
                session_id TEXT,
                created_by_receipt TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                claimed_at TEXT,
                closed_at TEXT,
                token_budget INTEGER,
                tokens_used INTEGER,
                objective TEXT,
                completion_criteria TEXT,
                owner TEXT NOT NULL DEFAULT '',
                parent_ticket_id TEXT REFERENCES tickets(id),
                spawn_reason TEXT,
                last_activity TEXT,
                expires_at TEXT,
                confidence REAL,
                closure_reason TEXT,
                replacement_of TEXT REFERENCES tickets(id)
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open
            ON tickets(plan_id, role) WHERE status = 'open'
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                agent_role TEXT NOT NULL,
                start_iso TEXT NOT NULL,
                end_iso TEXT,
                exit_code INTEGER,
                retries_used INTEGER DEFAULT 0,
                plans_processed TEXT NOT NULL DEFAULT '[]',
                plan_count INTEGER DEFAULT 0,
                pid INTEGER,
                is_running INTEGER DEFAULT 1,
                last_activity TEXT,
                model TEXT,
                fallback_used INTEGER DEFAULT 0,
                cost_usd REAL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS circuit_breaker (
                id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
                tripped INTEGER DEFAULT 0,
                tripped_at TEXT,
                retry_after INTEGER DEFAULT 1800,
                error TEXT,
                detail TEXT,
                source TEXT,
                fallback_model TEXT,
                paused INTEGER DEFAULT 0,
                updated_at TEXT
            )
        """)
        conn.execute(
            "INSERT OR IGNORE INTO circuit_breaker (id, tripped, updated_at) VALUES (1, 0, datetime('now'))"
        )

        # Seed a plan for testing
        now = datetime.utcnow().isoformat() + "Z"
        conn.execute(
            "INSERT INTO plans (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("test-plan-1", "Test Plan", now, now),
        )
        conn.commit()
        conn.close()

        # Now initialize DBAdapter — it verifies the MCP tables exist
        self.db = DBAdapter(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def _add_receipt(self, receipt_type: str) -> None:
        """Insert a receipt for the test plan."""
        conn = sqlite3.connect(self.db_path)
        now = datetime.utcnow().isoformat() + "Z"
        conn.execute(
            "INSERT INTO receipts (id, plan_id, type, created_at) VALUES (?, ?, ?, ?)",
            (f"rec-{receipt_type}-{int(datetime.utcnow().timestamp())}",
             "test-plan-1", receipt_type, now),
        )
        conn.commit()
        conn.close()

    def test_guard_blocks_on_review_pass(self):
        """Critic completing on a REVIEW_PASS plan returns 0 (no builder spawned)."""
        self._add_receipt("REVIEW_PASS")
        result = self.db.create_next_tickets("test-plan-1", "critic", "completed")
        self.assertEqual(result, 0)

    def test_guard_blocks_on_block(self):
        """Critic completing on a BLOCK plan returns 0."""
        self._add_receipt("BLOCK")
        result = self.db.create_next_tickets("test-plan-1", "critic", "completed")
        self.assertEqual(result, 0)

    def test_guard_blocks_on_plan_block(self):
        """Critic completing on a PLAN_BLOCK plan returns 0."""
        self._add_receipt("PLAN_BLOCK")
        result = self.db.create_next_tickets("test-plan-1", "critic", "completed")
        self.assertEqual(result, 0)

    def test_guard_allows_normal_flow(self):
        """Critic completing without any terminal receipt spawns a builder (> 0)."""
        result = self.db.create_next_tickets("test-plan-1", "critic", "completed")
        self.assertGreater(result, 0)

    def test_guard_scoped_to_correct_plan(self):
        """Terminal receipt on plan A does not block ticket creation on plan B."""
        self._add_receipt("REVIEW_PASS")
        # Seed a second plan with no terminal receipt
        conn = sqlite3.connect(self.db_path)
        now = datetime.utcnow().isoformat() + "Z"
        conn.execute(
            "INSERT INTO plans (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("test-plan-2", "Another Plan", now, now),
        )
        conn.commit()
        conn.close()

        result = self.db.create_next_tickets("test-plan-2", "critic", "completed")
        self.assertGreater(result, 0)

    def test_reviewer_failed_spawns_builder(self):
        """Reviewer failed without terminal receipt spawns a builder (> 0)."""
        result = self.db.create_next_tickets("test-plan-1", "reviewer", "failed")
        self.assertGreater(result, 0)

    def test_guard_blocks_reviewer_failed_on_review_pass(self):
        """Reviewer failed on a REVIEW_PASS plan — guard blocks, returns 0.

        Without the guard, the mapping would incorrectly spawn a builder even
        though the plan is already complete.  This test verifies that the guard
        catches this edge case.
        """
        self._add_receipt("REVIEW_PASS")
        result = self.db.create_next_tickets("test-plan-1", "reviewer", "failed")
        self.assertEqual(result, 0)

    def test_guard_blocks_planner_completed_on_review_pass(self):
        """Planner completing on a REVIEW_PASS plan — guard blocks both builder+critic (returns 0).

        Without the guard, the mapping would spawn TWO tickets (builder + critic)
        even though the plan is already complete.
        """
        self._add_receipt("REVIEW_PASS")
        result = self.db.create_next_tickets("test-plan-1", "planner", "completed")
        self.assertEqual(result, 0)

    def test_guard_blocks_reviewer_failed_on_block(self):
        """Reviewer failed on a BLOCK plan — guard blocks, returns 0.

        Without the guard, the mapping would incorrectly spawn a builder
        for re-implementation even though the plan is blocked.
        """
        self._add_receipt("BLOCK")
        result = self.db.create_next_tickets("test-plan-1", "reviewer", "failed")
        self.assertEqual(result, 0)

    def test_guard_allows_mapping_zero_on_irrelevant(self):
        """Guard does not interfere with mapping that already returns 0 (builder failed)."""
        result = self.db.create_next_tickets("test-plan-1", "builder", "failed")
        self.assertEqual(result, 0)


if __name__ == "__main__":
    unittest.main()
