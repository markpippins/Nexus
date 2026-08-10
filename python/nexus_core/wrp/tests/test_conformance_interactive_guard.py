"""
wr-conf-005: INTERACTIVE-hosted guard — Freebuff-resident roles can never be
launched by harness-srv or the agent scheduler.

This test asserts the representation + enforcement introduced in commit 49d279e:
Freebuff-resident roles (e.g. leased-builder) are stored in tackle.config_bundle
with invocation_mode=INTERACTIVE and harness_id=harn-freebuff — model resolution
still works for lease accounting, but NO launch path may spawn them.

Tested invariants:
  AC1 — Representation: leased-builder config_bundle resolves to
        invocation_mode=INTERACTIVE + harness harn-freebuff; the resolve-context
        endpoint maps a wind task for the role to the freebuff harness.
  AC2 — harness-srv /run refuses: POST /run for an INTERACTIVE-hosted role
        returns HTTP 400 with an explicit "INTERACTIVE-hosted" message and
        never spawns a child process.
  AC3 — Scheduler skips: a leased-builder scheduler entry is skipped in shadow
        mode with skipped_interactive=1 (launched=0).

All assertions are deterministic and LLM-free. The scheduler check runs the real
agent_scheduler_runner in --shadow mode and inspects the summary counters.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_interactive_guard.py -v
"""

import json
import os
import subprocess
import sys
import time
import unittest
import urllib.request
import uuid

# Ensure nexus/python is on path for any shared imports
_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.join(_SELF_DIR, "..", "..", "..")
_NEXUS_PYTHON = os.path.abspath(_NEXUS_PYTHON)
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

NEBULA_URL = os.environ.get("NEBULA_URL", "http://localhost:3101")
HARNESS_URL = os.environ.get("HARNESS_URL", "http://localhost:3420")
DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")

# A known wind task that resolves to a normal launchable role (analyst).
# Used to prove /run still works for non-interactive roles.
CONTROL_WIND_TASK = os.environ.get(
    "CONTROL_WIND_TASK", "c0000000-0000-0000-0000-000000000001"
)

TEST_TASK_SLUG = "wr-conf-005-interactive-guard"


def _post(url: str, body: dict, timeout: int = 15):
    """POST JSON; return (status, parsed) even on HTTP errors."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw}


def _get(url: str, timeout: int = 15) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def _db():
    import psycopg2

    return psycopg2.connect(DSN)


def _db_rows(query: str, params=None) -> list:
    conn = _db()
    try:
        cur = conn.cursor()
        if params:
            cur.execute(query, params)
        else:
            # No params: execute raw so literal % (e.g. LIKE 'test-%...') is
            # never misparsed by psycopg2's Python %-formatting pass.
            cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def _db_exec(query: str, params=None) -> None:
    conn = _db()
    try:
        cur = conn.cursor()
        if params:
            cur.execute(query, params)
        else:
            # No params: execute raw so literal % (e.g. LIKE 'test-%...') is
            # never misparsed by psycopg2's Python %-formatting pass.
            cur.execute(query)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def _setup_temp_wind_task() -> str:
    """Create a temporary leased-builder tackle task + wind task.

    Returns the wind task id. Cleaned up by _teardown_temp_wind_task.
    """
    prompt_id = _db_rows(
        "SELECT id FROM tackle.prompts "
        "WHERE role='leased-builder' AND slug='opencode-persona' LIMIT 1"
    )
    assert prompt_id, "leased-builder opencode-persona prompt must exist (seeded earlier)"
    prompt_id = prompt_id[0][0]

    # Defensive: clear any leftover from a prior run before creating fresh rows.
    _teardown_temp_wind_task()

    task_id = str(uuid.uuid4())
    wind_id = str(uuid.uuid4())
    try:
        _db_exec(
            "INSERT INTO tackle.tasks (id, role, task_slug, scope, prompt_id) "
            "VALUES (%s, 'leased-builder', %s, 'test', %s)",
            (task_id, TEST_TASK_SLUG, prompt_id),
        )
        _db_exec(
            "INSERT INTO wind.tasks (id, office_id, title_id, name, description, tackle_task_id) "
            "VALUES (%s, 'a0000000-0000-0000-0000-000000000001', "
            "        'b0000000-0000-0000-0000-000000000003', %s, 'wr-conf-005 guard test', %s)",
            (wind_id, "test-" + TEST_TASK_SLUG, task_id),
        )
    except Exception:
        # If either insert fails, clean up immediately so no partial state
        # survives a failed setUp (which would otherwise skip tearDown).
        _teardown_temp_wind_task()
        raise
    return wind_id


def _teardown_temp_wind_task() -> None:
    """Remove test rows by name/slug (robust to ID reuse across runs).

    Strict on purpose: cleanup failures must surface, never be swallowed
    (a silent teardown is how stale rows survived and caused the
    uq_office_task_name collisions). Order matters — wind rows first, then
    the tackle task they reference (FK SET NULL would otherwise orphan them).
    """
    _db_exec("DELETE FROM wind.tasks WHERE name LIKE 'test-%interactive-guard%'")
    _db_exec("DELETE FROM tackle.tasks WHERE task_slug = %s", (TEST_TASK_SLUG,))


def _run_scheduler_shadow() -> dict:
    """Run agent_scheduler_runner --shadow and parse the summary line."""
    env = dict(os.environ)
    env["CONDUIT_PG_DSN"] = DSN
    env["PYTHONPATH"] = _NEXUS_PYTHON
    proc = subprocess.run(
        [sys.executable, "-m", "tackle.agent_scheduler_runner", "--shadow"],
        capture_output=True, text=True, timeout=60, env=env,
        cwd=os.path.join(_NEXUS_PYTHON, "tackle", ".."),
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    summary = {}
    for line in out.splitlines():
        if "Tick complete" in line:
            # parse key=value pairs after the marker
            idx = line.index("Tick complete")
            for part in line[idx:].split():
                if "=" in part:
                    k, v = part.split("=", 1)
                    try:
                        summary[k.strip()] = int(v)
                    except ValueError:
                        summary[k.strip()] = v
    summary["_raw"] = out
    return summary


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — Representation: config_bundle resolves to INTERACTIVE + harn-freebuff
# ═══════════════════════════════════════════════════════════════════════

class TestAc1InteractiveRepresentation(unittest.TestCase):
    """The leased-builder role is represented as INTERACTIVE-hosted."""

    def test_config_bundle_resolves_interactive(self):
        """Active config_bundle for leased-builder is INTERACTIVE + harn-freebuff."""
        rows = _db_rows(
            "SELECT cb.invocation_mode, COALESCE(cb.harness_id, m.harness_id), "
            "       m.model_identifier, cb.is_active "
            "FROM tackle.config_bundle cb "
            "JOIN tackle.models m ON cb.model_id = m.id "
            "WHERE cb.role = 'leased-builder' "
            "ORDER BY cb.priority ASC LIMIT 1"
        )
        self.assertTrue(rows, "leased-builder must have a config_bundle")
        mode, harness, model, active = rows[0]
        self.assertEqual(mode, "INTERACTIVE")
        self.assertEqual(harness, "harn-freebuff")
        self.assertEqual(active, 1)
        self.assertTrue(model)

    def test_freebuff_harness_is_hosted(self):
        """harn-freebuff semantics declare no binary — it is a host, not a launcher."""
        rows = _db_rows(
            "SELECT invocation_semantics FROM tackle.harnesses WHERE id = 'harn-freebuff'"
        )
        self.assertTrue(rows, "harn-freebuff harness must exist")
        sem = json.loads(rows[0][0])
        self.assertIsNone(sem.get("binary"))
        self.assertEqual(sem.get("execution", {}).get("mode"), "hosted")
        self.assertEqual(sem.get("execution", {}).get("host"), "freebuff")

    def test_resolve_context_maps_to_freebuff_harness(self):
        """A wind task for the leased-builder role resolves to harn-freebuff."""
        try:
            wind_id = _setup_temp_wind_task()
            status, body = _post(f"{HARNESS_URL}/resolve-context", {"wind_task_id": wind_id})
            self.assertEqual(status, 200)
            self.assertEqual(body.get("role"), "leased-builder")
            self.assertEqual(body.get("harness_id"), "harn-freebuff")
        finally:
            _teardown_temp_wind_task()


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — harness-srv /run refuses INTERACTIVE-hosted roles (HTTP 400)
# ═══════════════════════════════════════════════════════════════════════

class TestAc2RunRefusesInteractive(unittest.TestCase):
    """/run must refuse an INTERACTIVE-hosted role before any spawn."""

    def setUp(self):
        self.wind_id = _setup_temp_wind_task()

    def tearDown(self):
        _teardown_temp_wind_task()

    def test_run_returns_400_for_interactive_role(self):
        """POST /run for leased-builder → 400 with INTERACTIVE-hosted message."""
        status, body = _post(f"{HARNESS_URL}/run", {"wind_task_id": self.wind_id}, timeout=20)
        self.assertEqual(status, 400)
        err = (body.get("error") or "").lower()
        self.assertIn("interactive-hosted", err)
        self.assertIn("leased-builder", err)

    def test_run_does_not_create_session(self):
        """No active session should be registered for the refused run."""
        _post(f"{HARNESS_URL}/run", {"wind_task_id": self.wind_id}, timeout=20)
        time.sleep(0.5)
        sessions = _get(f"{HARNESS_URL}/sessions")
        for s in sessions.get("sessions", []):
            self.assertNotEqual(s.get("role"), "leased-builder",
                                "refused INTERACTIVE role must not appear in sessions")


class TestAc2ControlRunStillWorks(unittest.TestCase):
    """Control: a normal launchable role still resolves (proves the guard is narrow)."""

    def test_control_wind_task_resolves_to_launchable_role(self):
        status, body = _post(
            f"{HARNESS_URL}/resolve-context", {"wind_task_id": CONTROL_WIND_TASK}
        )
        self.assertEqual(status, 200)
        self.assertIn(body.get("role"), ("analyst", "architect", "builder", "reviewer"))
        self.assertNotEqual(body.get("harness_id"), "harn-freebuff")


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — Scheduler skips interactive-hosted roles (skipped_interactive)
# ═══════════════════════════════════════════════════════════════════════

class TestAc3SchedulerSkipsInteractive(unittest.TestCase):
    """A leased-builder scheduler entry is skipped in shadow mode."""

    def setUp(self):
        # Defensive pre-clean (mirrors _setup_temp_wind_task): a stale row
        # from a hard-crashed prior run would collide on insert or inflate
        # the shadow summary counters and fail the assertions below.
        _db_exec(
            "DELETE FROM tackle.agent_scheduler WHERE task_slug LIKE 'test-%'"
            " AND task_slug LIKE '%interactive-guard%'"
        )
        _db_exec(
            "INSERT INTO tackle.agent_scheduler "
            "(role, schedule_type, cron_expr, enabled, task_slug) "
            "VALUES ('leased-builder', 'cron', '* * * * *', 1, %s)",
            ("test-" + TEST_TASK_SLUG,),
        )

    def tearDown(self):
        _db_exec(
            "DELETE FROM tackle.agent_scheduler WHERE task_slug LIKE 'test-%'"
            " AND task_slug LIKE '%interactive-guard%'"
        )

    def test_shadow_reports_skipped_interactive(self):
        """Shadow summary: skipped_interactive >= 1, launched=0.

        Note: `evaluated` is a GLOBAL counter across all enabled scheduler
        entries (the runner iterates every enabled row), so it may exceed 1
        if production cron entries are ever enabled. Only the interactive
        assertions are strict: our leased-builder entry must be skipped
        (skipped_interactive >= 1) and shadow mode must never launch.
        """
        summary = _run_scheduler_shadow()
        raw = summary.get("_raw", "")
        self.assertIn("interactive-hosted", raw.lower(),
                      "scheduler must log the interactive-hosted skip reason")
        self.assertGreaterEqual(summary.get("skipped_interactive", 0), 1)
        self.assertEqual(summary.get("launched", 0), 0)
        # Every interactive entry evaluated was skipped — no interactive role
        # may ever be launched. (evaluated is global, so compare against the
        # skip count, not a literal 1.)
        self.assertLessEqual(summary.get("skipped_interactive", 0),
                             summary.get("evaluated", 0))


# ═══════════════════════════════════════════════════════════════════════
#  Module-level cleanup guard — never leave test rows behind
# ═══════════════════════════════════════════════════════════════════════

def _final_cleanup() -> None:
    _teardown_temp_wind_task()
    _db_exec(
        "DELETE FROM tackle.agent_scheduler WHERE task_slug LIKE 'test-%'"
        " AND task_slug LIKE '%interactive-guard%'"
    )


def tearDownModule():
    _final_cleanup()


if __name__ == "__main__":
    unittest.main()
