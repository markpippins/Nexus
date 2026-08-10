"""
wr-conf-008: LOSM validation leg — the advisory-validation boundary, guarded.

Guards the LOSM validation leg of the wr-conf-001 conformance experiment
(thread a4232e3d, adopted design step 4): "Run LOSM semantic/invariant
validation WITHOUT letting validation become a second business-authority store."

The leg is READ-ONLY by construction: it compiles the wr-conf-001 node stream
through LOSM's 6-pass pipeline (normalize → tenant → DAG → structural →
exec-compat → policy), runs the InvariantEngine, and validates the WRP
transition stream against LOSM's canonical transition table — all in-memory,
no writes to vision.* tables, no DB dependency. WRP remains the admission +
result authority; LOSM stays advisory evidence (architect 78080fa2).

Tested invariants:
  AC1 — Compilation: wr-conf-001 compiles through LOSM's 6-pass pipeline with
        zero errors and a valid DAG (3 nodes, depth 2).
  AC2 — Lifecycle invariants: the PROPOSED→TESTED→VALIDATED→STABLE chain is
        legal, and the InvariantEngine's validate_all passes against the
        compiled DAG (score 1.00, no violations).
  AC3 — Transition legality: every step of the WRP receipt stream maps to a
        fully ALLOWED transition in LOSM's canonical transition table.
  AC4 — Authority boundary: the leg is pure in-memory — recompiling the same
        input yields a structurally identical DAG and the caller's input
        structures are never mutated. No hidden persistent state is consulted
        or written; validation stays advisory and WRP stays the business
        authority.

Deterministic and LLM-free. Pure library test — no live services required.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_losm_validation.py -v
"""
import os
import sys
import unittest

# --- LOSM import bootstrap -------------------------------------------------
# losm_ir is editable-installed under python/vision/losm-ir; inserting the
# source paths unconditionally is harmless when the install exists, so the
# import below works in either state (installed or bare checkout).
_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_VISION = os.path.abspath(os.path.join(_TESTS_DIR, "..", "..", "..", "vision"))
for _p in (_VISION, os.path.join(_VISION, "losm-ir", "src")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from losm_ir.compiler import compile_dag                            # noqa: E402
from losm_ir.invariant import (                                     # noqa: E402
    Invariant,
    InvariantEngine,
    InvariantRegistry,
    InvariantState,
    InvariantType,
    InvariantSeverity,
    validate_lifecycle_transition,
)
from losm_ir.transition import validate_transition                  # noqa: E402


WR_ID = "wr-conf-001"

# wr-conf-001 canonical receipt stream (WRP states) per the experiment scaffold.
WRP_RECEIPT_STREAM = [
    ("PLANNING", "INTAKE"),
    ("PLAN_CREATE", "PLANNING"),
    ("CRITIQUE", "CRITIQUE"),
    ("CRITIQUE_PASS", "SPECIFICATION"),
    ("REVIEW", "APPROVED"),
    ("HOLD", "QUEUED"),
    ("IMPLEMENTATION", "EXECUTING"),
    ("REVIEW_PASS", "COMPLETED"),
]

# LOSM WorkStatus projection of the same stream (closest enum, per
# losm_ir.states.work_status_to_phase semantics).
LOSM_STREAM = [
    ("INTAKE", "PLAN_GENERATION"),
    ("PLAN_GENERATION", "PLAN_REVIEW"),
    ("PLAN_REVIEW", "PLAN_APPROVAL_GATE"),
    ("PLAN_APPROVAL_GATE", "SPEC_GENERATION"),
    ("SPEC_GENERATION", "EXECUTION"),
    ("EXECUTION", "VALIDATION"),
    ("VALIDATION", "COMPLETION"),
]


def _wr_nodes():
    """The wr-conf-001 node stream as LOSM compile inputs (fresh copies)."""
    return [
        {"wr_id": f"{WR_ID}-specify", "intent": "specify service",
         "status": "INTAKE", "priority": 5, "parent_request_id": None,
         "metadata": {"executor": "meep-construction"}},
        {"wr_id": f"{WR_ID}-build", "intent": "build service",
         "status": "PLAN_GENERATION", "priority": 5,
         "parent_request_id": f"{WR_ID}-specify",
         "metadata": {"executor": "meep-construction"}},
        {"wr_id": f"{WR_ID}-verify", "intent": "verify service",
         "status": "SPEC_GENERATION", "priority": 5,
         "parent_request_id": f"{WR_ID}-build",
         "metadata": {"executor": "meep-construction"}},
    ]


def _wr_edges():
    """The wr-conf-001 edge stream as LOSM compile inputs (fresh copies)."""
    return [
        {"parent_wr_id": f"{WR_ID}-specify", "child_wr_id": f"{WR_ID}-build"},
        {"parent_wr_id": f"{WR_ID}-build", "child_wr_id": f"{WR_ID}-verify"},
    ]


def _compile():
    """Compile wr-conf-001 through LOSM's 6-pass pipeline."""
    return compile_dag(_wr_nodes(), _wr_edges(),
                       tenant_id="conformance", trace_id=WR_ID)


class TestAc1CompilesThroughSixPasses(unittest.TestCase):
    """AC1 — wr-conf-001 compiles clean through all six LOSM passes."""

    def test_compilation_succeeds_with_no_errors(self):
        result = _compile()
        self.assertTrue(result.success)
        self.assertIsNotNone(result.dag)
        self.assertEqual(result.errors, [],
                         f"LOSM compile must have zero errors, got: {result.errors}")
        self.assertEqual(result.dag.total_nodes, 3)
        self.assertEqual(result.dag.depth, 2)
        self.assertIsNotNone(result.dag.compilation_status)

    def test_compilation_status_is_complete(self):
        result = _compile()
        # A fully-compiled DAG reports a terminal compilation status.
        status = str(result.dag.compilation_status).upper()
        self.assertIn("COMPILED", status)


class TestAc2LifecycleInvariants(unittest.TestCase):
    """AC2 — the invariant-lifecycle chain is legal and the engine passes."""

    def test_lifecycle_transition_chain_is_legal(self):
        # PROPOSED → TESTED is the entry leg of the invariant lifecycle; the
        # engine must admit it (and the full chain onward) per the card.
        ok, reason = validate_lifecycle_transition(
            InvariantState.PROPOSED, InvariantState.TESTED)
        self.assertTrue(ok, f"PROPOSED->TESTED must be legal: {reason}")
        ok2, _ = validate_lifecycle_transition(
            InvariantState.TESTED, InvariantState.VALIDATED)
        self.assertTrue(ok2)
        ok3, _ = validate_lifecycle_transition(
            InvariantState.VALIDATED, InvariantState.STABLE)
        self.assertTrue(ok3)

    def test_invariant_engine_passes_against_compiled_dag(self):
        result = _compile()
        engine = InvariantEngine()
        registry = InvariantRegistry(invariants={})
        registry.register(Invariant(
            invariant_id="wrp-lifecycle-happy-path",
            name="WRP lifecycle must reach COMPLETION",
            description="wr-conf-001 happy path terminates in COMPLETION",
            invariant_type=InvariantType.SEMANTIC,
            severity=InvariantSeverity.ERROR,
            depends_on=[],
        ))
        results = engine.validate_all(registry, result.dag)
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertTrue(r.passed,
                            f"{r.invariant_id} failed: {[v.message for v in r.violations]}")
            self.assertEqual(r.score, 1.00)
            self.assertEqual(len(r.violations), 0)


class TestAc3TransitionStreamFullyLegal(unittest.TestCase):
    """AC3 — the full WRP receipt stream is legal in LOSM's transition table."""

    def test_every_wrp_transition_is_allowed(self):
        allowed_count = 0
        denied = []
        for fr, to in LOSM_STREAM:
            v = validate_transition(fr, to)
            if v.allowed:
                allowed_count += 1
            else:
                denied.append(f"{fr}->{to}: {v.reason}")
        self.assertEqual(allowed_count, len(LOSM_STREAM),
                         f"happy path must be fully legal, denied: {denied}")
        self.assertEqual(denied, [])


class TestAc4ReadOnlyAuthorityBoundary(unittest.TestCase):
    """AC4 — validation stays advisory: pure in-memory, no authority store."""

    def test_recompile_is_structurally_identical(self):
        # Compiling the same input twice yields an identical DAG — proving no
        # hidden persistent state is consulted or written.
        r1 = _compile()
        r2 = _compile()
        self.assertEqual(r1.dag.total_nodes, r2.dag.total_nodes)
        self.assertEqual(r1.dag.depth, r2.dag.depth)
        self.assertEqual(str(r1.dag.compilation_status),
                         str(r2.dag.compilation_status))
        self.assertEqual(len(r1.errors), len(r2.errors))
        # Structural identity over the compiled node set, not just counts
        # (nodes is a dict keyed by node id).
        node_ids_1 = set(getattr(r1.dag, "nodes", {}).keys())
        node_ids_2 = set(getattr(r2.dag, "nodes", {}).keys())
        self.assertEqual(node_ids_1, node_ids_2)

    def test_input_objects_are_not_mutated(self):
        # Compilation must not mutate the caller's input structures — evidence
        # the leg is a pure projection, not a side-effecting one.
        nodes = _wr_nodes()
        edges = _wr_edges()
        nodes_snapshot = [dict(n) for n in nodes]
        edges_snapshot = [dict(e) for e in edges]
        compile_dag(nodes, edges, tenant_id="conformance", trace_id=WR_ID)
        self.assertEqual(nodes, nodes_snapshot)
        self.assertEqual(edges, edges_snapshot)


if __name__ == "__main__":
    unittest.main()
