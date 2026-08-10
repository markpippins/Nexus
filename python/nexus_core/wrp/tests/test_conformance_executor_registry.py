"""
wr-conf-009: executor-registry conformance — LOSM's executor set vs the
canonical WRP registry (tackle.roles), guarded against drift.

wr-conf-008's LOSM leg surfaced that LOSM's exec-compat pass checked a
stale hardcoded executor set (missing engineer/watchdog/leased-builder,
containing archivist) while the canonical path already has a richer,
live registry: tackle.roles + tackle.config_bundle + tackle.harnesses
(role → model/harness/invocation_mode). The adopted decision (thread
a4232e3d follow-up): DO NOT adopt LOSM's registry as canonical — hydrate
LOSM FROM the canonical registry instead, keeping LOSM advisory.

This test locks that decision in:

  AC1 — Subset guard: every role in losm_ir's DEFAULT_KNOWN_EXECUTORS must
        exist in the live tackle.roles table. If the canonical registry
        renames/removes an executor role, this fails loudly instead of
        silently WARN-ing forever.
  AC2 — WARN contract: an unknown executor in pass 5 compiles with
        success=True + a warning (never an error), and G2 reports it as a
        WARN violation (never ERROR) — validation stays advisory.
  AC3 — Hydration: passing the live tackle.roles set into
        pass_execution_compatibility / InvariantEngine silences warnings
        for roles that exist canonically but outside the default set
        (e.g. auditor) — proving canonical callers can hydrate.

Deterministic and LLM-free. Requires the live DB (CONDUIT_PG_DSN), like
wr-conf-001/004/005/007.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_executor_registry.py -v
"""
import os
import sys
import unittest

# --- LOSM import bootstrap (same pattern as wr-conf-008) ---------------------
_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_VISION = os.path.abspath(os.path.join(_TESTS_DIR, "..", "..", "..", "vision"))
for _p in (_VISION, os.path.join(_VISION, "losm-ir", "src")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from losm_ir.compiler import compile_dag                                    # noqa: E402
from losm_ir.executor_registry import DEFAULT_KNOWN_EXECUTORS               # noqa: E402
from losm_ir.invariant import (                                             # noqa: E402
    Invariant, InvariantEngine, InvariantRegistry,
    InvariantSeverity, InvariantType,
)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")


def _live_tackle_roles():
    """Query the canonical executor registry (tackle.roles) from the DB."""
    import psycopg2
    conn = psycopg2.connect(DSN)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM tackle.roles")
            return {row[0] for row in cur.fetchall()}
    finally:
        conn.close()


def _nodes(executor="builder"):
    return [
        {"wr_id": "wr-conf-009-specify", "intent": "specify service",
         "status": "INTAKE", "priority": 5, "parent_request_id": None,
         "metadata": {"executor": executor}},
        {"wr_id": "wr-conf-009-build", "intent": "build service",
         "status": "PLAN_GENERATION", "priority": 5,
         "parent_request_id": "wr-conf-009-specify",
         "metadata": {"executor": executor}},
    ]


def _edges():
    return [
        {"parent_wr_id": "wr-conf-009-specify", "child_wr_id": "wr-conf-009-build"},
    ]


def _governance_invariant():
    return Invariant(
        invariant_id="g-executors",
        name="executor assignment",
        description="all non-terminal nodes need a known executor",
        invariant_type=InvariantType.GOVERNANCE,
        severity=InvariantSeverity.ERROR,
        depends_on=[],
    )


class TestAc1SubsetGuard(unittest.TestCase):
    """AC1 — LOSM's executor set must stay a subset of live tackle.roles."""

    def test_known_executors_subset_of_live_roles(self):
        live = _live_tackle_roles()
        missing = DEFAULT_KNOWN_EXECUTORS - live
        self.assertEqual(
            missing, set(),
            f"LOSM executors missing from canonical tackle.roles: {sorted(missing)}"
            " — reconcile losm_ir/executor_registry.py with the registry,"
            " or add the role to tackle.roles (conduit-mcp migration v25 seeds).")

    def test_known_executors_are_nonempty_and_lowercase(self):
        self.assertGreater(len(DEFAULT_KNOWN_EXECUTORS), 0)
        for e in DEFAULT_KNOWN_EXECUTORS:
            self.assertEqual(e, e.lower(), f"executor {e!r} must be lowercase")

    def test_key_executors_present(self):
        # The roles the wr-conf series actually exercises must be registered.
        self.assertIn("builder", DEFAULT_KNOWN_EXECUTORS)
        self.assertIn("engineer", DEFAULT_KNOWN_EXECUTORS)
        self.assertIn("leased-builder", DEFAULT_KNOWN_EXECUTORS)


class TestAc2WarnContract(unittest.TestCase):
    """AC2 — unknown executors WARN (advisory), never block compilation."""

    def test_unknown_executor_compiles_with_warning(self):
        result = compile_dag(_nodes(executor="meep-construction"), _edges(),
                             tenant_id="conformance", trace_id="wr-conf-009")
        self.assertTrue(result.success, f"unknown executor must not error: {result.errors}")
        self.assertTrue(any("unknown executor" in w for w in result.warnings),
                        f"expected unknown-executor WARN, got: {result.warnings}")

    def test_unknown_executor_is_warn_severity_in_g2(self):
        result = compile_dag(_nodes(executor="meep-construction"), _edges(),
                             tenant_id="conformance", trace_id="wr-conf-009")
        engine = InvariantEngine()
        registry = InvariantRegistry(invariants={})
        registry.register(_governance_invariant())
        results = engine.validate_all(registry, result.dag)
        g2 = [r for r in results if r.invariant_id == "g-executors"]
        self.assertEqual(len(g2), 1)
        g2_violations = [v for v in g2[0].violations if v.rule_id == "G2"]
        self.assertGreater(len(g2_violations), 0)
        for v in g2_violations:
            self.assertEqual(v.severity, InvariantSeverity.WARN,
                             f"G2 must WARN on unknown executor, got severity {v.severity}")
            self.assertNotEqual(v.severity, InvariantSeverity.ERROR)


class TestAc3Hydration(unittest.TestCase):
    """AC3 — canonical callers can hydrate LOSM with the live registry."""

    def test_live_roles_hydration_silences_canonical_unknowns(self):
        live = _live_tackle_roles()
        # auditor exists canonically but outside DEFAULT_KNOWN_EXECUTORS.
        self.assertIn("auditor", live)
        self.assertNotIn("auditor", DEFAULT_KNOWN_EXECUTORS)

        # pass 5 with the default set warns…
        result_default = compile_dag(_nodes(executor="auditor"), _edges(),
                                     tenant_id="conformance", trace_id="wr-conf-009")
        self.assertTrue(result_default.success)
        self.assertTrue(any("unknown executor" in w for w in result_default.warnings))

        # …and with the live set hydrated, the same DAG compiles clean.
        result_hydrated = compile_dag(
            _nodes(executor="auditor"), _edges(),
            tenant_id="conformance", trace_id="wr-conf-009",
            known_executors=live,
        )
        self.assertTrue(result_hydrated.success)
        self.assertFalse(any("unknown executor" in w for w in result_hydrated.warnings),
                         f"hydration must silence canonical executors: {result_hydrated.warnings}")

    def test_engine_hydration_clears_g2_violation(self):
        live = _live_tackle_roles()
        result = compile_dag(_nodes(executor="auditor"), _edges(),
                             tenant_id="conformance", trace_id="wr-conf-009")

        engine_default = InvariantEngine()
        registry_default = InvariantRegistry(invariants={})
        registry_default.register(_governance_invariant())
        g2_default = engine_default.validate_all(registry_default, result.dag)[0]
        self.assertTrue(any(v.rule_id == "G2" for v in g2_default.violations),
                        "default engine should flag auditor as unknown")

        engine_hydrated = InvariantEngine(known_executors=live)
        registry_hydrated = InvariantRegistry(invariants={})
        registry_hydrated.register(_governance_invariant())
        g2_hydrated = engine_hydrated.validate_all(registry_hydrated, result.dag)[0]
        self.assertTrue(g2_hydrated.passed,
                        f"hydrated engine must pass auditor: {g2_hydrated.violations}")


if __name__ == "__main__":
    unittest.main()
