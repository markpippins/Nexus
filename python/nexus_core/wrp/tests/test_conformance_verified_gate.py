"""
wr-conf-013: verified-model gate conformance — unverified bundles forced
inactive, /test invocation refused, dropdown filter intact.

The verified gate (tackle-ui "run inference test hangs" incident): every
config bundle referenced an unverified model, the sandbox fired opencode
with an unresolvable id, opencode silently died, and the UI hung polling an
empty log. The fix landed at three enforcement layers plus one symptom
layer, and all of them can silently regress:

  L1 — Write-path gates: upsertConfigBundle / upsertConfigBundles /
       upsertAIRoleConfig force is_active=0 for unverified models.
  L2 — DB trigger trg_config_bundle_verified_gate: BEFORE INSERT OR UPDATE
       forces is_active=0 even on raw SQL that bypasses the API.
  L3 — Symptom gate: POST /config/ai/test returns 400 for unverified
       models instead of spawning a doomed opencode run.
  L4 — UI surface: model dropdowns (BundleModal, SessionsPlaygroundTab,
       CircuitSchedulerTab) filter to verified models via
       models.filter(m => m.verified); the AI Registry cards render a
       VERIFIED/UNVERIFIED badge; GET /config/ai/models carries `verified`
       so the filter has data.

This test guards all four layers. Fixtures are synthetic (mod-wr013-* /
cb-wr013-*) created from a real model row's NOT NULL fields and deleted in
tearDown — the live tables are never modified beyond transient fixture
rows, and the global invariant AC6 proves the steady state holds.

    AC1 — API write gate: POST /config/ai/bundle with an unverified model
          + is_active=true → saved row has is_active=0.
    AC2 — API write gate positive: POST /config/ai/bundle with a verified
          model + is_active=true → saved row has is_active=1.
    AC3 — DB trigger: raw SQL INSERT of an unverified-model bundle with
          is_active=1 → forced to 0; UPDATE reactivation attempt blocked;
          the trigger still exists in pg_trigger.
    AC4 — /test 400: POST /config/ai/test with an unverified model →
          HTTP 400 "not verified", and no session row is created.
    AC5 — API surface: GET /config/ai/models returns `verified` on every
          model (the UI filter's data source), with both states present.
    AC6 — Global invariant: no ACTIVE *non-INTERACTIVE* config bundle
          references an unverified model (the 30-bundle sweep + trigger
          steady state; INTERACTIVE bundles are exempt by design — AC8).
    AC7 — Static UI guard: the three dropdown components still filter
          models.filter(m => m.verified); AIRegistryTab still renders the
          VERIFIED/UNVERIFIED badge; the /test route still expresses the
          verified gate structurally.
    AC8 — INTERACTIVE exemption: an INTERACTIVE-invocation bundle (the
          leased-builder channel — dispatched in Freebuff where the model is
          the human/CLI model, never spawned by a harness) STAYS active with
          an unverified model, on both the raw-SQL trigger path and the API
          write path; a CLI bundle with the same model is still forced
          inactive; the live trigger carries the exemption.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_verified_gate.py -v
"""

import json
import os
import sys
import unittest
import urllib.error
import urllib.request

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

_REPO_ROOT = os.path.abspath(os.path.join(_NEXUS_PYTHON, ".."))

TACKLE_URL = os.environ.get("TACKLE_URL", "http://localhost:3410")
DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")

# Fixture identity — anything with these prefixes is ours to create/delete.
_UNVERIFIED_MODEL = "mod-wr013-unverified"
_VERIFIED_MODEL = "mod-wr013-verified"
_BUNDLE_UNVERIFIED = "cb-wr013-unverified"
_BUNDLE_VERIFIED = "cb-wr013-verified"

UI_COMPONENTS = os.path.join(_REPO_ROOT, "angular", "tackle-ui", "src", "components")
SERV_ROUTES = os.path.join(_REPO_ROOT, "typescript", "tackle-srv", "src", "routes", "ai-config.ts")

# A real verified row whose NOT NULL fields we clone for the fixtures.
_SOURCE_MODEL = "mod-gemma4-e2b-opencode-ollama"


def _db():
    import psycopg2
    return psycopg2.connect(DSN)


def _sql(query, params=None):
    """Run a single statement, return all rows (empty list when none).

    params=None skips psycopg2 interpolation entirely — important because
    queries containing a literal % (e.g. LIKE 'cb-wr013-%') crash with
    IndexError when an empty tuple is passed (psycopg2 still tries to
    consume placeholders from it).
    """
    conn = _db()
    try:
        cur = conn.cursor()
        cur.execute(query, params)
        if cur.description:
            rows = cur.fetchall()
        else:
            rows = []
        conn.commit()
        return rows
    finally:
        conn.close()


def _post(path, body, timeout=10):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{TACKLE_URL}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _get(path, timeout=10):
    with urllib.request.urlopen(f"{TACKLE_URL}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def _create_fixture_models():
    """Idempotent + self-healing: (re)create the two fixture models.

    Fields are cloned from a real row so every NOT NULL column is satisfied;
    ON CONFLICT DO UPDATE re-applies the intended verified state in case a
    crashed run left a fixture behind.
    """
    # The clone is only possible while the source row exists — fail loudly
    # (with a clear message) rather than silently cloning nothing.
    src = _sql("SELECT 1 FROM tackle.models WHERE id = %s", (_SOURCE_MODEL,))
    if not src:
        raise AssertionError(
            f"fixture source model {_SOURCE_MODEL!r} is missing — wr-conf-013 "
            "cannot clone its NOT NULL fields. Restore or reseed the model first."
        )
    for mid, verified in ((_UNVERIFIED_MODEL, False), (_VERIFIED_MODEL, True)):
        _sql(
            """
            INSERT INTO tackle.models
                (id, name, harness_id, model_identifier, verified, created_at, updated_at)
            SELECT %s, %s, harness_id, model_identifier, %s, NOW(), NOW()
              FROM tackle.models WHERE id = %s
            ON CONFLICT (id) DO UPDATE SET verified = EXCLUDED.verified,
                updated_at = NOW()
            """,
            (mid, mid, verified, _SOURCE_MODEL),
        )


def _cleanup_fixtures():
    """Delete fixture bundles first (FK on model_id), then the models."""
    _sql("DELETE FROM tackle.config_bundle WHERE id LIKE 'cb-wr013-%'")
    _sql("DELETE FROM tackle.models WHERE id LIKE 'mod-wr013-%'")


def _bundle_is_active(bundle_id):
    rows = _sql(
        "SELECT is_active FROM tackle.config_bundle WHERE id = %s", (bundle_id,)
    )
    return rows[0][0] if rows else None


# ═══════════════════════════════════════════════════════════════════════
#  Shared fixture lifecycle
# ═══════════════════════════════════════════════════════════════════════

class _FixtureTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _create_fixture_models()

    @classmethod
    def tearDownClass(cls):
        _cleanup_fixtures()

    def setUp(self):
        # Fresh per-test: no leftover fixture bundles.
        _sql("DELETE FROM tackle.config_bundle WHERE id LIKE 'cb-wr013-%'")


# ═══════════════════════════════════════════════════════════════════════
#  AC1 — API write gate: unverified bundle forced inactive
# ═══════════════════════════════════════════════════════════════════════

class TestAc1ApiWriteGateForcesInactive(_FixtureTestCase):

    def test_bundle_with_unverified_model_saves_inactive(self):
        """POST /config/ai/bundle is_active=true + unverified model → 0."""
        resp = _post("/config/ai/bundle", {
            "id": _BUNDLE_UNVERIFIED,
            "name": "wr-conf-013 unverified gate",
            "role": "test",
            "model_id": _UNVERIFIED_MODEL,
            "is_active": True,
        })
        self.assertTrue(resp.get("saved"))
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 0,
                         "unverified model must force is_active=0 through the API")


# ═══════════════════════════════════════════════════════════════════════
#  AC2 — API write gate positive: verified bundle stays active
# ═══════════════════════════════════════════════════════════════════════

class TestAc2ApiWriteGateKeepsVerifiedActive(_FixtureTestCase):

    def test_bundle_with_verified_model_saves_active(self):
        """POST /config/ai/bundle is_active=true + verified model → 1."""
        resp = _post("/config/ai/bundle", {
            "id": _BUNDLE_VERIFIED,
            "name": "wr-conf-013 verified gate",
            "role": "test",
            "model_id": _VERIFIED_MODEL,
            "is_active": True,
        })
        self.assertTrue(resp.get("saved"))
        self.assertEqual(_bundle_is_active(_BUNDLE_VERIFIED), 1,
                         "verified model must keep is_active=1 through the API")

    def test_verified_bundle_explicit_inactive_respected(self):
        """is_active=false is still respected for verified models."""
        _post("/config/ai/bundle", {
            "id": _BUNDLE_VERIFIED,
            "name": "wr-conf-013 verified inactive",
            "role": "test",
            "model_id": _VERIFIED_MODEL,
            "is_active": False,
        })
        self.assertEqual(_bundle_is_active(_BUNDLE_VERIFIED), 0,
                         "explicit is_active=false must be honored for verified models")


# ═══════════════════════════════════════════════════════════════════════
#  AC3 — DB trigger: gate holds even on raw SQL bypassing the API
# ═══════════════════════════════════════════════════════════════════════

class TestAc3DbTriggerRawSql(_FixtureTestCase):

    def test_trigger_exists(self):
        rows = _sql(
            "SELECT 1 FROM pg_trigger WHERE tgname = 'trg_config_bundle_verified_gate'"
        )
        self.assertEqual(len(rows), 1,
                         "trigger trg_config_bundle_verified_gate must exist")

    def test_raw_insert_with_unverified_model_forced_inactive(self):
        """Direct SQL INSERT with is_active=1 + unverified model → 0."""
        _sql(
            "INSERT INTO tackle.config_bundle"
            " (id, name, role, model_id, is_active, created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, 1, NOW(), NOW())",
            (_BUNDLE_UNVERIFIED, "raw unverified", "test", _UNVERIFIED_MODEL),
        )
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 0,
                         "raw INSERT of unverified-model bundle must be forced inactive")

    def test_raw_reactivation_attempt_blocked(self):
        """UPDATE trying to re-activate an unverified-model bundle → still 0."""
        _sql(
            "INSERT INTO tackle.config_bundle"
            " (id, name, role, model_id, is_active, created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, 0, NOW(), NOW())",
            (_BUNDLE_UNVERIFIED, "raw unverified", "test", _UNVERIFIED_MODEL),
        )
        _sql(
            "UPDATE tackle.config_bundle SET is_active = 1, updated_at = NOW()"
            " WHERE id = %s",
            (_BUNDLE_UNVERIFIED,),
        )
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 0,
                         "reactivation of an unverified-model bundle must be blocked")

    def test_raw_insert_with_verified_model_stays_active(self):
        """Direct SQL INSERT with verified model + is_active=1 → 1."""
        _sql(
            "INSERT INTO tackle.config_bundle"
            " (id, name, role, model_id, is_active, created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, 1, NOW(), NOW())",
            (_BUNDLE_VERIFIED, "raw verified", "test", _VERIFIED_MODEL),
        )
        self.assertEqual(_bundle_is_active(_BUNDLE_VERIFIED), 1,
                         "raw INSERT of verified-model bundle must stay active")


# ═══════════════════════════════════════════════════════════════════════
#  AC4 — /test 400: unverified models refused before any spawn
# ═══════════════════════════════════════════════════════════════════════

class TestAc4TestInvokeRefused(_FixtureTestCase):

    def test_unverified_model_test_returns_400(self):
        """POST /config/ai/test with an unverified model → HTTP 400."""
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            _post("/config/ai/test", {
                "model_id": _UNVERIFIED_MODEL,
                "test_prompt": "say hello",
            })
        self.assertEqual(ctx.exception.code, 400,
                         "unverified model must be refused with 400")
        body = ctx.exception.read().decode()
        self.assertIn("not verified", body.lower(),
                      "400 body must explain the verification refusal")

    def test_no_session_row_created_for_refused_test(self):
        """The 400 fires before spawn — no session row for the model."""
        with self.assertRaises(urllib.error.HTTPError):
            _post("/config/ai/test", {
                "model_id": _UNVERIFIED_MODEL,
                "test_prompt": "say hello",
            })
        # The 400 fires before startSession, so no session row may exist for
        # the refused run. Scope by the session-id prefix the /test route
        # would have used (`test-{model_id}-{ts}`) — probing the identifier
        # is not enough because real history may legitimately hold sessions
        # for the cloned identifier (e.g. verify runs of the source model).
        rows = _sql(
            "SELECT COUNT(*) FROM tackle.sessions WHERE id LIKE %s",
            (f"test-{_UNVERIFIED_MODEL}-%",),
        )
        self.assertEqual(rows[0][0], 0,
                         "refused test must not create a session row")


# ═══════════════════════════════════════════════════════════════════════
#  AC5 — API surface: /models carries `verified` for the UI filter
# ═══════════════════════════════════════════════════════════════════════

class TestAc5ModelsApiSurface(_FixtureTestCase):

    def test_every_model_carries_verified_field(self):
        models = _get("/config/ai/models")
        self.assertGreaterEqual(len(models), 2)
        for m in models:
            self.assertIn("verified", m,
                          f"model {m.get('id')} must carry the verified field")

    def test_both_verified_states_present(self):
        models = _get("/config/ai/models")
        states = {bool(m.get("verified")) for m in models}
        self.assertTrue(True in states, "at least one verified model must exist")
        self.assertTrue(False in states, "at least one unverified model must exist")

    def test_fixture_models_reflected(self):
        """The API sees our synthetic fixtures with the intended states."""
        models = _get("/config/ai/models")
        by_id = {m["id"]: m for m in models}
        self.assertIn(_UNVERIFIED_MODEL, by_id)
        self.assertIn(_VERIFIED_MODEL, by_id)
        self.assertFalse(by_id[_UNVERIFIED_MODEL]["verified"])
        self.assertTrue(by_id[_VERIFIED_MODEL]["verified"])


# ═══════════════════════════════════════════════════════════════════════
#  AC6 — Global invariant: no active bundle references an unverified model
# ═══════════════════════════════════════════════════════════════════════

class TestAc6GlobalInvariant(unittest.TestCase):
    """Independent of fixtures: the steady state must hold on every run.

    Note: this class does NOT use _FixtureTestCase's model creation, but the
    fixture models may exist from a prior class — if so they are deleted by
    that class's tearDownClass before this runs. Order-independence is
    guaranteed by scoping the query to ALL bundles: any active bundle whose
    model is unverified violates the invariant, fixtures or not.
    """

    def test_no_active_bundle_points_at_unverified_model(self):
        rows = _sql(
            "SELECT COUNT(*) FROM tackle.config_bundle cb"
            " JOIN tackle.models m ON m.id = cb.model_id"
            " WHERE cb.is_active = 1 AND (m.verified IS NOT TRUE)"
            "   AND cb.invocation_mode <> 'INTERACTIVE'"
        )
        self.assertEqual(rows[0][0], 0,
                         "active non-INTERACTIVE bundle referencing an unverified"
                         " model violates the gate (INTERACTIVE is exempt — AC8)")


# ═══════════════════════════════════════════════════════════════════════
#  AC7 — Static guards: the UI filter, the badge, and the /test gate
# ═══════════════════════════════════════════════════════════════════════

class TestAc7StaticUiGuards(unittest.TestCase):
    """Source-level probes — a hand-edit that drops the filter or the 400
    gate is caught here even if the live services are down."""

    FILTER_EXPR = "models.filter(m => m.verified)"

    def _component(self, name):
        path = os.path.join(UI_COMPONENTS, name)
        self.assertTrue(os.path.exists(path), f"component source missing: {path}")
        return open(path, encoding="utf-8").read()

    def test_dropdown_components_filter_verified(self):
        for comp in ("BundleModal.tsx", "SessionsPlaygroundTab.tsx",
                     "CircuitSchedulerTab.tsx"):
            src = self._component(comp)
            self.assertIn(self.FILTER_EXPR, src,
                          f"{comp} must filter model dropdowns to verified models")

    def test_registry_renders_verified_badge(self):
        src = self._component("AIRegistryTab.tsx")
        self.assertIn("'VERIFIED'", src, "AIRegistryTab must render VERIFIED")
        self.assertIn("'UNVERIFIED'", src, "AIRegistryTab must render UNVERIFIED")

    def test_test_route_expresses_verified_gate(self):
        self.assertTrue(os.path.exists(SERV_ROUTES),
                        f"tackle-srv routes missing: {SERV_ROUTES}")
        src = open(SERV_ROUTES, encoding="utf-8").read()
        self.assertIn("if (!model.verified)", src,
                      "/test route must refuse unverified models")
        self.assertIn("is not verified", src,
                      "/test refusal must carry the not-verified explanation")


# ═══════════════════════════════════════════════════════════════════════
#  AC8 — INTERACTIVE exemption: the gate must NOT apply to Freebuff dispatch
# ═══════════════════════════════════════════════════════════════════════

class TestAc8InteractiveExemption(_FixtureTestCase):
    """The verified gate exists to stop opencode spawning dead model ids.
    INTERACTIVE bundles (harn-freebuff, the leased-builder channel) never
    spawn a harness — the model is the human/CLI model in Freebuff — so an
    unverified-model INTERACTIVE bundle must stay active. The interactive
    guard suites (wr-conf-005/007) depend on this: cb-leased-builder-
    interactive is INTERACTIVE + mod-glm-5-2 (unverified) and must resolve."""

    def test_raw_sql_interactive_bundle_stays_active(self):
        """Raw INSERT of an INTERACTIVE bundle w/ unverified model → 1."""
        _sql(
            "INSERT INTO tackle.config_bundle"
            " (id, name, role, model_id, invocation_mode, is_active,"
            " created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, 'INTERACTIVE', 1, NOW(), NOW())",
            (_BUNDLE_UNVERIFIED, "interactive", "test", _UNVERIFIED_MODEL),
        )
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 1,
                         "INTERACTIVE bundle must be exempt from the verified gate")

    def test_api_interactive_bundle_stays_active(self):
        """POST /bundle with invocation_mode=INTERACTIVE + unverified → 1."""
        resp = _post("/config/ai/bundle", {
            "id": _BUNDLE_UNVERIFIED,
            "name": "wr-conf-013 interactive exemption",
            "role": "test",
            "model_id": _UNVERIFIED_MODEL,
            "invocation_mode": "INTERACTIVE",
            "is_active": True,
        })
        self.assertTrue(resp.get("saved"))
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 1,
                         "API must honor the INTERACTIVE exemption")

    def test_cli_bundle_same_model_still_gated(self):
        """The same unverified model via a CLI bundle → forced 0."""
        _sql(
            "INSERT INTO tackle.config_bundle"
            " (id, name, role, model_id, invocation_mode, is_active,"
            " created_at, updated_at)"
            " VALUES (%s, %s, %s, %s, 'CLI', 1, NOW(), NOW())",
            (_BUNDLE_UNVERIFIED, "cli", "test", _UNVERIFIED_MODEL),
        )
        self.assertEqual(_bundle_is_active(_BUNDLE_UNVERIFIED), 0,
                         "non-INTERACTIVE bundles keep the verified gate")

    def test_live_trigger_carries_exemption(self):
        """The deployed trigger function contains the INTERACTIVE branch."""
        rows = _sql(
            "SELECT pg_get_functiondef(p.oid) FROM pg_proc p"
            " JOIN pg_trigger t ON t.tgfoid = p.oid"
            " WHERE t.tgname = 'trg_config_bundle_verified_gate'"
        )
        self.assertEqual(len(rows), 1)
        self.assertIn("INTERACTIVE", rows[0][0],
                      "live trigger must carry the INTERACTIVE exemption")

    def test_trigger_source_carries_exemption(self):
        """The migration source still expresses the exemption (green-field
        and restart-recovery parity)."""
        src = open(os.path.join(
            _REPO_ROOT, "typescript", "tackle-srv", "src", "db.ts"),
            encoding="utf-8").read()
        self.assertIn("version: 17", src, "migration v17 must exist")
        self.assertIn("NEW.invocation_mode = 'INTERACTIVE'", src,
                      "migration v17 must express the INTERACTIVE exemption")


if __name__ == "__main__":
    unittest.main()
