"""
wr-conf-013: CIR-SDM data-level conformance — the T23 rule families, locked.

T23 (thread 5686908d) extends the ARL file/schema-level checks to the *data*
level: pure evaluation over an ordered CER/event stream → CIRS violations.
This test mirrors the established conformance pattern (wr-conf-010 identity,
wr-conf-011 compile, wr-conf-012 drift-flag) and locks the four rule families
from the T09 architect draft (thread 0b51d98a):

  1. CIRS-3 one-way gate      — no illegal/reverse transitions
  2. CIRS-4 audit non-infl.   — generation never cites audit/feedback causation
  3. provenance / causation   — dangling causation → violation
  4. version lock             — mixed CCNF versions / missing version → violation

Golden fixtures per T23 Step 5. Each negative fixture asserts the offending
event id + rule id + rule version (acceptance criteria). Deterministic and
LLM-free — no DB, no network, no wall-clock dependence.

  AC1 — Positive: clean forward lifecycle + correct causation chain +
        single-version stream → ZERO violations.
  AC2 — Negative (one-way gate): a WR_CLAIMED after SETTLED (reverse
        transition) → one violation at the offending event, rule v1.
  AC3 — Negative (audit non-influence): generation CER cites an audit CER in
        causation → one violation, severity blocking, event = the generation CER.
  AC4 — Negative (provenance): dangling parent_event_id → violation, severity
        warning (ambiguous partial evidence, not blocking).
  AC5 — Negative (version lock): stream mixes ccnf_version 1 and 2 → one
        violation at the deviating CER; a CER missing ccnf_version → violation.
  AC6 — Ambiguous: partial evidence stays warning/info (never blocking).
  AC7 — Historical/backfilled: an identity-unknown CER (entity_key NULL /
        unbackfilled) fabricates NO violation.
  AC8 — Determinism: evaluate() is a pure function — identical output twice,
        and violation ids are stable.
  AC9 — Blocking policy: shadow mode (default) → blocking all False; passing
        enforced_rules flips blocking for that rule only.
  AC10 — pgv phase axis: legal phase sequence passes; illegal phase transition
         violates the one-way gate.
  AC11 — No mutation: evaluate() never mutates source events.
  AC12 — Structural: the canonical WR transition table still mirrors the
         TypeScript TRANSITION_TABLE (DRAFT→WR_SUBMITTED→VALIDATED;
         SETTLED terminal) and pgv initial state is PHASE_2_FROZEN.
  AC13 — Future-parent (F2): a CER citing a parent event that appears LATER in
         the stream → upstream-injection violation (warning).   AC14 — Interleaved multi-WR (F1): two WRs interleaved in one ordered stream,
         each following its own legal lifecycle → ZERO one-way-gate violations.
   AC15 — IR stage separation (IR-CHECK-1): a VISION.IR_PRODUCED event never
         a parent of an EXECUTION.* event → blocking.
   AC16 — CORE stage separation (CORE-CHECK-1): WORKREQUEST.CREATED never
         cites an EXECUTION.* event → blocking.
   AC17 — AUD stage extension (AUD-CHECK-1): WORKREQUEST.CREATED never cites
         a review/inspection event → blocking (rule_audit_non_influence).
   AC18 — Stage substrate: normalize_event classifies the CIRS-3 stage axis;
         a forward (IR→Synthesis→Execution) stream is clean.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_cir_sdm.py -v
"""

import copy
import os
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from nexus_core.wrp.cir_sdm import (                                 # noqa: E402
    RULE_AUDIT_NON_INFLUENCE,
    RULE_CORE_STAGE_SEPARATION,
    RULE_IR_STAGE_SEPARATION,
    RULE_ONE_WAY_GATE,
    RULE_PROVENANCE_CAUSATION,
    RULE_VERSION_LOCK,
    PGV_INITIAL_STATE,
    PGV_TRANSITIONS,
    WR_TRANSITIONS,
    evaluate,
    normalize_event,
)

# ── Golden fixtures ───────────────────────────────────────────────────


def _cer(event_id, *, domain="execution", action="execute", parents=(),
         ccnf_version=1, actor_type="system", phase=None, identity_key="k",
         unbackfilled=False):
    """Build a minimal 15-field-shaped CER for the fixtures."""
    cer = {
        "event_id": event_id,
        "ccnf_version": ccnf_version,
        "domain": domain,
        "actor": {"type": actor_type, "id": "conduit"},
        "intent": {"action": action, "target_type": "workrequest",
                   "target_id": f"workrequest:{event_id}"},
        "timestamp": 1,
    }
    if parents:
        cer["causality"] = {"parent_event_ids": list(parents)}
    if phase is not None:
        cer["phase"] = phase
    if unbackfilled:
        cer["unbackfilled"] = True
        cer["identity"] = {"entity_key": None}
    else:
        cer["identity"] = {"entity_key": identity_key}
    return cer


def _wr(event_id, wr_id, etype, ts):
    """Build a convenience-form runtime event."""
    return {"event_id": event_id, "type": etype, "wrId": wr_id,
            "timestamp": ts}


def _stage_ev(event_id, event_type, causation=None, actor_type="system"):
    """Build a DB-row-shaped pipeline-stage event (CIRS-3 stage axis)."""
    ev = {"event_id": event_id, "event_type": event_type,
          "actor_type": actor_type}
    if causation:
        ev["causation_id"] = causation
    return ev


# Clean forward WR lifecycle: DRAFT→VALIDATED→QUEUED→CLAIMED→ACKED→SETTLED.
FORWARD_LIFECYCLE = [
    _wr("e1", "wr-1", "WR_SUBMITTED", 1),
    _wr("e2", "wr-1", "WR_VALIDATED", 2),
    _wr("e3", "wr-1", "WR_QUEUED", 3),
    _wr("e4", "wr-1", "WR_CLAIMED", 4),
    _wr("e5", "wr-1", "WR_ACKED", 5),
]

# Correct causation chain: spec CER → gen CER (parents resolve, single version).
CAUSATION_CHAIN = [
    _cer("spec-1", domain="specification", action="validate"),
    _cer("gen-1", domain="execution", action="execute", parents=("spec-1",)),
]


class TestAC1PositiveStreamsAreClean(unittest.TestCase):
    """AC1 — positive fixtures produce zero violations."""

    def test_clean_forward_lifecycle(self):
        self.assertEqual(evaluate(FORWARD_LIFECYCLE), [])

    def test_correct_causation_chain(self):
        self.assertEqual(evaluate(CAUSATION_CHAIN), [])

    def test_forward_lifecycle_with_causation_chain(self):
        self.assertEqual(evaluate(FORWARD_LIFECYCLE + CAUSATION_CHAIN), [])


class TestAC2OneWayGate(unittest.TestCase):
    """AC2 — CIRS-3: reverse transition → violation at the offending event."""

    def test_reverse_transition_settled_to_claimed(self):
        stream = FORWARD_LIFECYCLE + [_wr("e6", "wr-1", "WR_CLAIMED", 6)]
        violations = evaluate(stream)
        offenders = [v for v in violations if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "e6")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "blocking")
        self.assertIn("SETTLED", v.description)

    def test_terminal_state_accepts_no_transitions(self):
        # A WR_FAILED from CLAIMED is legal (CLAIMED→FAILED); anything after
        # FAILED (terminal) is illegal.
        stream = [
            _wr("e1", "wr-2", "WR_SUBMITTED", 1),
            _wr("e2", "wr-2", "WR_VALIDATED", 2),
            _wr("e3", "wr-2", "WR_QUEUED", 3),
            _wr("e4", "wr-2", "WR_CLAIMED", 4),
            _wr("e5", "wr-2", "WR_FAILED", 5),      # CLAIMED→FAILED (legal)
            _wr("e6", "wr-2", "WR_ACKED", 6),       # FAILED is terminal → illegal
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual([v.event_id for v in offenders], ["e6"])


class TestAC3AuditNonInfluence(unittest.TestCase):
    """AC3 — CIRS-4: generation never cites an audit event in causation."""

    def test_audit_feedback_as_input(self):
        stream = [
            _cer("rev-1", domain="review", action="validate",
                 actor_type="reviewer"),
            _cer("gen-2", domain="execution", action="execute",
                 parents=("rev-1",)),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "gen-2")
        self.assertEqual(v.cer_id, "gen-2")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "blocking")
        self.assertIn("rev-1", v.description)

    def test_generation_citing_generation_is_clean(self):
        stream = [
            _cer("spec-1", domain="specification", action="validate"),
            _cer("gen-1", domain="execution", action="execute",
                 parents=("spec-1",)),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(offenders, [])

    def test_audit_event_itself_is_not_flagged(self):
        # An audit event with no parents is fine — the rule only guards
        # *generation* events citing audit events.
        stream = [_cer("rev-1", domain="review", action="validate",
                       actor_type="reviewer")]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(offenders, [])


class TestAC4ProvenanceCausation(unittest.TestCase):
    """AC4 — dangling causation → warning (not blocking)."""

    def test_dangling_parent(self):
        stream = [
            _cer("gen-1", domain="execution", action="execute",
                 parents=("ghost-1",)),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_PROVENANCE_CAUSATION]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "gen-1")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "warning")
        self.assertIn("ghost-1", v.description)


class TestAC5VersionLock(unittest.TestCase):
    """AC5 — mixed versions / missing version → violation."""

    def test_mixed_versions(self):
        stream = [
            _cer("cer-1", ccnf_version=1),
            _cer("cer-2", ccnf_version=2),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_VERSION_LOCK]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "cer-2")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "blocking")
        self.assertIn("drift", v.description)

    def test_missing_ccnf_version(self):
        stream = [_cer("cer-1", ccnf_version=None)]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_VERSION_LOCK]
        self.assertEqual(len(offenders), 1)
        self.assertEqual(offenders[0].event_id, "cer-1")

    def test_single_version_is_clean(self):
        stream = [_cer("cer-1", ccnf_version=1), _cer("cer-2", ccnf_version=1)]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_VERSION_LOCK]
        self.assertEqual(offenders, [])


class TestAC6AmbiguousIsNonBlocking(unittest.TestCase):
    """AC6 — ambiguous partial evidence is warning/info, never blocking."""

    def test_dangling_causation_stays_non_blocking(self):
        stream = [_cer("gen-1", domain="execution", action="execute",
                       parents=("unknown-intermediate",))]
        violations = evaluate(stream)
        self.assertTrue(len(violations) >= 1)
        self.assertTrue(all(v.blocking is False for v in violations))


class TestAC7HistoricalBackfilled(unittest.TestCase):
    """AC7 — identity-unknown / unbackfilled rows fabricate no violation."""

    def test_unbackfilled_marker(self):
        stream = [_cer("old-1", ccnf_version=None, unbackfilled=True)]
        self.assertEqual(evaluate(stream), [])

    def test_null_entity_key_identity(self):
        cer = _cer("old-2", ccnf_version=None)
        cer["identity"] = {"entity_key": None}
        self.assertEqual(evaluate([cer]), [])


class TestAC8Determinism(unittest.TestCase):
    """AC8 — pure function: identical output twice, stable violation ids."""

    def test_repeated_evaluation_is_identical(self):
        stream = FORWARD_LIFECYCLE + [_wr("e6", "wr-1", "WR_CLAIMED", 6)] + \
            [_cer("gen-1", domain="execution", action="execute",
                  parents=("ghost-1",))]
        first = evaluate(stream)
        second = evaluate(stream)
        self.assertEqual(first, second)
        self.assertEqual([v.violation_id for v in first],
                         [v.violation_id for v in second])


class TestAC9BlockingPolicy(unittest.TestCase):
    """AC9 — shadow mode: nothing blocks unless a rule is enforced."""

    def test_shadow_mode_blocks_nothing(self):
        stream = FORWARD_LIFECYCLE + [_wr("e6", "wr-1", "WR_CLAIMED", 6)]
        violations = evaluate(stream)
        self.assertTrue(len(violations) >= 1)
        self.assertTrue(all(v.blocking is False for v in violations))

    def test_enforced_rule_blocks(self):
        stream = FORWARD_LIFECYCLE + [_wr("e6", "wr-1", "WR_CLAIMED", 6)]
        violations = evaluate(stream, enforced_rules=frozenset({RULE_ONE_WAY_GATE}))
        gate = [v for v in violations if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertTrue(gate and gate[0].blocking is True)

    def test_warning_never_blocks_even_when_enforced(self):
        # Enforce the gate, but the dangling-causation warning must stay
        # non-blocking (only blocking-severity rules can block).
        stream = [_cer("gen-1", domain="execution", action="execute",
                       parents=("ghost-1",))]
        violations = evaluate(stream, enforced_rules=frozenset({
            RULE_ONE_WAY_GATE, RULE_PROVENANCE_CAUSATION}))
        prov = [v for v in violations if v.rule_id == RULE_PROVENANCE_CAUSATION]
        self.assertTrue(prov and prov[0].blocking is False)


class TestAC10PgvPhaseAxis(unittest.TestCase):
    """AC10 — pgv.phase_lifecycle is a second one-way-gate source of truth."""

    def test_legal_phase_sequence(self):
        stream = [
            _cer("p1", phase="REBASELINE_PENDING"),
            _cer("p2", phase="REBASELINE_ACCEPTED"),
            _cer("p3", phase="PHASE_3_DUAL"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual(offenders, [])

    def test_illegal_phase_jump(self):
        # PHASE_2_FROZEN → PHASE_3_DUAL skips REBASELINE_PENDING/ACCEPTED.
        stream = [_cer("p1", phase="PHASE_3_DUAL")]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual(len(offenders), 1)
        self.assertEqual(offenders[0].event_id, "p1")
        self.assertIn("PHASE_2_FROZEN -> PHASE_3_DUAL", offenders[0].description)


class TestAC11NoMutation(unittest.TestCase):
    """AC11 — evaluate() never mutates source events (CIRS-4 audit non-influence)."""

    def test_source_events_unchanged(self):
        stream = FORWARD_LIFECYCLE + [
            _cer("gen-1", domain="execution", action="execute",
                 parents=("ghost-1",)),
        ]
        snapshot = copy.deepcopy(stream)
        evaluate(stream)
        self.assertEqual(stream, snapshot)


class TestAC13FutureParent(unittest.TestCase):
    """AC13 (F2) — a parent resolving to a LATER event is an upstream injection."""

    def test_future_parent_is_flagged(self):
        # gen-1 cites child-2 as its parent, but child-2 appears later.
        stream = [
            _cer("gen-1", domain="execution", action="execute",
                 parents=("child-2",)),
            _cer("child-2", domain="execution", action="execute"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_PROVENANCE_CAUSATION]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "gen-1")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "warning")
        self.assertIn("upstream injection", v.description)
        self.assertIn("child-2", v.description)

    def test_self_reference_is_flagged(self):
        # A CER citing itself as parent resolves at its own index (>= idx).
        stream = [_cer("gen-1", domain="execution", action="execute",
                       parents=("gen-1",))]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_PROVENANCE_CAUSATION]
        self.assertEqual(len(offenders), 1)
        self.assertIn("upstream injection", offenders[0].description)

    def test_earlier_parent_stays_clean(self):
        # parent before child — legal, no provenance violation.
        stream = [
            _cer("spec-1", domain="specification", action="validate"),
            _cer("gen-1", domain="execution", action="execute",
                 parents=("spec-1",)),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_PROVENANCE_CAUSATION]
        self.assertEqual(offenders, [])


class TestAC14InterleavedMultiWr(unittest.TestCase):
    """AC14 (F1) — interleaved WRs fold per-wr_id; no false gate violations."""

    def test_interleaved_legal_lifecycles(self):
        # wr-1 and wr-2 interleave: each independently follows its own legal
        # lifecycle. A global fold would flag these as illegal transitions.
        stream = [
            _wr("e1", "wr-1", "WR_SUBMITTED", 1),   # wr-1 DRAFT→VALIDATED
            _wr("e2", "wr-2", "WR_SUBMITTED", 2),   # wr-2 DRAFT→VALIDATED
            _wr("e3", "wr-1", "WR_VALIDATED", 3),   # wr-1 VALIDATED→QUEUED
            _wr("e4", "wr-2", "WR_VALIDATED", 4),   # wr-2 VALIDATED→QUEUED
            _wr("e5", "wr-1", "WR_QUEUED", 5),      # wr-1 QUEUED→CLAIMED
            _wr("e6", "wr-2", "WR_QUEUED", 6),      # wr-2 QUEUED→CLAIMED
            _wr("e7", "wr-1", "WR_CLAIMED", 7),     # wr-1 CLAIMED→ACKED
            _wr("e8", "wr-1", "WR_ACKED", 8),       # wr-1 ACKED→SETTLED
            _wr("e9", "wr-2", "WR_CLAIMED", 9),     # wr-2 CLAIMED→ACKED
            _wr("e10", "wr-2", "WR_ACKED", 10),     # wr-2 ACKED→SETTLED
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual(offenders, [])

    def test_reverse_transition_still_caught_per_wr(self):
        # wr-1 is SETTLED; a WR_CLAIMED for wr-1 is illegal — but the same
        # event type for wr-2 (which is only VALIDATED) is not.
        stream = [
            _wr("e1", "wr-1", "WR_SUBMITTED", 1),
            _wr("e2", "wr-1", "WR_VALIDATED", 2),
            _wr("e3", "wr-1", "WR_QUEUED", 3),
            _wr("e4", "wr-1", "WR_CLAIMED", 4),
            _wr("e5", "wr-1", "WR_ACKED", 5),       # wr-1 → SETTLED
            _wr("e6", "wr-1", "WR_CLAIMED", 6),     # wr-1 SETTLED→ illegal
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual([v.event_id for v in offenders], ["e6"])


class TestAC12StructuralGuard(unittest.TestCase):
    """AC12 — canonical tables still mirror the TypeScript/pgv sources."""

    def test_wr_transition_table_matches_canonical(self):
        # DRAFT → WR_SUBMITTED → VALIDATED (forward entry)
        self.assertIn(("WR_SUBMITTED", "VALIDATED"), WR_TRANSITIONS["DRAFT"])
        # SETTLED is terminal (no outgoing transitions)
        self.assertEqual(WR_TRANSITIONS["SETTLED"], [])
        # VALIDATED → WR_VALIDATED → QUEUED (manual-only advance, ADR-006)
        self.assertIn(("WR_VALIDATED", "QUEUED"), WR_TRANSITIONS["VALIDATED"])

    def test_pgv_initial_state_and_edges(self):
        self.assertEqual(PGV_INITIAL_STATE, "PHASE_2_FROZEN")
        self.assertIn("REBASELINE_PENDING", PGV_TRANSITIONS["PHASE_2_FROZEN"])
        # t3 reject edge is a legal reverse (REBASELINE_PENDING → PHASE_2_FROZEN)
        self.assertIn("PHASE_2_FROZEN", PGV_TRANSITIONS["REBASELINE_PENDING"])

    def test_normalize_event_classifies_kinds(self):
        self.assertTrue(normalize_event(_wr("e1", "wr-1", "WR_SUBMITTED", 1)).is_wr_event)
        self.assertFalse(normalize_event(_cer("c1")).is_wr_event)
        self.assertTrue(normalize_event(_cer("c1", domain="review")).is_audit)
        # DB-row form: causation_id becomes a single parent; actor_type audit.
        row = normalize_event({"event_id": "a1", "work_request_id": "wr-1",
                               "event_type": "WR_SUBMITTED",
                               "causation_id": "prev", "actor_type": "system"})
        self.assertEqual(row.parent_event_ids, ["prev"])
        self.assertFalse(row.is_audit)


class TestAC15IrStageSeparation(unittest.TestCase):
    """AC15 (IR-CHECK-1) — ProjectionIR never feeds Execution edges."""

    def test_ir_parent_of_execution_is_flagged(self):
        stream = [
            _stage_ev("ir-1", "VISION.IR_PRODUCED"),
            _stage_ev("exec-1", "EXECUTION.STARTED", causation="ir-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_IR_STAGE_SEPARATION]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "exec-1")
        self.assertEqual(v.rule_version, "1")
        self.assertEqual(v.severity, "blocking")
        self.assertIn("ir-1", v.description)

    def test_synthesis_parent_of_execution_is_clean(self):
        # Synthesis → Execution is the legal forward stage order.
        stream = [
            _stage_ev("syn-1", "WORKREQUEST.CREATED"),
            _stage_ev("exec-1", "EXECUTION.STARTED", causation="syn-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_IR_STAGE_SEPARATION]
        self.assertEqual(offenders, [])


class TestAC16CoreStageSeparation(unittest.TestCase):
    """AC16 (CORE-CHECK-1) — Synthesis never cites Execution (reverse flow)."""

    def test_synthesis_citing_execution_is_flagged(self):
        stream = [
            _stage_ev("exec-1", "EXECUTION.STARTED"),
            _stage_ev("syn-1", "WORKREQUEST.CREATED", causation="exec-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_CORE_STAGE_SEPARATION]
        self.assertEqual(len(offenders), 1)
        v = offenders[0]
        self.assertEqual(v.event_id, "syn-1")
        self.assertEqual(v.severity, "blocking")
        self.assertIn("exec-1", v.description)

    def test_synthesis_citing_ir_is_clean(self):
        # IR → Synthesis is the legal forward stage order.
        stream = [
            _stage_ev("ir-1", "VISION.IR_PRODUCED"),
            _stage_ev("syn-1", "WORKREQUEST.CREATED", causation="ir-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_CORE_STAGE_SEPARATION]
        self.assertEqual(offenders, [])


class TestAC17AuditStageExtension(unittest.TestCase):
    """AC17 (AUD-CHECK-1) — WORKREQUEST.CREATED never cites review/inspection."""

    def test_synthesis_citing_audit_is_flagged(self):
        stream = [
            _cer("rev-1", domain="review", action="validate",
                 actor_type="reviewer"),
            _stage_ev("syn-1", "WORKREQUEST.CREATED", causation="rev-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(len(offenders), 1)
        self.assertEqual(offenders[0].event_id, "syn-1")
        self.assertEqual(offenders[0].severity, "blocking")

    def test_synthesis_citing_generation_is_clean(self):
        stream = [
            _cer("spec-1", domain="specification", action="validate"),
            _stage_ev("syn-1", "WORKREQUEST.CREATED", causation="spec-1"),
        ]
        offenders = [v for v in evaluate(stream)
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(offenders, [])


class TestAC18StageSubstrate(unittest.TestCase):
    """AC18 — normalize_event classifies the CIRS-3 stage axis; forward clean."""

    def test_stage_classification(self):
        self.assertEqual(
            normalize_event(_stage_ev("s", "WORKREQUEST.CREATED")).stage,
            "synthesis")
        self.assertEqual(
            normalize_event(_stage_ev("i", "VISION.IR_PRODUCED")).stage,
            "projection_ir")
        self.assertEqual(
            normalize_event(_stage_ev("e", "EXECUTION.FAILED")).stage,
            "execution")
        # WR runtime events and CERs have no stage classification.
        self.assertIsNone(normalize_event(_wr("w", "wr-1", "WR_SUBMITTED", 1)).stage)
        self.assertIsNone(normalize_event(_cer("c-1")).stage)

    def test_forward_stage_order_is_clean(self):
        # CIRS-3 forward order: ProjectionIR → Synthesis → Execution.
        stream = [
            _stage_ev("ir-1", "VISION.IR_PRODUCED"),
            _stage_ev("syn-1", "WORKREQUEST.CREATED", causation="ir-1"),
            _stage_ev("exec-1", "EXECUTION.STARTED", causation="syn-1"),
        ]
        self.assertEqual(evaluate(stream), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
