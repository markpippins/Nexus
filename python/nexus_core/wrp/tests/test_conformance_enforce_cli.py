"""
wr-conf-016: CIR-SDM enforcement CLI bridge conformance (T23 Step 8).

Locks the subprocess bridge conduit-mcp uses at WR-transition admission:
``enforce_cli.enforce_stream`` is a pure function over (events + proposed
transition) → a JSON decision dict (state / enforced / violations / decisions
/ reject), and ``main --state-only`` emits the startup enforcement state line.

  AC1 — Legal proposed transition → reject=false, no decisions.
  AC2 — Reverse transition → reject=true, exactly one blocking decision.
  AC3 — CIR_SDM_ENFORCE=0 (shadow) → reject=false even for the reverse
        transition (full rollback); state="shadow".
  AC4 — Cold-start warning → surfaces (violations) but never a decision
        (reject=false) — warnings do not block.
  AC5 — violation_to_dict maps every field; --state-only prints the
        enforcement state line (shadow vs enforced).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_enforce_cli.py -v
"""

import io
import os
import sys
import unittest
from unittest import mock

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from nexus_core.wrp.enforce_cli import (                             # noqa: E402
    enforce_stream,
    main,
    violation_to_dict,
)
from nexus_core.wrp.cir_sdm import RULE_ONE_WAY_GATE                # noqa: E402


def _wr(event_id, wr_id, etype, ts):
    return {"event_id": event_id, "type": etype, "wrId": wr_id,
            "timestamp": ts}


FORWARD = [
    _wr("e1", "wr-1", "WR_SUBMITTED", 1),
    _wr("e2", "wr-1", "WR_VALIDATED", 2),
    _wr("e3", "wr-1", "WR_QUEUED", 3),
    _wr("e4", "wr-1", "WR_CLAIMED", 4),
    _wr("e5", "wr-1", "WR_ACKED", 5),
]


class TestAC1LegalTransition(unittest.TestCase):
    def test_legal_proposed_not_rejected(self):
        result = enforce_stream(
            FORWARD[:2],
            {"type": "WR_QUEUED", "wrId": "wr-1", "timestamp": 3},
        )
        self.assertFalse(result["reject"])
        self.assertEqual(result["decisions"], [])
        self.assertEqual(result["violations"], [])
        self.assertEqual(result["state"], "enforced")


class TestAC2ReverseTransitionRejected(unittest.TestCase):
    def test_reverse_transition_rejects(self):
        result = enforce_stream(
            FORWARD,
            {"event_id": "e6", "type": "WR_CLAIMED", "wrId": "wr-1",
             "timestamp": 6},
        )
        self.assertTrue(result["reject"])
        self.assertEqual(len(result["decisions"]), 1)
        d = result["decisions"][0]
        self.assertEqual(d["rule_id"], RULE_ONE_WAY_GATE)
        self.assertEqual(d["severity"], "blocking")
        self.assertTrue(d["blocking"])
        self.assertEqual(d["event_id"], "e6")


class TestAC3ShadowRollback(unittest.TestCase):
    def test_shadow_mode_rejects_nothing(self):
        result = enforce_stream(
            FORWARD,
            {"event_id": "e6", "type": "WR_CLAIMED", "wrId": "wr-1",
             "timestamp": 6},
            env_value="0",
        )
        self.assertEqual(result["state"], "shadow")
        self.assertFalse(result["enforced"])
        self.assertFalse(result["reject"])
        self.assertEqual(result["decisions"], [])
        # The violation is still DETECTED (advisory), just not enforced.
        self.assertEqual(len(result["violations"]), 1)
        self.assertFalse(result["violations"][0]["blocking"])


class TestAC4ColdStartWarningNotBlocking(unittest.TestCase):
    def test_cold_start_never_a_decision(self):
        result = enforce_stream(
            [],
            {"event_id": "e1", "type": "WR_CLAIMED", "wrId": "wr-x",
             "timestamp": 1},
        )
        self.assertFalse(result["reject"])
        self.assertEqual(result["decisions"], [])
        self.assertEqual(len(result["violations"]), 1)
        self.assertEqual(result["violations"][0]["severity"], "warning")


class TestAC5SerializationAndStateLine(unittest.TestCase):
    def test_violation_to_dict_maps_all_fields(self):
        result = enforce_stream(
            FORWARD,
            {"event_id": "e6", "type": "WR_CLAIMED", "wrId": "wr-1",
             "timestamp": 6},
        )
        d = result["decisions"][0]
        self.assertEqual(
            set(d.keys()),
            {"violation_id", "rule_id", "rule_version", "severity",
             "event_id", "cer_id", "description", "detected_at",
             "blocking"},
        )

    def test_state_only_prints_enforcement_line(self):
        # Bootstrap path (no posture rows): CIR_SDM_ENFORCE=0 → shadow.
        with mock.patch("nexus_core.wrp.enforce_cli.load_posture_rows",
                        return_value=[]):
            with mock.patch.dict(os.environ, {"CIR_SDM_ENFORCE": "0"},
                                 clear=False):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                    self.assertEqual(main(["--state-only"]), 0)
                    self.assertIn("shadow", out.getvalue())

    def test_state_only_defaults_to_enforced(self):
        # Bootstrap path (no posture rows): default enforced set.
        with mock.patch("nexus_core.wrp.enforce_cli.load_posture_rows",
                        return_value=[]):
            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop("CIR_SDM_ENFORCE", None)
                with mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                    self.assertEqual(main(["--state-only"]), 0)
                    self.assertIn("enforced", out.getvalue())

    def test_state_only_database_wins_over_env(self):
        # R-D: once posture rows exist, the database wins even when the env
        # disables CIR_SDM_ENFORCE — the audit line reports the DB source.
        rows = [{"family": RULE_ONE_WAY_GATE, "mode": "enforced",
                 "authorized_by": "4a57c089", "effective_from": None}]
        with mock.patch("nexus_core.wrp.enforce_cli.load_posture_rows",
                        return_value=rows):
            with mock.patch.dict(os.environ, {"CIR_SDM_ENFORCE": "0"},
                                 clear=False):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as out:
                    self.assertEqual(main(["--state-only"]), 0)
                    self.assertIn("database", out.getvalue())
                    self.assertIn("enforced", out.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
