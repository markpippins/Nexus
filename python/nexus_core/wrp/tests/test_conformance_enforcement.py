"""
wr-conf-015: CIR-SDM per-family enforcement caller conformance (T23 Step 7).

Locks the enforcement-gate contract from architect ruling 4a57c089:
``enforcement.py`` is a thin caller over the pure ``evaluate()`` — it resolves
the enforced-rule set from the ``CIR_SDM_ENFORCE`` env value (read by the
caller, never inside ``evaluate``) and renders the startup audit state.

  AC1 — Default enforced set: env unset/None/"1" → {"cir-sdm.one-way-gate"};
        a blocking one-way-gate violation blocks.
  AC2 — CIR_SDM_ENFORCE=0 → frozenset() — full rollback to shadow; the same
        blocking violation does NOT block.
  AC3 — Warnings never block: a cold-start warning (one-way-gate v2) and an
        IR-payload warning (ir-payload-separation) stay non-blocking even in
        enforced mode.
  AC4 — Only one-way-gate is enforced: a blocking-severity violation from a
        non-enforced family (audit-non-influence) stays non-blocking in
        enforced mode.
  AC5 — Purity + audit state: enforce() never mutates source events, repeated
        calls are identical, and render_enforcement_state() reports shadow vs
        enforced with the active rule set.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_enforcement.py -v
"""

import copy
import os
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from nexus_core.wrp.cir_sdm import (                                  # noqa: E402
    RULE_AUDIT_NON_INFLUENCE,
    RULE_ONE_WAY_GATE,
)
from nexus_core.wrp.enforcement import (                              # noqa: E402
    DEFAULT_ENFORCED_RULES,
    ENFORCED_RULES_KEY,
    enforce,
    render_enforcement_state,
    resolve_enforced_rules,
)

# ── Golden fixtures (self-contained; mirrors the cir_sdm fixtures) ───


def _wr(event_id, wr_id, etype, ts):
    return {"event_id": event_id, "type": etype, "wrId": wr_id,
            "timestamp": ts}


def _cer(event_id, *, domain="execution", action="execute", parents=(),
         actor_type="system", ccnf_version=1):
    cer = {
        "event_id": event_id,
        "ccnf_version": ccnf_version,
        "domain": domain,
        "actor": {"type": actor_type, "id": "conduit"},
        "intent": {"action": action, "target_type": "workrequest",
                   "target_id": f"workrequest:{event_id}"},
        "timestamp": 1,
        "identity": {"entity_key": "k"},
    }
    if parents:
        cer["causality"] = {"parent_event_ids": list(parents)}
    return cer


FORWARD_LIFECYCLE = [
    _wr("e1", "wr-1", "WR_SUBMITTED", 1),
    _wr("e2", "wr-1", "WR_VALIDATED", 2),
    _wr("e3", "wr-1", "WR_QUEUED", 3),
    _wr("e4", "wr-1", "WR_CLAIMED", 4),
    _wr("e5", "wr-1", "WR_ACKED", 5),
]

# A reverse transition (WR_CLAIMED after SETTLED) — blocking one-way-gate.
REVERSE_STREAM = FORWARD_LIFECYCLE + [_wr("e6", "wr-1", "WR_CLAIMED", 6)]

# A generation CER citing an audit CER — blocking audit-non-influence.
AUDIT_INFLUENCE_STREAM = [
    _cer("rev-1", domain="review", actor_type="reviewer"),
    _cer("gen-2", parents=("rev-1",)),
]

# A lone mid-lifecycle WR event — one-way-gate cold-start warning (R-A-011).
COLD_START_STREAM = [_wr("e1", "wr-x", "WR_CLAIMED", 1)]

# A CER carrying an IR payload — ir-payload-separation warning (R-A-013).
IR_PAYLOAD_STREAM = [_cer("ir-1", domain="projection_ir")]


def _gate_blocking(violations):
    return [v for v in violations
            if v.rule_id == RULE_ONE_WAY_GATE and v.severity == "blocking"]


class TestAC1DefaultEnforcedSet(unittest.TestCase):
    """AC1 — unset/None/"1" resolves to {one-way-gate}; gate violation blocks."""

    def test_resolve_default(self):
        self.assertEqual(resolve_enforced_rules(None), DEFAULT_ENFORCED_RULES)
        self.assertEqual(resolve_enforced_rules("1"), DEFAULT_ENFORCED_RULES)
        self.assertEqual(resolve_enforced_rules(""), DEFAULT_ENFORCED_RULES)
        self.assertEqual(DEFAULT_ENFORCED_RULES, frozenset({RULE_ONE_WAY_GATE}))

    def test_default_blocks_gate_violation(self):
        offenders = _gate_blocking(enforce(REVERSE_STREAM))  # env unset (None)
        self.assertEqual(len(offenders), 1)
        self.assertTrue(offenders[0].blocking)


class TestAC2RollbackToShadow(unittest.TestCase):
    """AC2 — CIR_SDM_ENFORCE=0 → frozenset(); nothing blocks."""

    def test_resolve_zero(self):
        self.assertEqual(resolve_enforced_rules("0"), frozenset())

    def test_zero_does_not_block(self):
        offenders = _gate_blocking(enforce(REVERSE_STREAM, env_value="0"))
        self.assertEqual(len(offenders), 1)
        self.assertFalse(offenders[0].blocking)
        # Full shadow: NO violation blocks.
        self.assertTrue(all(v.blocking is False
                            for v in enforce(REVERSE_STREAM, env_value="0")))


class TestAC3WarningsNeverBlock(unittest.TestCase):
    """AC3 — cold-start and IR-payload warnings stay non-blocking when enforced."""

    def test_cold_start_warning_non_blocking(self):
        violations = enforce(COLD_START_STREAM, env_value="1")
        gate = [v for v in violations if v.rule_id == RULE_ONE_WAY_GATE]
        self.assertEqual(len(gate), 1)
        self.assertEqual(gate[0].severity, "warning")
        self.assertFalse(gate[0].blocking)

    def test_ir_payload_warning_non_blocking(self):
        violations = enforce(IR_PAYLOAD_STREAM, env_value="1")
        self.assertTrue(any(v.severity == "warning" for v in violations))
        self.assertTrue(all(v.blocking is False for v in violations))


class TestAC4OnlyOneWayGateEnforced(unittest.TestCase):
    """AC4 — non-enforced families stay shadow even in enforced mode."""

    def test_audit_non_influence_not_blocked_when_enforced(self):
        violations = enforce(AUDIT_INFLUENCE_STREAM, env_value="1")
        offenders = [v for v in violations
                     if v.rule_id == RULE_AUDIT_NON_INFLUENCE]
        self.assertEqual(len(offenders), 1)
        self.assertEqual(offenders[0].severity, "blocking")
        self.assertFalse(offenders[0].blocking)  # not in the enforced set


class TestAC5PurityAndAuditState(unittest.TestCase):
    """AC5 — enforce() is pure; render_enforcement_state() reports posture."""

    def test_no_mutation_and_determinism(self):
        stream = REVERSE_STREAM + AUDIT_INFLUENCE_STREAM
        snapshot = copy.deepcopy(stream)
        first = enforce(stream, env_value="1")
        second = enforce(stream, env_value="1")
        self.assertEqual(stream, snapshot)
        self.assertEqual(first, second)

    def test_render_state(self):
        self.assertIn("shadow", render_enforcement_state("0"))
        self.assertIn("CIR_SDM_ENFORCE=0", render_enforcement_state("0"))
        self.assertIn("enforced", render_enforcement_state(None))
        self.assertIn(RULE_ONE_WAY_GATE, render_enforcement_state("1"))

    def test_env_key_is_stable(self):
        # The flag name is part of the binding contract — lock it.
        self.assertEqual(ENFORCED_RULES_KEY, "CIR_SDM_ENFORCE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
