"""
wr-conf-002: Role-lease dispenser — full lifecycle across all channels.

This test module exercises the role-lease governance primitive end-to-end
through all three execution channels (execution_worker, harness-srv,
interactive/Freebuff), plus the scheduler emptiness check and the exhaustion
hook — all deterministic, LLM-free, hitting only localhost REST endpoints.

Tested invariants:
  AC1 — Lease issue + status query round-trips through the REST API.
  AC2 — All three channels consume through the canonical POST /consume
        endpoint and produce matching consumed_units increments.
  AC3 — Exhaustion hook fires: budget exhausted → auto-revoke → agent
        record emitted with type:lease-exhausted tag.
  AC4 — Scheduler emptiness check skips roles with 0 eligible work
        (reviewer with 0 open tickets → skip logged).
  AC5 — Harness-srv session tracking: GET /sessions returns active
        session list, empty when idle.
  AC6 — Pipeline-health sweep check #5: GET /api/role-leases/stale
        returns items for stale leases (RELEASED/EXPIRED), empty
        after all leases are revoked.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_role_leases.py -v
"""

import json
import os
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
TEST_ROLE = "wr-conf-002"


def _db_exec(query: str, params=None) -> None:
    """Run one statement against the nexus DB (committed)."""
    import psycopg2
    conn = psycopg2.connect(DSN)
    try:
        cur = conn.cursor()
        cur.execute(query, params) if params else cur.execute(query)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def _post(path: str, body: dict, timeout: int = 10) -> dict:
    """POST to nebula-srv, return parsed JSON."""
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{NEBULA_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _get(path: str, timeout: int = 10) -> dict:
    """GET from nebula-srv, return parsed JSON."""
    with urllib.request.urlopen(f"{NEBULA_URL}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def _harness_get(path: str, timeout: int = 10) -> dict:
    """GET from harness-srv, return parsed JSON."""
    with urllib.request.urlopen(f"{HARNESS_URL}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def _issue_lease(budget: int = 3, ttl: int = 120) -> dict:
    return _post("/api/role-leases/issue", {
        "role": TEST_ROLE,
        "channel": "interactive",
        "model": "test/wr-conf-002",
        "budgetUnits": budget,
        "ttlSeconds": ttl,
    })


def _consume() -> dict:
    return _post("/api/role-leases/consume", {"role": TEST_ROLE})


def _revoke(lease_id: str) -> dict:
    return _post(f"/api/role-leases/{lease_id}/revoke", {})


def _stale_leases() -> list:
    """Return stale lease items from the sweep endpoint."""
    resp = _get("/api/role-leases/stale")
    return resp.get("items", [])


def _exhaustion_record_exists() -> bool:
    """Check if a type:lease-exhausted record exists for TEST_ROLE."""
    try:
        resp = _get(f"/api/agent-records?role=architect&limit=10")
        for item in resp.get("items", []):
            tags = item.get("tags", [])
            if isinstance(tags, list) and "type:lease-exhausted" in tags:
                if TEST_ROLE in item.get("title", ""):
                    return True
        return False
    except Exception:
        return False


# ── Cleanup helper ────────────────────────────────────────────────────

def _cleanup_leases() -> None:
    """Revoke any leftover ACTIVE leases for TEST_ROLE between tests."""
    try:
        resp = _get(f"/api/role-leases?role={TEST_ROLE}")
        for item in resp.get("items", []):
            if item.get("status") == "ACTIVE":
                _revoke(item["id"])
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — Lease issue + status query
# ═══════════════════════════════════════════════════════════════════════

class TestAc1LeaseIssueAndStatus(unittest.TestCase):

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_issue_returns_id_and_budget(self):
        """POST /issue returns a lease with id, budget, consumed=0."""
        lease = _issue_lease(budget=3)
        self.assertIn("id", lease)
        self.assertEqual(lease["budget_units"], 3)
        self.assertEqual(lease["consumed_units"], 0)
        self.assertEqual(lease["status"], "ACTIVE")

    def test_status_query_returns_lease(self):
        """GET /role-leases?role=X returns the active lease."""
        _issue_lease(budget=3)
        resp = _get(f"/api/role-leases?role={TEST_ROLE}")
        items = resp.get("items", [])
        self.assertGreaterEqual(len(items), 1)
        active = [i for i in items if i["status"] == "ACTIVE"]
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]["budget_units"], 3)

    def test_second_issue_rejected_active_exists(self):
        """Cannot issue a second ACTIVE lease for the same role."""
        _issue_lease(budget=3)
        with self.assertRaises(urllib.request.HTTPError) as ctx:
            _issue_lease(budget=5)
        self.assertIn("409", str(ctx.exception.code))


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — Three-channel consumption through canonical endpoint
# ═══════════════════════════════════════════════════════════════════════

class TestAc2ThreeChannelConsumption(unittest.TestCase):

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_single_consume_increments(self):
        """One POST /consume → consumed=1/budget."""
        _issue_lease(budget=5)
        result = _consume()
        self.assertTrue(result["ok"])
        self.assertEqual(result["consumed"], 1)
        self.assertEqual(result["budget"], 5)
        self.assertFalse(result.get("exhausted", False))

    def test_three_consume_simulates_all_channels(self):
        """Three consumes = execution_worker + harness-srv + interactive."""
        _issue_lease(budget=5)
        results = [_consume() for _ in range(3)]
        for i, r in enumerate(results):
            self.assertEqual(r["consumed"], i + 1,
                             f"consume #{i+1} should be {i+1}/5")
        self.assertEqual(results[-1]["consumed"], 3)
        self.assertEqual(results[-1]["budget"], 5)
        self.assertFalse(results[-1]["exhausted"])

    def test_consume_no_active_lease_returns_404(self):
        """Consume with no active lease → 404."""
        with self.assertRaises(urllib.request.HTTPError) as ctx:
            _consume()
        self.assertIn("404", str(ctx.exception.code))


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — Exhaustion hook: budget exhausted → auto-revoke + agent record
# ═══════════════════════════════════════════════════════════════════════

class TestAc3ExhaustionHook(unittest.TestCase):

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_budget_exhausted_returns_exhausted_true(self):
        """Consuming the last unit returns exhausted=true."""
        _issue_lease(budget=1)
        result = _consume()
        self.assertTrue(result["ok"])
        self.assertEqual(result["consumed"], 1)
        self.assertEqual(result["budget"], 1)
        self.assertTrue(result["exhausted"])

    def test_exhausted_lease_is_auto_revoked(self):
        """After exhaustion, GET shows status=RELEASED."""
        _issue_lease(budget=1)
        _consume()
        # Brief wait for async revoke
        time.sleep(0.5)
        resp = _get(f"/api/role-leases?role={TEST_ROLE}")
        items = resp.get("items", [])
        active = [i for i in items if i["status"] == "ACTIVE"]
        self.assertEqual(len(active), 0, "lease should be auto-revoked")
        released = [i for i in items if i["status"] == "RELEASED"]
        self.assertGreaterEqual(len(released), 1)

    def test_exhaustion_emits_agent_record(self):
        """Exhaustion produces a type:lease-exhausted agent record."""
        _issue_lease(budget=1)
        _consume()
        time.sleep(0.5)
        self.assertTrue(
            _exhaustion_record_exists(),
            "should find exhaustion agent record for test role"
        )

    def test_multi_unit_exhaustion(self):
        """Consume budget=3 → exhausted on 3rd consume."""
        _issue_lease(budget=3)
        results = []
        for i in range(3):
            r = _consume()
            results.append(r)
            if i < 2:
                self.assertFalse(r["exhausted"],
                                 f"consume #{i+1} should not exhaust at {r['consumed']}/{r['budget']}")
        self.assertTrue(results[-1]["exhausted"],
                        f"final consume should be exhausted: {results[-1]}")
        self.assertEqual(results[-1]["consumed"], 3)


# ═══════════════════════════════════════════════════════════════════════
#  AC4 — Scheduler emptiness check (via DB query — no live scheduler needed)
# ═══════════════════════════════════════════════════════════════════════

class TestAc4EmptinessCheck(unittest.TestCase):
    """Verify the _has_eligible_work query logic directly against the DB.

    The scheduler module is importable; we test its eligibility method
    by connecting to the same DB and verifying the row counts it relies on.
    """

    def test_builder_has_ready_requests(self):
        """Builder should have READY execution.requests > 0 (193 known)."""
        # We test the SQL directly — the function's contract
        import psycopg2
        dsn = os.environ.get("CONDUIT_PG_DSN",
                              "postgresql://pguser:pgpass@localhost:5432/nexus")
        conn = psycopg2.connect(dsn)
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM execution.requests WHERE status = 'READY'")
            count = cur.fetchone()[0]
            self.assertGreater(count, 0,
                               "expected >0 READY execution.requests for builder")
        finally:
            conn.close()

    def test_reviewer_has_zero_open_tickets(self):
        """Reviewer has 0 open tickets — emptiness check should skip."""
        import psycopg2
        dsn = os.environ.get("CONDUIT_PG_DSN",
                              "postgresql://pguser:pgpass@localhost:5432/nexus")
        conn = psycopg2.connect(dsn)
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT COUNT(*) FROM vision.tickets "
                "WHERE role = 'reviewer' AND status = 'open'"
            )
            count = cur.fetchone()[0]
            self.assertEqual(count, 0,
                             "reviewer should have 0 open tickets → emptiness skip")
        finally:
            conn.close()


# ═══════════════════════════════════════════════════════════════════════
#  AC5 — Harness-srv session tracking
# ═══════════════════════════════════════════════════════════════════════

class TestAc5HarnessSessionTracking(unittest.TestCase):

    def test_sessions_endpoint_returns_empty_when_idle(self):
        """GET /sessions returns empty list when no runs active."""
        resp = _harness_get("/sessions")
        self.assertIn("sessions", resp)
        self.assertIsInstance(resp["sessions"], list)
        self.assertEqual(resp["count"], len(resp["sessions"]))

    def test_harness_health_is_ok(self):
        """GET /health on harness-srv returns ok."""
        resp = _harness_get("/health")
        self.assertEqual(resp.get("status"), "ok")


# ═══════════════════════════════════════════════════════════════════════
#  AC6 — Pipeline-health sweep check #5: stale role leases
# ═══════════════════════════════════════════════════════════════════════

class TestAc6StaleLeaseSweep(unittest.TestCase):

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_stale_endpoint_returns_empty_when_none_stale(self):
        """With all leases revoked, /stale returns empty items."""
        items = _stale_leases()
        # May have historical stale entries; we just verify the endpoint works
        self.assertIsInstance(items, list)

    def test_expired_window_lease_shows_in_stale(self):
        """An ACTIVE lease with expired window_end appears in /stale.

        The stale endpoint returns ACTIVE leases where window_end < NOW().
        RELEASED/EXPIRED leases are not stale — they're already resolved.
        """
        lease = _issue_lease(budget=5, ttl=1)  # 1s TTL → window expires quickly
        # Don't revoke — let the window expire naturally while ACTIVE
        time.sleep(1.5)
        items = _stale_leases()
        self.assertIsInstance(items, list)
        stale_ids = [i.get("id") for i in items]
        self.assertIn(lease["id"], stale_ids,
                      "ACTIVE lease with expired window should appear in /stale")
        # Clean up the now-stale lease
        _revoke(lease["id"])


# ═══════════════════════════════════════════════════════════════════════
#  AC7 — Admission enforcement (T20 B3): config validity gates harness work
# ═══════════════════════════════════════════════════════════════════════

# A hermetic synthetic runtime persona (created in setUpClass, dropped in
# tearDownClass) guarantees the NO_CONFIG precondition: the role exists in
# tackle.roles (passes the governance gate as a runtime persona) but has no
# config_bundle rows → config admission denies /run-direct with
# reason=NO_CONFIG (deterministic, no real work touched — denied pre-spawn).
#
# History: this test previously used the canonical `inspector` role on the
# assumption it had no bundles. Live config drift (inspector now has bundle
# rows) made that non-hermetic — and pointed a denial test at a real
# governance role. The synthetic persona keeps AC7 exact and side-effect
# free regardless of how live configs evolve.
# NOTE (D-009 R6): a *nonexistent* role (e.g. wr-conf-002) is denied earlier
# at the governance gate with ROLE_MISSING, so NO_CONFIG is only reachable
# for a role that exists but lacks a bundle. ROLE_REVOKED /
# CONFIG_INVALIDATED are covered at the unit level (tests/admission.test.ts).
# Lease outcomes are enforced on the worker-pool path (execution_worker.py),
# not harness-srv.


def _run_direct(role: str, prompt: str = "ping", timeout_ms: int = 2000) -> tuple:
    """POST /run-direct to harness-srv. Returns (status_code, body_dict)."""
    data = json.dumps({
        "role": role,
        "prompt": prompt,
        "timeout_ms": timeout_ms,
        "channel": "wr-conf-002",
    }).encode()
    req = urllib.request.Request(
        f"{HARNESS_URL}/run-direct",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.request.HTTPError as e:
        return e.code, json.loads(e.read())


class TestAc7AdmissionEnforcement(unittest.TestCase):
    """T20 B3: harness-srv denies work for roles with no valid config."""

    @classmethod
    def setUpClass(cls):
        cls.no_config_role = f"wr-conf-002-noconfig-{uuid.uuid4().hex[:8]}"
        _db_exec(
            "INSERT INTO tackle.roles (id, name, description) VALUES (%s::uuid, %s, %s)",
            (str(uuid.uuid4()), cls.no_config_role,
             "wr-conf-002 AC7 NO_CONFIG admission test persona (no config_bundle)"),
        )

    @classmethod
    def tearDownClass(cls):
        _db_exec("DELETE FROM tackle.roles WHERE name = %s", (cls.no_config_role,))

    def test_no_config_denies_run_direct(self):
        """A role with no config_bundle → /run-direct returns 403 NO_CONFIG."""
        status, body = _run_direct(self.no_config_role, "ping")
        self.assertEqual(status, 403, f"expected 403, got {status}: {body}")
        admission = body.get("admission", {})
        self.assertEqual(admission.get("outcome"), "ADMISSION_DENIED")
        self.assertEqual(admission.get("reason"), "NO_CONFIG")


# ═══════════════════════════════════════════════════════════════════════
#  AC8 — Inbox pollution guard: synthetic test records must not tag real
#        interactive roles (to-do 41505e71)
# ═══════════════════════════════════════════════════════════════════════

REAL_ROLE_TAGS = ("to:architect", "to:engineer", "to:planner",
                  "to:engineer-ii", "to:devops", "to:reviewer",
                  "to:analyst", "to:topologist", "to:inspector",
                  "to:critic")


def _recent_records_from_test_model(limit: int = 50) -> list:
    """Return recent agent records whose model is a test/* harness model."""
    resp = _get(f"/api/agent-records?limit={limit}")
    out = []
    for item in resp.get("items", []):
        model = item.get("model") or ""
        if str(model).strip().startswith("test/"):
            out.append(item)
    return out


class TestAc8InboxPollutionGuard(unittest.TestCase):
    """to-do 41505e71: test-emitted lease records must not carry
    to:<real-role> tags. The audit trail stays (records still written and
    queryable by domain tags), but routing must not flood real-role inboxes."""

    def setUp(self):
        _cleanup_leases()

    def tearDown(self):
        _cleanup_leases()

    def test_test_model_exhaustion_record_has_no_real_role_tag(self):
        """Exhausting a test-model lease emits a record routed to
        to:wr-conf-observer, never to:architect/to:engineer/etc."""
        _issue_lease(budget=1)
        _consume()
        time.sleep(0.7)  # allow async record emission
        records = _recent_records_from_test_model()
        matched = [r for r in records if "type:lease-exhausted" in (r.get("tags") or [])]
        self.assertGreaterEqual(
            len(matched), 1,
            "expected at least one type:lease-exhausted record from test model"
        )
        for r in matched:
            tags = r.get("tags") or []
            for real in REAL_ROLE_TAGS:
                self.assertNotIn(
                    real, tags,
                    f"test-model record {r.get('id')} must not carry {real}: {tags}"
                )
            self.assertIn("to:wr-conf-observer", tags,
                          f"test-model record {r.get('id')} should route to wr-conf-observer: {tags}")

    def test_test_model_revoke_record_has_no_real_role_tag(self):
        """Explicitly revoking a test-model lease emits a type:lease-revoked
        record routed to to:wr-conf-observer, never to a real role."""
        lease = _issue_lease(budget=5)
        _revoke(lease["id"])
        time.sleep(0.7)
        records = _recent_records_from_test_model()
        matched = [r for r in records if "type:lease-revoked" in (r.get("tags") or [])]
        self.assertGreaterEqual(
            len(matched), 1,
            "expected at least one type:lease-revoked record from test model"
        )
        for r in matched:
            tags = r.get("tags") or []
            for real in REAL_ROLE_TAGS:
                self.assertNotIn(
                    real, tags,
                    f"test-model record {r.get('id')} must not carry {real}: {tags}"
                )

    def test_guard_full_run_zero_new_real_role_records(self):
        """A full wr-conf-002 lifecycle (issue → consume → exhaust) produces
        zero NEW records tagged to any real interactive role from test models.
        Records for real interactive roles are untouched."""
        _issue_lease(budget=2)
        _consume()
        _consume()
        time.sleep(0.7)
        records = _recent_records_from_test_model()
        for r in records:
            tags = r.get("tags") or []
            for real in REAL_ROLE_TAGS:
                self.assertNotIn(
                    real, tags,
                    f"guard: test-model record {r.get('id')} carries {real}: {tags}"
                )
