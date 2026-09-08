"""Tests for the cpf_compute drift-skip guard (plan 8261640 follow-up).

The drift-intake seam (bin/drift-intake.py) owns compilation_readiness for
drift-typed candidates (severity-based: high 0.85 / medium 0.75 / low 0.70),
intended to rank them ABOVE transcript-derived candidates at equal readiness.

The legacy scheduled recompute (nexus-compute-cpf.timer -> cpf_compute.py) must
NOT overwrite that: drift candidates have no hierarchy/artifact signal, so the
transcript-derived scoring would floor them at ~0.5 — below the 0.7 shortlist
threshold, defeating plan 8261640's priority-ranking AC.

These are pure-logic tests (no DB): they assert is_drift_candidate correctly
classifies drift-typed vs transcript-typed rows, which drives the skip guard.

Run:
    python3 -m pytest bin/tests/test_cpf_compute_drift_guard.py -v
"""
import importlib.util
import os
import sys
import unittest

_MODULE_PATH = os.path.join(os.path.dirname(__file__), "..", "cpf_compute.py")


def _load_module():
    spec = importlib.util.spec_from_file_location("cpf_compute_under_test", _MODULE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestCpfComputeDriftGuard(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.mod = _load_module()

    def test_is_drift_candidate_true_for_drift(self):
        self.assertTrue(self.mod.is_drift_candidate({"type": "drift", "id": "x"}))

    def test_is_drift_candidate_false_for_transcript(self):
        self.assertFalse(self.mod.is_drift_candidate({"type": "requirement", "id": "x"}))

    def test_is_drift_candidate_false_when_type_missing(self):
        # Legacy fetch_candidates did not select hc.type; absence must not
        # accidentally treat a row as drift (transcript rows default to skip-safe).
        self.assertFalse(self.mod.is_drift_candidate({"id": "x"}))

    def test_is_drift_candidate_false_for_none_type(self):
        self.assertFalse(self.mod.is_drift_candidate({"type": None, "id": "x"}))

    def test_main_guard_references_is_drift_candidate(self):
        # Guard must be wired into main() so the recompute actually skips drift rows.
        import inspect
        src = inspect.getsource(self.mod.main)
        self.assertIn("is_drift_candidate(c)", src)
        self.assertIn("skipped_drift", src)


if __name__ == "__main__":
    unittest.main()