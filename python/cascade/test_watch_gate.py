#!/usr/bin/env python3
"""watch_gate tests — SOL-framed watch admission gate contract.

Covers Kiro survey #2 (watch admission gate) + the V096 frame fix:

  Green  — real governed backends (operator/harness/freebuff) admitted
  Orange — pre-flight turn/idle guards (deterministic, coordinator-owned)
  Red    — unknown backend fails closed; non-active status refused
  Silent — record-then-act fires for every evaluation (advisory)

Run: python3 test_watch_gate.py   (non-zero exit on failure)

The gate is GOVERNANCE-CRITICAL: it is the SOL-framed admission boundary
for session watches in the interactive turn subscriber. A wrong verdict
either dispatches an unauthorized watch or silently drops a legitimate
session.
"""

import os
import sys
import unittest
from unittest import mock

# Make cascade importable as a package (watch_gate uses cascade.peb_admission)
_CASCADE_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_CASCADE_DIR)
sys.path.insert(0, _PARENT)

from cascade import watch_gate  # noqa: E402


def _watch(**overrides):
    base = {
        "id": "w1",
        "status": "active",
        "max_turns": 20,
        "turn_count": 1,
        "idle_timeout_ms": 0,
        "last_activity": None,
        "execution_backend": "freebuff",
    }
    base.update(overrides)
    return base


class WatchGateAdmissionTest(unittest.TestCase):
    """Green path — every governed V096 backend admits an active watch."""

    def test_all_governed_backends_admit(self):
        for backend in ("operator", "harness", "freebuff"):
            with self.subTest(backend=backend):
                admitted, reason = watch_gate.evaluate_watch_admission(
                    _watch(execution_backend=backend),
                    enforce_preflights=False,
                )
                self.assertTrue(admitted, f"{backend}: {reason}")

    def test_preflight_disabled_still_admits_active_watch(self):
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(), enforce_preflights=False,
        )
        self.assertTrue(admitted, reason)

    def test_bool_variant(self):
        self.assertTrue(
            watch_gate.evaluate_watch_admission_bool(_watch(), enforce_preflights=False)
        )


class WatchGateFrameTest(unittest.TestCase):
    """Red — fail-closed boundary: unknown backend / non-active status."""

    def test_unknown_backend_fails_closed(self):
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(execution_backend="bogus"), enforce_preflights=False,
        )
        self.assertFalse(admitted)
        self.assertIn("context_mismatch", reason)

    def test_blank_backend_fails_closed(self):
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(execution_backend=""), enforce_preflights=False,
        )
        self.assertFalse(admitted)
        self.assertIn("context_mismatch", reason)

    def test_paused_watch_refused(self):
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(status="paused"), enforce_preflights=False,
        )
        self.assertFalse(admitted)
        self.assertIn("assertion failed", reason)

    def test_none_watch_refused(self):
        admitted, reason = watch_gate.evaluate_watch_admission(None)
        self.assertFalse(admitted)
        self.assertIn("no watch", reason)


class WatchGatePreflightTest(unittest.TestCase):
    """Orange — deterministic turn-count / idle guards (default on)."""

    def test_turn_limit_exhausted_refused(self):
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(turn_count=20, max_turns=20),
        )
        self.assertFalse(admitted)
        self.assertIn("turn limit exhausted", reason)

    def test_turn_limit_preflight_can_be_deferred(self):
        # The subscriber passes enforce_preflights=False: the coordinator
        # owns turn/idle closure (R2/R4 guarded transitions), so a watch
        # at budget is NOT refused at the admission boundary.
        admitted, _ = watch_gate.evaluate_watch_admission(
            _watch(turn_count=20, max_turns=20), enforce_preflights=False,
        )
        self.assertTrue(admitted)

    def test_idle_timeout_refused(self):
        import datetime
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(idle_timeout_ms=60_000, last_activity=old.isoformat()),
        )
        self.assertFalse(admitted)
        self.assertIn("idle timeout", reason)

    def test_idle_timeout_accepts_datetime_object(self):
        """psycopg2 returns datetime objects for last_activity — must not raise."""
        import datetime
        fresh = datetime.datetime.now(datetime.timezone.utc)
        admitted, reason = watch_gate.evaluate_watch_admission(
            _watch(idle_timeout_ms=60_000, last_activity=fresh),
        )
        self.assertTrue(admitted, reason)

    def test_fresh_watch_passes_preflights(self):
        admitted, reason = watch_gate.evaluate_watch_admission(_watch())
        self.assertTrue(admitted, reason)


class WatchGateRecordThenActTest(unittest.TestCase):
    """Silent — every evaluation records into peb.transactions (advisory)."""

    def test_outcome_recorded(self):
        with mock.patch("cascade.peb_admission.record_gate_outcome",
                        return_value=True) as rec:
            admitted, _ = watch_gate.evaluate_watch_admission(
                _watch(), enforce_preflights=False,
            )
        self.assertTrue(admitted)
        rec.assert_called_once()
        kwargs = rec.call_args.kwargs
        self.assertEqual(kwargs["gate"], "watch_gate.evaluate_watch_admission")
        self.assertEqual(kwargs["entity_id"], "w1")
        self.assertTrue(kwargs["admitted"])

    def test_refused_outcome_recorded(self):
        with mock.patch("cascade.peb_admission.record_gate_outcome",
                        return_value=True) as rec:
            admitted, _ = watch_gate.evaluate_watch_admission(
                _watch(execution_backend="bogus"), enforce_preflights=False,
            )
        self.assertFalse(admitted)
        rec.assert_called_once()
        self.assertFalse(rec.call_args.kwargs["admitted"])

    def test_recording_failure_never_raises(self):
        with mock.patch("cascade.peb_admission.record_gate_outcome",
                        side_effect=RuntimeError("db down")):
            admitted, reason = watch_gate.evaluate_watch_admission(
                _watch(), enforce_preflights=False,
            )
        self.assertTrue(admitted, reason)


if __name__ == "__main__":
    unittest.main(verbosity=2)