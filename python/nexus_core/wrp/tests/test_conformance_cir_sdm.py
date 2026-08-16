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


if __name__ == "__main__":
    unittest.main(verbosity=2)
