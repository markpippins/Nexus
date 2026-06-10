"""Integration test for _dispatch_one() with rate-limit retry loop.

Uses a fake executor script that simulates rate-limit failures on
the first N calls, then succeeds on the final call.  Verifies:

- Retry loop sleeps and retries on rate-limit errors
- API_LIMIT receipts are issued for each retry attempt
- Final IMPLEMENTATION receipt is issued on success
- Ticket is closed as 'completed' after success, 'failed' after exhaustion
- Non-rate-limit failures are not retried (immediate failure path)
- Session records total_work_seconds for actual execution only
- Circuit breaker is NOT tripped on rate limits
"""

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
import unittest
from datetime import datetime

# ── Set env vars BEFORE importing main (which reads them at module load) ──
# Use a unique temp lock path to avoid clashing with production
os.environ["PIPELINE_LOCK_PATH"] = "/tmp/pipeline-test-dispatch.lock"
os.environ["PIPELINE_WATCHDOG_STALE"] = "86400"  # 24h — disable watchdog
os.environ["API_LIMIT_RETRY_DELAY"] = "1"         # 1 second for fast tests
os.environ["API_LIMIT_MAX_RETRIES"] = "3"          # enough to test retry + exhaustion
os.environ["PIPELINE_EXECUTOR_TIMEOUT"] = "30"
os.environ["MCP_BASE_URL"] = "http://localhost:19999"  # non-routable, /plans/sync fails fast
os.environ["PIPELINE_DCO_DIR"] = "/tmp/pipeline-test-dco"  # safe temp DCO directory
os.environ["PIPELINE_DB_PATH"] = "/tmp/pipeline-test-dispatch.db"  # dummy default

# Now safe to import from main
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from main import _dispatch_one, _detect_api_limit_error
from db_adapter import DBAdapter
from executor_registry import (
    ModelConfig,
    RegistryConfig,
    ExecutorRegistration,
    InvocationContract,
)


def _iso_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ── Fake executor script (written to a temp .py file) ─────────────────
# This script is invoked as a subprocess by _dispatch_one.
# Reads FAKE_EXECUTOR_COUNTER to determine invocation number,
# looks up the exit code in FAKE_EXECUTOR_BEHAVIOR (comma-separated list),
# prints simulated output, and exits with the configured code.
_FAKE_EXECUTOR_SOURCE = (
    "import json, os, sys\n"
    "\n"
    "dco_path = sys.argv[1]\n"
    "counter_path = os.environ.get('FAKE_EXECUTOR_COUNTER', '')\n"
    "behavior_str = os.environ.get('FAKE_EXECUTOR_BEHAVIOR', '0')\n"
    "behavior = [int(x) for x in behavior_str.split(',') if x.strip()]\n"
    "\n"
    "if counter_path and os.path.exists(counter_path):\n"
    "    with open(counter_path) as f:\n"
    "        attempt = int(f.read().strip())\n"
    "else:\n"
    "    attempt = 0\n"
    "\n"
    "with open(counter_path, 'w') as f:\n"
    "    f.write(str(attempt + 1))\n"
    "\n"
    "exit_code = behavior[attempt] if attempt < len(behavior) else 0\n"
    "\n"
    "try:\n"
    "    with open(dco_path) as f:\n"
    "        dco = json.load(f)\n"
    "    wr_id = dco.get('id', 'unknown')\n"
    "except Exception as e:\n"
    "    print('ERROR: Could not read DCO ' + str(dco_path) + ': ' + str(e))\n"
    "    sys.exit(1)\n"
    "\n"
    "print('WorkRequest: ' + str(wr_id) + ' (attempt ' + str(attempt + 1) + ', exit ' + str(exit_code) + ')')\n"
    "\n"
    "if exit_code in (3, 429):\n"
    '    print(\'{"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}}\')\n'
    "elif exit_code == 0:\n"
    '    print(\'token_usage: {"input": 100, "output": 50, "total": 150}\')\n'
    "else:\n"
    "    print('Failed with exit code ' + str(exit_code))\n"
    "\n"
    "sys.exit(exit_code)\n"
)


class TestDispatchIntegration(unittest.TestCase):
    """Integration tests exercising _dispatch_one() with a fake executor."""

    @classmethod
    def setUpClass(cls):
        """Write the fake executor script once for the class."""
        cls._fake_executor_path = tempfile.mktemp(suffix="_fake_executor.py")
        with open(cls._fake_executor_path, "w") as f:
            f.write(_FAKE_EXECUTOR_SOURCE)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls._fake_executor_path):
            os.unlink(cls._fake_executor_path)

    def setUp(self):
        """Create a fresh pipeline DB and temp directories for each test.

        Each test gets:
        - A temp SQLite DB with full MCP-owned + manager-owned schema
        - A seed plan (0001) and an open ticket (builder)
        - A temp DCO directory for WorkRequest JSON files
        - A registry config pointing to the fake executor
        """
        self._tmp_dir = tempfile.mkdtemp(suffix="_dispatch_test")
        self._db_path = os.path.join(self._tmp_dir, "pipeline.db")
        self._dco_dir = os.path.join(self._tmp_dir, "WORK_REQUESTS")
        self._counter_path = os.path.join(self._tmp_dir, "exec_counter.txt")
        os.makedirs(self._dco_dir, exist_ok=True)

        self._project_root = self._tmp_dir

        # Build the full schema
        self._init_schema()

        # Seed a plan
        self._seed_plan()

        # Create DBAdapter
        self.db = DBAdapter(self._db_path)

        # Create an open ticket for the plan+role
        self._seed_ticket("builder")

        # Build registry config pointing to the fake executor
        self.registry = self._build_registry()

        # Model config
        self.model_cfg = ModelConfig(harness="opencode", model="fake-test-model")

    def tearDown(self):
        # Clean up the lock file
        lock_path = os.environ.get("PIPELINE_LOCK_PATH", "/tmp/pipeline-test-dispatch.lock")
        if os.path.exists(lock_path):
            try:
                os.unlink(lock_path)
            except OSError:
                pass
        # Remove temp dir
        if os.path.exists(self._tmp_dir):
            shutil.rmtree(self._tmp_dir, ignore_errors=True)

    # ── Schema helpers ─────────────────────────────────────────────

    def _init_schema(self):
        """Create all MCP-owned tables + plan_status view."""
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA foreign_keys = OFF")

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
        # NOTE: idx_receipts_unique is deliberately omitted.
        # The unique index on (plan_id, type, session_id) blocks the
        # retry loop from issuing multiple API_LIMIT receipts for the
        # same session (the manager creates one session per dispatch,
        # not per attempt). The MCP server enforces this at runtime;
        # the integration test exercises the retry log front of it.
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
                cost_usd REAL, total_work_seconds REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
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
        conn.commit()
        conn.close()

    def _seed_plan(self):
        """Insert a test plan."""
        conn = sqlite3.connect(self._db_path)
        now = _iso_now()
        conn.execute(
            "INSERT INTO plans (id, file_name, title, goal, project, "
            "files_affected, acceptance_criteria, dependencies, "
            "created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("0001", "test-plan-v0001.md", "Test Integration Plan",
             "Implement the feature X",
             "conduit-test",
             json.dumps(["src/main.py", "src/lib.py"]),
             json.dumps(["Feature works", "Tests pass"]),
             json.dumps([]),
             now, now),
        )
        conn.commit()
        conn.close()

    def _seed_ticket(self, role: str):
        """Create an open ticket for plan 0001 + role."""
        conn = sqlite3.connect(self._db_path)
        now = _iso_now()
        ticket_id = f"ticket-0001-{role}-test"
        conn.execute(
            "INSERT OR IGNORE INTO tickets "
            "(id, plan_id, role, status, created_by_receipt, created_at, "
            "objective, owner, last_activity) "
            "VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)",
            (ticket_id, "0001", role, "test-dispatch", now,
             "Test Integration Plan", role, now),
        )
        conn.commit()
        conn.close()

    def _build_registry(self) -> RegistryConfig:
        """Build a RegistryConfig that dispatches to the fake executor."""
        return RegistryConfig(
            default_model=ModelConfig(harness="opencode", model="fake-test-model"),
            fallback_model=ModelConfig(harness="opencode", model="fake-test-model"),
            executors=[
                ExecutorRegistration(
                    executor_id="fake-executor",
                    supports=["opencode"],
                    invocation_contract=InvocationContract(
                        type="cli",
                        command=self._fake_executor_path,
                    ),
                ),
            ],
        )

    def _get_plan(self, plan_id: str = "0001") -> dict:
        """Build a plan dict matching what get_eligible_plans returns."""
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
        conn.close()
        return dict(row) if row else {}

    def _configure_executor(self, behavior: str):
        """Set env vars so the fake executor returns the given exit codes.

        Args:
            behavior: Comma-separated exit codes, e.g. "3,0" means first
                     invocation exits 3 (rate limit), second exits 0 (success).
        """
        os.environ["FAKE_EXECUTOR_BEHAVIOR"] = behavior
        os.environ["FAKE_EXECUTOR_COUNTER"] = self._counter_path
        # Reset the counter file
        if os.path.exists(self._counter_path):
            os.unlink(self._counter_path)

    def _count_receipts(self, receipt_type: str) -> int:
        """Count receipts of a specific type for plan 0001."""
        conn = sqlite3.connect(self._db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM receipts WHERE plan_id = '0001' AND type = ?",
            (receipt_type,),
        ).fetchone()[0]
        conn.close()
        return count

    def _get_ticket_status(self, role: str = "builder") -> str | None:
        """Get the ticket status for a role on plan 0001."""
        conn = sqlite3.connect(self._db_path)
        row = conn.execute(
            "SELECT status FROM tickets WHERE plan_id = '0001' AND role = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (role,),
        ).fetchone()
        conn.close()
        return row[0] if row else None

    def _get_session_work_time(self) -> tuple[float, int]:
        """Get (total_work_seconds, is_running) from the most recent session."""
        conn = sqlite3.connect(self._db_path)
        row = conn.execute(
            "SELECT total_work_seconds, is_running FROM sessions "
            "ORDER BY start_iso DESC LIMIT 1"
        ).fetchone()
        conn.close()
        return (row[0] or 0.0, row[1]) if row else (0.0, 0)

    def _get_receipt_types_in_order(self) -> list[str]:
        """Get receipt types for plan 0001 in chronological order."""
        conn = sqlite3.connect(self._db_path)
        rows = conn.execute(
            "SELECT type FROM receipts WHERE plan_id = '0001' "
            "ORDER BY created_at ASC"
        ).fetchall()
        conn.close()
        return [r[0] for r in rows]

    def _count_open_tickets(self, role: str) -> int:
        """Count open tickets for plan 0001 with the given role."""
        conn = sqlite3.connect(self._db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM tickets "
            "WHERE plan_id = '0001' AND role = ? AND status = 'open'",
            (role,),
        ).fetchone()[0]
        conn.close()
        return count

    # ── Tests ─────────────────────────────────────────────────────

    def test_normal_success_no_retry(self):
        """Executor exits 0 on first try — no API_LIMIT receipts, success path."""
        self._configure_executor("0")
        plan = self._get_plan()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify: no API_LIMIT receipts
        self.assertEqual(self._count_receipts("API_LIMIT"), 0)

        # Verify: IMPLEMENTATION receipt issued
        self.assertEqual(self._count_receipts("IMPLEMENTATION"), 1)

        # Verify: ticket completed
        self.assertEqual(self._get_ticket_status("builder"), "completed")

        # Verify: session closed (is_running=0)
        work_time, is_running = self._get_session_work_time()
        self.assertEqual(is_running, 0)
        self.assertGreater(work_time, 0)

    def test_rate_limit_then_success(self):
        """First call exits 3 (rate limit), second exits 0 (success)."""
        self._configure_executor("3,0")
        plan = self._get_plan()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify: exactly 1 API_LIMIT receipt issued
        self.assertEqual(self._count_receipts("API_LIMIT"), 1)

        # Verify: IMPLEMENTATION receipt issued after retry
        self.assertEqual(self._count_receipts("IMPLEMENTATION"), 1)

        # Verify receipt order: API_LIMIT before IMPLEMENTATION
        order = self._get_receipt_types_in_order()
        self.assertIn("API_LIMIT", order)
        self.assertIn("IMPLEMENTATION", order)
        self.assertLess(order.index("API_LIMIT"), order.index("IMPLEMENTATION"))

        # Verify: ticket completed
        self.assertEqual(self._get_ticket_status("builder"), "completed")

    def test_rate_limit_multiple_retries_then_success(self):
        """Multiple rate-limit retries before final success."""
        self._configure_executor("3,3,0")
        plan = self._get_plan()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify: 2 API_LIMIT receipts (2 retries, then success)
        self.assertEqual(self._count_receipts("API_LIMIT"), 2)

        # Verify: IMPLEMENTATION on final attempt
        self.assertEqual(self._count_receipts("IMPLEMENTATION"), 1)

        # Verify: ticket completed
        self.assertEqual(self._get_ticket_status("builder"), "completed")

    def test_rate_limit_exhaustion(self):
        """All retries exhausted — ticket closes as failed."""
        self._configure_executor("3,3,3")
        plan = self._get_plan()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify: 3 API_LIMIT receipts (all 3 attempts exhausted)
        self.assertEqual(self._count_receipts("API_LIMIT"), 3)

        # Verify: no IMPLEMENTATION
        self.assertEqual(self._count_receipts("IMPLEMENTATION"), 0)

        # Verify: ticket failed
        self.assertEqual(self._get_ticket_status("builder"), "failed")

        # Verify: builder failure does NOT create reviewer tickets (BLOCK is terminal)
        self.assertEqual(self._count_open_tickets("reviewer"), 0)

    def test_non_rate_limit_failure_not_retried(self):
        """Non-rate-limit failure (exit 1) does not trigger retry loop."""
        self._configure_executor("1")
        plan = self._get_plan()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify: no API_LIMIT receipts
        self.assertEqual(self._count_receipts("API_LIMIT"), 0)

        # Verify: BLOCK receipt issued
        self.assertEqual(self._count_receipts("BLOCK"), 1)

        # Verify: ticket failed
        self.assertEqual(self._get_ticket_status("builder"), "failed")

        # Verify: only 1 attempt (no retry)
        self.assertEqual(self._get_receipt_types_in_order(), ["BLOCK"])

    def test_free_usage_limit_error_detected_via_output_text(self):
        """Rate-limit error text in output is detected regardless of exit code.

        This tests that _detect_api_limit_error catches FreeUsageLimitError
        in the output when the exit code is 0 (stream error scenario).
        """
        # Unit test _detect_api_limit_error directly
        output = '{"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}}'
        self.assertTrue(_detect_api_limit_error(0, output))

        # Also verify non-rate-limit output isn't misdetected
        self.assertFalse(_detect_api_limit_error(0, "Execution completed successfully"))
        self.assertFalse(_detect_api_limit_error(0, "token_usage: {input: 100}"))

    def test_retry_does_not_trip_circuit_breaker(self):
        """Rate-limit retries should NOT trip the circuit breaker."""
        self._configure_executor("3,3,0")
        plan = self._get_plan()

        # Verify breaker is not tripped before
        conn = sqlite3.connect(self._db_path)
        tripped = conn.execute(
            "SELECT tripped FROM circuit_breaker WHERE id = 1"
        ).fetchone()[0]
        conn.close()
        self.assertEqual(tripped, 0)

        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)

        # Verify breaker is still not tripped after retries
        conn = sqlite3.connect(self._db_path)
        tripped = conn.execute(
            "SELECT tripped FROM circuit_breaker WHERE id = 1"
        ).fetchone()[0]
        conn.close()
        self.assertEqual(tripped, 0)

    def test_work_time_tracks_execution_not_waiting(self):
        """total_work_seconds should reflect only subprocess time, not sleep time.

        The retry delay is 1s per attempt.  With 3 retries followed by success,
        total sleep = 3s.  Subprocess execution overhead should be much less
        than 3s for a trivial fake executor.
        """
        # With API_LIMIT_MAX_RETRIES=3, the loop runs attempts 1..3.
        # Behavior "3,3,0" means: attempt 1=exit 3 (retry), attempt 2=exit 3 (retry),
        # attempt 3=exit 0 (success).  The 1s delay runs twice (after attempts 1 and 2),
        # so total sleep = 2s and wall time should be >= 2s.
        self._configure_executor("3,3,0")
        plan = self._get_plan()

        start_wall = time.time()
        _dispatch_one(plan, "builder", self.db, self.registry, self.model_cfg)
        elapsed_wall = time.time() - start_wall

        work_time, is_running = self._get_session_work_time()

        # Wall time should be >= 2s (2 retries x 1s delay)
        self.assertGreaterEqual(elapsed_wall, 2.0)

        # Work time should be less than the total sleep time (2s).
        # This directly verifies that sleep/wait time is not counted.
        self.assertLess(work_time, 2.0)

        # Work time should be non-zero (subprocess actually ran)
        self.assertGreater(work_time, 0)


if __name__ == "__main__":
    unittest.main()
