"""
wr-conf-007: interactive-channel dispatch cycle — the leased-builder loop,
end-to-end, guarded like the rest of the fabric.

This test exercises the FULL interactive dispatch cycle against the live
stores (nebula-srv lease ledger, harness-srv, tackle scheduler,
wind/tackle task tables):

    issue lease (channel=interactive)
      → dispatch WR (wind task → leased-builder tackle task + scheduler entry)
      → resolve-context → harn-freebuff (INTERACTIVE-hosted)
      → harness-srv /run REFUSES (HTTP 400, never spawns)
      → scheduler shadow-skips (skipped_interactive, launched=0)
      → interactive channel completes a unit → POST /api/role-leases/consume
      → consumed_units += 1, lease still ACTIVE and bounded
      → cleanup: lease revoked, temp rows removed

This is the last link the earlier suites left unguarded: wr-conf-001/004
proved lease accounting on the scheduler/harness channels, wr-conf-005
proved the INTERACTIVE representation + guards — but nobody had asserted
the *live interactive loop* (guards + accounting together, on the real
endpoints) as a conformance test.

NOTE on AC1–AC3: they intentionally mirror wr-conf-005's guards
(test_conformance_interactive_guard.py) so this dispatch-cycle suite is
self-contained — if either file is retargeted the cycle is still fully
guarded. Keep the two in sync when the config_bundle/scheduler semantics
change. Lease tests assume the role is idle during the run (nebula-srv
issues one ACTIVE lease per role; issue returns 409 while one exists), the
same assumption wr-conf-004 makes.

Tested invariants:
  AC1 — Representation + dispatch: the leased-builder config_bundle resolves
        to invocation_mode=INTERACTIVE, harness harn-freebuff, model set; a
        wind task for the role resolves to the freebuff harness.
  AC2 — /run guard: harness-srv POST /run for the INTERACTIVE-hosted role
        returns HTTP 400 with an explicit "interactive-hosted" message and
        never registers a session.
  AC3 — Scheduler guard: a leased-builder scheduler entry is skipped in
        shadow mode with skipped_interactive >= 1 and launched=0.
  AC4 — Accounting boundary: issue a real lease (channel=interactive),
        consume one unit through POST /api/role-leases/consume →
        consumed_units 0→1, budget intact, exhausted=false, still ACTIVE.
  AC5 — The full cycle in sequence (all four stages in one run), then
        cleanup: lease revoked, temp wind/tackle/scheduler rows gone.

All assertions are deterministic and LLM-free.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_live_interactive_dispatch.py -v
"""

import json
import os
import subprocess
import sys
import time
import unittest
import urllib.error
import urllib.request
import uuid

# Ensure nexus/python is on path for any shared imports.
_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.join(_SELF_DIR, "..", "..", "..")
_NEXUS_PYTHON = os.path.abspath(_NEXUS_PYTHON)
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

NEBULA_URL = os.environ.get("NEBULA_URL", "http://localhost:3101")
HARNESS_URL = os.environ.get("HARNESS_URL", "http://localhost:3420")
DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")

ROLE = "leased-builder"
TEST_TASK_SLUG = "wr-conf-007-interactive-dispatch"


# ── HTTP helpers ────────────────────────────────────────────────────

def _post(url: str, body: dict, timeout: int = 15):
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


# ── DB helpers ──────────────────────────────────────────────────────

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
            cur.execute(query)
        conn.commit()
        cur.close()
    finally:
        conn.close()


# ── Lease helpers ───────────────────────────────────────────────────

def _issue_lease(budget: int = 2, ttl: int = 180) -> dict:
    status, body = _post(f"{NEBULA_URL}/api/role-leases/issue", {
        "role": ROLE,
        "channel": "interactive",
        "model": "freebuff/deepseek-v4-flash",
        "budgetUnits": budget,
        "ttlSeconds": ttl,
    })
    assert status in (200, 201), f"lease issue failed: {status} {body}"
    return body


def _consume() -> dict:
    status, body = _post(f"{NEBULA_URL}/api/role-leases/consume", {"role": ROLE})
    assert status in (200, 201), f"consume failed: {status} {body}"
    return body


def _revoke(lease_id: str) -> dict:
    status, body = _post(f"{NEBULA_URL}/api/role-leases/{lease_id}/revoke", {})
    assert status in (200, 201), f"revoke failed: {status} {body}"
    return body


def _cleanup_leases() -> None:
    try:
        resp = _get(f"{NEBULA_URL}/api/role-leases?role={ROLE}")
        for item in resp.get("items", []):
            if item.get("status") == "ACTIVE":
                _revoke(item["id"])
    except Exception:
        pass


# ── Dispatch fixtures (wind task + scheduler entry) ─────────────────

def _teardown_temp_dispatch() -> None:
    _db_exec("DELETE FROM wind.tasks WHERE name LIKE 'wr-conf-007%'")
    _db_exec("DELETE FROM tackle.tasks WHERE task_slug = %s", (TEST_TASK_SLUG,))
    _db_exec("DELETE FROM tackle.agent_scheduler WHERE task_slug = %s", (TEST_TASK_SLUG,))


def _setup_temp_dispatch() -> str:
    """Create a leased-builder tackle task + wind task + scheduler entry.

    Returns the wind task id. Cleaned up by _teardown_temp_dispatch.
    """
    _teardown_temp_dispatch()
    prompt_id = _db_rows(
        "SELECT id FROM tackle.prompts "
        "WHERE role='leased-builder' AND slug='opencode-persona' LIMIT 1"
    )
    assert prompt_id, "leased-builder opencode-persona prompt must exist (seeded earlier)"
    prompt_id = prompt_id[0][0]

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
            "        'b0000000-0000-0000-0000-000000000003', %s, 'wr-conf-007 dispatch', %s)",
            (wind_id, "wr-conf-007-" + TEST_TASK_SLUG, task_id),
        )
        _db_exec(
            "INSERT INTO tackle.agent_scheduler "
            "(role, schedule_type, cron_expr, enabled, task_slug) "
            "VALUES ('leased-builder', 'cron', '* * * * *', 1, %s)",
            (TEST_TASK_SLUG,),
        )
    except Exception:
        _teardown_temp_dispatch()
        raise
    return wind_id


def _run_scheduler_shadow() -> dict:
    """Run agent_scheduler_runner --shadow and parse the summary line."""
    env = dict(os.environ)
    env["CONDUIT_PG_DSN"] = DSN
    env["PYTHONPATH"] = _NEXUS_PYTHON
    proc = subprocess.run(
        [sys.executable, "-m", "tackle.agent_scheduler_runner", "--shadow"],
        capture_output=True, text=True, timeout=90, env=env,
        cwd=os.path.join(_NEXUS_PYTHON, "tackle", ".."),
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    summary = {}
    for line in out.splitlines():
        if "Tick complete" in line:
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


# ═══════════════════════════════════════════════════════════════════
#  AC1 — Representation + dispatch resolution
# ═══════════════════════════════════════════════════════════════════

class TestAc1InteractiveDispatchResolution(unittest.TestCase):
    """The leased-builder role resolves as INTERACTIVE + harn-freebuff."""

    def test_config_bundle_resolves_interactive(self):
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

    def test_wind_task_resolves_to_freebuff_harness(self):
        try:
            wind_id = _setup_temp_dispatch()
            status, body = _post(f"{HARNESS_URL}/resolve-context", {"wind_task_id": wind_id})
            self.assertEqual(status, 200)
            self.assertEqual(body.get("role"), ROLE)
            self.assertEqual(body.get("harness_id"), "harn-freebuff")
        finally:
            _teardown_temp_dispatch()


# ═══════════════════════════════════════════════════════════════════
#  AC2 — /run guard: the INTERACTIVE role can never be launched
# ═══════════════════════════════════════════════════════════════════

class TestAc2RunRefusesInteractive(unittest.TestCase):
    """harness-srv /run must refuse an INTERACTIVE-hosted role (400, no spawn)."""

    def setUp(self):
        self.wind_id = _setup_temp_dispatch()

    def tearDown(self):
        _teardown_temp_dispatch()

    def test_run_returns_400_for_interactive_role(self):
        status, body = _post(f"{HARNESS_URL}/run", {"wind_task_id": self.wind_id}, timeout=20)
        self.assertEqual(status, 400)
        err = (body.get("error") or "").lower()
        self.assertIn("interactive-hosted", err)
        self.assertIn("leased-builder", err)

    def test_run_does_not_register_session(self):
        _post(f"{HARNESS_URL}/run", {"wind_task_id": self.wind_id}, timeout=20)
        time.sleep(0.5)
        sessions = _get(f"{HARNESS_URL}/sessions")
        for s in sessions.get("sessions", []):
            self.assertNotEqual(s.get("role"), ROLE,
                                "refused INTERACTIVE role must not appear in sessions")


# ═══════════════════════════════════════════════════════════════════
#  AC3 — Scheduler skips the interactive role (never launches)
# ═══════════════════════════════════════════════════════════════════

class TestAc3SchedulerSkipsInteractive(unittest.TestCase):
    """A leased-builder scheduler entry is skipped in shadow mode."""

    def setUp(self):
        _setup_temp_dispatch()

    def tearDown(self):
        _teardown_temp_dispatch()

    def test_shadow_reports_skipped_interactive(self):
        summary = _run_scheduler_shadow()
        raw = summary.get("_raw", "")
        self.assertIn("interactive-hosted", raw.lower(),
                      "scheduler must log the interactive-hosted skip reason")
        self.assertGreaterEqual(summary.get("skipped_interactive", 0), 1)
        self.assertEqual(summary.get("launched", 0), 0)
        self.assertLessEqual(summary.get("skipped_interactive", 0),
                             summary.get("evaluated", 0))


# ═══════════════════════════════════════════════════════════════════
#  AC4 — Accounting boundary: consume charges the interactive lease
# ═══════════════════════════════════════════════════════════════════

class TestAc4AccountingBoundary(unittest.TestCase):
    """One completed unit ⇒ consumed_units += 1 on the interactive lease."""

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_consume_increments_consumed_units(self):
        lease = _issue_lease(budget=2, ttl=180)
        self.assertEqual(lease["status"], "ACTIVE")
        self.assertEqual(lease["channel"], "interactive")
        self.assertEqual(lease["consumed_units"], 0)

        result = _consume()
        self.assertTrue(result.get("ok"))
        self.assertEqual(result.get("consumed"), 1)
        self.assertEqual(result.get("budget"), 2)
        self.assertFalse(result.get("exhausted", False))

        resp = _get(f"{NEBULA_URL}/api/role-leases?role={ROLE}")
        active = [i for i in resp.get("items", []) if i.get("id") == lease["id"]]
        self.assertTrue(active, "lease must still exist after consume")
        lease_now = active[0]
        self.assertEqual(lease_now["consumed_units"], 1)
        self.assertEqual(lease_now["status"], "ACTIVE")
        self.assertLessEqual(lease_now["consumed_units"], lease_now["budget_units"])

    def test_consume_exhausts_at_budget(self):
        """The consume that REACHES the budget fires the exhaustion hook:
        exhausted=true + auto-revoke (type:lease-exhausted record).

        Contract from nebula-srv routes.ts: consumed_units >= budget_units ⇒
        exhausted=true and the lease is set RELEASED in the same request.
        """
        _issue_lease(budget=1, ttl=180)
        first = _consume()
        self.assertTrue(first.get("ok"))
        self.assertTrue(first.get("exhausted", False),
                        "budget of 1 must be exhausted on the consume that reaches it")
        # Auto-revoked → no ACTIVE lease remains for the role.
        resp = _get(f"{NEBULA_URL}/api/role-leases?role={ROLE}")
        active = [i for i in resp.get("items", []) if i.get("status") == "ACTIVE"]
        self.assertEqual(len(active), 0,
                         "exhausted lease must be auto-revoked by the hook")


# ═══════════════════════════════════════════════════════════════════
#  AC5 — The full cycle in one sequence (guards + accounting together)
# ═══════════════════════════════════════════════════════════════════

class TestAc5FullInteractiveCycle(unittest.TestCase):
    """The entire loop: lease → dispatch → resolve → refuse → skip → consume."""

    def test_full_cycle_end_to_end(self):
        _cleanup_leases()
        wind_id = None
        try:
            # 1. issue
            lease = _issue_lease(budget=2, ttl=180)
            self.assertEqual(lease["status"], "ACTIVE")
            self.assertEqual(lease["consumed_units"], 0)

            # 2. dispatch + resolve
            wind_id = _setup_temp_dispatch()
            resolve_status, ctx = _post(f"{HARNESS_URL}/resolve-context", {"wind_task_id": wind_id})
            self.assertEqual(resolve_status, 200)
            self.assertEqual(ctx.get("role"), ROLE)
            self.assertEqual(ctx.get("harness_id"), "harn-freebuff")

            # 3. /run refuses
            run_status, body = _post(f"{HARNESS_URL}/run", {"wind_task_id": wind_id}, timeout=20)
            self.assertEqual(run_status, 400)
            self.assertIn("interactive-hosted", (body.get("error") or "").lower())

            # 4. scheduler skips
            summary = _run_scheduler_shadow()
            self.assertGreaterEqual(summary.get("skipped_interactive", 0), 1)
            self.assertEqual(summary.get("launched", 0), 0)

            # 5. consume through the accounting boundary
            result = _consume()
            self.assertTrue(result.get("ok"))
            self.assertEqual(result.get("consumed"), 1)
            self.assertFalse(result.get("exhausted", False))

            # 6. verify
            resp = _get(f"{NEBULA_URL}/api/role-leases?role={ROLE}")
            active = [i for i in resp.get("items", []) if i.get("id") == lease["id"]]
            self.assertTrue(active, "lease must still exist after consume")
            self.assertEqual(active[0]["consumed_units"], 1)
            self.assertEqual(active[0]["status"], "ACTIVE")
        finally:
            if wind_id:
                _teardown_temp_dispatch()
            _cleanup_leases()


# ═══════════════════════════════════════════════════════════════════
#  Module-level cleanup guard — never leave test rows behind
# ═══════════════════════════════════════════════════════════════════

def tearDownModule():
    _teardown_temp_dispatch()
    _cleanup_leases()


if __name__ == "__main__":
    unittest.main()
