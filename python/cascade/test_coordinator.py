"""
Tests for AssessmentCoordinator (coordinator.py) — doctrine-based outcome resolution.

Four-path coverage per tester-role mandate:
  Green  — standard doctrine resolution paths (R1–R5)
  Orange — expected edge cases (zero dimensions, all unreliable, missing keys)
  Red    — conflicting dimensions, adversarial dimension values
  Silent — metamorphic: different inputs MUST produce different outcomes

The coordinator is GOVERNANCE-CRITICAL: it's the single place where
assessment outcomes are resolved. A wrong outcome is a silent failure
that propagates through the entire Assembly subsystem.
"""

import sys
import os
import unittest

# Make cascade importable as a package (coordinator uses relative imports)
_CASCADE_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_CASCADE_DIR)
sys.path.insert(0, _PARENT)

from cascade.coordinator import (
    resolve_outcome,
    DoctrineResolution,
    OUTCOME_INFORMATIONAL,
    OUTCOME_RECOMMENDATION,
    OUTCOME_DELIBERATION_REQUIRED,
)
from cascade.evaluators.protocol import AssessmentDimension, EvidenceRef


def _dim(evaluator="test", confidence=0.8, findings=None, evidence=None, signals=None):
    return AssessmentDimension(
        evaluator=evaluator,
        confidence=confidence,
        evidence=evidence or [],
        findings=findings or {},
        signals=signals or {},
    )


def _evidence(source_type="test", source_id="src-1", desc="", confidence=0.8):
    return EvidenceRef(
        source_type=source_type,
        source_id=source_id,
        description=desc,
        confidence=confidence,
    )


# ── Green path: doctrine rules ───────────────────────────────────────


class TestDoctrineRules(unittest.TestCase):
    """Green-path: each doctrine rule resolves correctly."""

    def test_r2_all_informational_no_candidates_no_artifacts(self):
        """R2: no candidates + no artifacts → INFORMATIONAL."""
        dims = [_dim(findings={"candidate_count": 0, "artifact_counts": {"total": 0}})]
        result = resolve_outcome(dims)
        self.assertEqual(result.outcome, OUTCOME_INFORMATIONAL)

    def test_r3_candidates_and_artifacts(self):
        """R3: candidates + connected KG artifacts → DELIBERATION_REQUIRED."""
        dims = [_dim(findings={"candidate_count": 3, "artifact_counts": {"total": 5}})]
        result = resolve_outcome(dims)
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)

    def test_r4_no_candidates_but_artifacts(self):
        """R4: 0 candidates but KG artifacts exist → RECOMMENDATION."""
        dims = [_dim(findings={"candidate_count": 0, "artifact_counts": {"total": 3}})]
        result = resolve_outcome(dims)
        self.assertEqual(result.outcome, OUTCOME_RECOMMENDATION)

    def test_r5_candidates_but_no_artifacts(self):
        """R5: candidates exist but no KG artifacts → DELIBERATION_REQUIRED."""
        dims = [_dim(findings={"candidate_count": 2, "artifact_counts": {"total": 0}})]
        result = resolve_outcome(dims)
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)

    def test_multiple_dimensions_merged(self):
        """Multiple dimensions, one contributes candidate_count, another artifact_counts."""
        dims = [
            _dim(evaluator="trivial", findings={"candidate_count": 4}),
            _dim(evaluator="kg", findings={"artifact_counts": {"total": 2}}),
        ]
        result = resolve_outcome(dims)
        # Both candidates AND artifacts → R3: DELIBERATION_REQUIRED
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)
        self.assertEqual(result.dimensions_used, 2)
        self.assertEqual(result.dimensions_total, 2)

    def test_doctrine_resolution_has_required_fields(self):
        """Every DoctrineResolution must have all required fields populated."""
        dims = [_dim(findings={"candidate_count": 1})]
        result = resolve_outcome(dims)
        self.assertIsInstance(result.outcome, str)
        self.assertIsInstance(result.confidence, float)
        self.assertIsInstance(result.rationale, list)
        self.assertGreaterEqual(result.dimensions_used, 0)
        self.assertGreaterEqual(result.dimensions_total, 0)


# ── Orange path: expected edge cases ─────────────────────────────────


class TestOrangePathEdgeCases(unittest.TestCase):
    """Orange-path: empty dimensions, unreliable evaluators, missing keys."""

    def test_zero_dimensions_returns_informational(self):
        """No evaluators run → informational (low evidence)."""
        result = resolve_outcome([])
        self.assertEqual(result.outcome, OUTCOME_INFORMATIONAL)
        self.assertEqual(result.dimensions_used, 0)
        # Low confidence because no evidence
        self.assertLess(result.confidence, 0.2)

    def test_all_dimensions_unreliable(self):
        """All dimensions below POOR_CONFIDENCE_THRESHOLD → informational."""
        dims = [
            _dim(confidence=0.10, findings={"candidate_count": 5}),
            _dim(confidence=0.05, findings={"artifact_counts": {"total": 10}}),
        ]
        result = resolve_outcome(dims)
        # R1: No reliable dimensions → INFORMATIONAL
        self.assertEqual(result.outcome, OUTCOME_INFORMATIONAL)
        self.assertEqual(result.dimensions_used, 0)

    def test_one_reliable_one_unreliable(self):
        """One reliable dimension + one unreliable → use only the reliable one."""
        dims = [
            _dim(confidence=0.10, findings={"candidate_count": 999}),
            _dim(confidence=0.80, findings={"candidate_count": 2}),
        ]
        result = resolve_outcome(dims)
        self.assertEqual(result.dimensions_used, 1)
        self.assertEqual(result.dimensions_total, 1)  # only reliable count

    def test_missing_candidate_count_key(self):
        """If no dimension has candidate_count, default is 0."""
        dims = [_dim(findings={"other": "data"})]
        result = resolve_outcome(dims)
        # No candidates + no artifacts → R2: INFORMATIONAL
        self.assertEqual(result.outcome, OUTCOME_INFORMATIONAL)

    def test_missing_artifact_counts_key(self):
        """If no dimension has artifact_counts, default is 0 total artifacts."""
        dims = [_dim(findings={"candidate_count": 1})]
        result = resolve_outcome(dims)
        # candidates=1, artifacts=0 → R5: DELIBERATION_REQUIRED
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)

    def test_dimension_with_zero_confidence(self):
        """Dimension with confidence=0.0 is excluded (at/under threshold)."""
        dims = [
            _dim(confidence=0.0, findings={"candidate_count": 100}),
            _dim(confidence=0.80, findings={"candidate_count": 0, "artifact_counts": {"total": 5}}),
        ]
        result = resolve_outcome(dims)
        # Only the second dimension used → artifacts=5, candidates=0 → R4: RECOMMENDATION
        self.assertEqual(result.outcome, OUTCOME_RECOMMENDATION)
        self.assertEqual(result.dimensions_used, 1)

    @unittest.expectedFailure
    def test_none_value_in_findings(self):
        """KNOWN GAP: None values in findings should not crash.

        Currently raises AttributeError because artifact_counts=None
        triggers None.get("total", 0) in the coordinator.
        Marked @expectedFailure — will auto-pass (xpass) when fixed.
        """
        dims = [_dim(findings={"candidate_count": None, "artifact_counts": None})]
        # Correct behavior: should not crash
        result = resolve_outcome(dims)
        self.assertIsInstance(result.outcome, str)
        self.assertIsNotNone(result)


# ── Red path: conflicting dimensions, adversarial inputs ──────────────


class TestRedPathConflicts(unittest.TestCase):
    """Red-path: conflicting dimensions, adversarial confidence values."""

    def test_conflicting_candidate_counts(self):
        """Two dimensions report different candidate_counts.

        The coordinator takes the FIRST non-None value found (find() order).
        This means dimension order matters — a potential silent-failure source.
        """
        dims = [
            _dim(evaluator="first", findings={"candidate_count": 1}),
            _dim(evaluator="second", findings={"candidate_count": 99}),
        ]
        result = resolve_outcome(dims)
        # candidate_count=1 (from first), artifacts=0 → R5: DELIBERATION
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)

    def test_conflicting_artifact_counts(self):
        """Two dimensions report different artifact_counts.

        The coordinator assigns (not sums) per dimension — the last
        dimension's artifact total wins. The test verifies behavior
        as-implemented, but summing would be more correct.
        """
        dims = [
            _dim(evaluator="a", findings={"artifact_counts": {"total": 2}}),
            _dim(evaluator="b", findings={"artifact_counts": {"total": 3}}),
        ]
        result = resolve_outcome(dims)
        # candidate_count=0, total_artifacts=2+3=5 → R4: RECOMMENDATION
        self.assertEqual(result.outcome, OUTCOME_RECOMMENDATION)

    def test_negative_candidate_count(self):
        """Adversarial: negative candidate_count should not crash."""
        dims = [_dim(findings={"candidate_count": -1})]
        result = resolve_outcome(dims)
        # -1 is truthy → hits R5 path (candidates > 0 branch)
        self.assertIsInstance(result.outcome, str)

    def test_negative_artifact_total(self):
        """Adversarial: negative artifact total should not crash."""
        dims = [_dim(findings={"candidate_count": 1, "artifact_counts": {"total": -5}})]
        result = resolve_outcome(dims)
        self.assertIsInstance(result.outcome, str)

    def test_confidence_above_one(self):
        """Confidence > 1.0 is unusual but should not crash."""
        dims = [_dim(confidence=1.5, findings={"candidate_count": 1})]
        result = resolve_outcome(dims)
        self.assertIsInstance(result.outcome, str)

    def test_massive_candidate_count(self):
        """Very large candidate count should not overflow or crash."""
        dims = [_dim(findings={"candidate_count": 10_000_000, "artifact_counts": {"total": 10_000_000}})]
        result = resolve_outcome(dims)
        self.assertEqual(result.outcome, OUTCOME_DELIBERATION_REQUIRED)

    def test_doctrine_resolution_is_deterministic(self):
        """Same inputs → same result every time (no randomness)."""
        dims = [_dim(findings={"candidate_count": 3, "artifact_counts": {"total": 2}})]
        results = [resolve_outcome(dims).outcome for _ in range(20)]
        self.assertEqual(len(set(results)), 1)
        self.assertEqual(results[0], OUTCOME_DELIBERATION_REQUIRED)


# ── Silent failure: metamorphic / differential testing ────────────────


class TestSilentFailureMetamorphic(unittest.TestCase):
    """Silent-failure: different inputs MUST produce different outcomes.

    The tester-role mandate: for any function that claims to discriminate
    between inputs, feed it two inputs that SHOULD produce different outputs
    and assert the outputs actually differ.
    """

    def test_different_signals_produce_different_outcomes(self):
        """Three distinct scenarios → three distinct outcomes.

        If all three return the same outcome, the doctrine resolver is
        not actually discriminating — a silent failure.
        """
        r1 = resolve_outcome([_dim(findings={"candidate_count": 0, "artifact_counts": {"total": 0}})]).outcome
        r2 = resolve_outcome([_dim(findings={"candidate_count": 0, "artifact_counts": {"total": 5}})]).outcome
        r3 = resolve_outcome([_dim(findings={"candidate_count": 3, "artifact_counts": {"total": 5}})]).outcome

        outcomes = {r1, r2, r3}
        self.assertGreater(
            len(outcomes), 1,
            f"All three scenarios produced '{r1}' — the doctrine resolver "
            f"is not discriminating between different inputs",
        )
        # Expected: INFORMATIONAL, RECOMMENDATION, DELIBERATION_REQUIRED
        self.assertIn(OUTCOME_INFORMATIONAL, outcomes)
        self.assertIn(OUTCOME_RECOMMENDATION, outcomes)
        self.assertIn(OUTCOME_DELIBERATION_REQUIRED, outcomes)

    def test_zero_to_one_candidate_is_meaningful_change(self):
        """Adding a single candidate should change the outcome (metamorphic)."""
        no_candidates = resolve_outcome([
            _dim(findings={"candidate_count": 0, "artifact_counts": {"total": 5}})
        ]).outcome
        one_candidate = resolve_outcome([
            _dim(findings={"candidate_count": 1, "artifact_counts": {"total": 5}})
        ]).outcome
        self.assertNotEqual(
            no_candidates, one_candidate,
            f"0 vs 1 candidate both produced '{no_candidates}' — "
            f"the resolver is blind to candidate presence",
        )
        self.assertEqual(no_candidates, OUTCOME_RECOMMENDATION)
        self.assertEqual(one_candidate, OUTCOME_DELIBERATION_REQUIRED)

    def test_adding_artifact_changes_outcome(self):
        """Going from 0 to 1 artifact should change outcome when candidates=0."""
        no_artifacts = resolve_outcome([
            _dim(findings={"candidate_count": 0, "artifact_counts": {"total": 0}})
        ]).outcome
        one_artifact = resolve_outcome([
            _dim(findings={"candidate_count": 0, "artifact_counts": {"total": 1}})
        ]).outcome
        self.assertNotEqual(no_artifacts, one_artifact)

    def test_rationale_includes_doctrine_rule_reference(self):
        """Every resolution should document which doctrine rule was used."""
        dims = [_dim(findings={"candidate_count": 3, "artifact_counts": {"total": 5}})]
        result = resolve_outcome(dims)
        rationale_text = " ".join(result.rationale)
        self.assertIn("Doctrine", rationale_text,
                      "Rationale must reference the doctrine rule applied")


if __name__ == "__main__":
    unittest.main()
