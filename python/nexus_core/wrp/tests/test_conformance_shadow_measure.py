"""
wr-conf-014: CIR-SDM shadow measurement harness (T23 Step 6).

Locks the *measurement* side of the shadow-mode doctrine: the harness that
replays an ordered event stream through ``evaluate`` in shadow mode and
reports the FP/FN baseline. This is the reproducible tool the architect
re-runs over a defined measurement window before Step 7 (enforcement gate).

  AC1 — measure() counts WR vs CER events and violations deterministically
        (same stream twice → identical report).
  AC2 — FP classification: a clean forward stream measures 0 violations.
  AC3 — FN self-check: inject_reverse_transition appends a labeled illegal
        transition; measure() reports it CAUGHT (no false negative).
  AC4 — no mutation: inject_reverse_transition returns a new list; the
        source stream is unchanged (CIRS-4 / AC11).
  AC5 — parse_tsv produces the DB-row (Kind-2) shape normalize_event reads.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_shadow_measure.py -v
"""

import copy
import os
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from nexus_core.wrp.cir_sdm import RULE_ONE_WAY_GATE                    # noqa: E402
from nexus_core.wrp.shadow_measure import (                            # noqa: E402
    INJECTED_EVENT_ID,
    inject_reverse_transition,
    measure,
    parse_tsv,
    render_report,
)


def _wr(event_id, wr_id, etype, ts):
    return {"event_id": event_id, "type": etype, "wrId": wr_id,
            "timestamp": ts}


FORWARD_LIFECYCLE = [
    _wr("e1", "wr-1", "WR_SUBMITTED", 1),
    _wr("e2", "wr-1", "WR_VALIDATED", 2),
    _wr("e3", "wr-1", "WR_QUEUED", 3),
    _wr("e4", "wr-1", "WR_CLAIMED", 4),
    _wr("e5", "wr-1", "WR_ACKED", 5),
]


class TestAC1Determinism(unittest.TestCase):
    """AC1 — measure() is deterministic; counts WR vs CER events."""

    def test_identical_reports(self):
        first = measure(FORWARD_LIFECYCLE)
        second = measure(FORWARD_LIFECYCLE)
        self.assertEqual(first, second)

    def test_wr_and_cer_counts(self):
        m = measure(FORWARD_LIFECYCLE)
        self.assertEqual(m.total_events, 5)
        self.assertEqual(m.wr_events, 5)
        self.assertEqual(m.cer_events, 0)


class TestAC2CleanStreamMeasuresZero(unittest.TestCase):
    """AC2 — a clean forward lifecycle measures zero violations."""

    def test_no_false_positives(self):
        m = measure(FORWARD_LIFECYCLE)
        self.assertEqual(m.total_violations, 0)
        self.assertEqual(m.by_rule, {})
        self.assertEqual(m.by_severity, {})


class TestAC3FnSelfCheck(unittest.TestCase):
    """AC3 — injected corruption is caught (no false negative)."""

    def test_injected_reverse_transition_caught(self):
        injected = inject_reverse_transition(FORWARD_LIFECYCLE)
        m = measure(injected, injected=True)
        caught = any(v.event_id == INJECTED_EVENT_ID for v in m.violations)
        self.assertTrue(caught)
        # The injected event is flagged under the one-way-gate rule.
        gate = [v for v in m.violations
                if v.rule_id == RULE_ONE_WAY_GATE and v.event_id == INJECTED_EVENT_ID]
        self.assertEqual(len(gate), 1)
        self.assertIn("SETTLED", gate[0].description)


class TestAC4NoMutation(unittest.TestCase):
    """AC4 — inject_reverse_transition never mutates the source stream."""

    def test_source_unchanged(self):
        snapshot = copy.deepcopy(FORWARD_LIFECYCLE)
        injected = inject_reverse_transition(FORWARD_LIFECYCLE)
        self.assertEqual(FORWARD_LIFECYCLE, snapshot)
        self.assertEqual(len(injected), len(FORWARD_LIFECYCLE) + 1)
        self.assertIsNot(injected, FORWARD_LIFECYCLE)


class TestAC5ParseTsv(unittest.TestCase):
    """AC5 — parse_tsv yields the DB-row (Kind-2) shape."""

    def test_parse_tsv_rows(self):
        tsv = (
            "e1\twr-1\tWR_SUBMITTED\t\tsystem\t1\n"
            "e2\twr-1\tWR_VALIDATED\tprev\tsystem\t2\n"
        )
        rows = parse_tsv(tsv)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["event_type"], "WR_SUBMITTED")
        self.assertEqual(rows[0]["work_request_id"], "wr-1")
        self.assertEqual(rows[0]["occurred_at"], 1)
        self.assertIsNone(rows[0]["causation_id"])
        self.assertEqual(rows[1]["causation_id"], "prev")
        self.assertEqual(rows[1]["occurred_at"], 2)

    def test_render_report_mentions_fn_verdict(self):
        injected = inject_reverse_transition(FORWARD_LIFECYCLE)
        caught = any(v.event_id == INJECTED_EVENT_ID
                     for v in measure(injected, injected=True).violations)
        m = measure(injected, injected=True, injected_caught=caught)
        text = render_report(m)
        self.assertIn("CAUGHT", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
