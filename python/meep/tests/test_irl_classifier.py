"""Tests for the IRL classifier (Station 1)."""

from meep.irl_classifier import classify, _count_matches
from meep.models import ARCHETYPES


# ── Acceptance criteria from the spec ────────────────────────────────


def test_generic_greeting_defaults():
    """'hello world' → DEFAULT at 0.9+ (no keyword triggers)."""
    result = classify("hello world")
    assert result.probabilities["DEFAULT"] >= 0.9
    assert abs(sum(result.probabilities.values()) - 1.0) < 0.01


def test_revision_trigger():
    """'fix the bug in ServiceBroker' → REVISION at 0.5+."""
    result = classify("fix the bug in ServiceBroker")
    assert result.probabilities["REVISION"] >= 0.5
    assert abs(sum(result.probabilities.values()) - 1.0) < 0.01


def test_reflection_trigger():
    """'why did this happen' → REFLECTION at 0.5+."""
    result = classify("why did this happen")
    assert result.probabilities["REFLECTION"] >= 0.5
    assert abs(sum(result.probabilities.values()) - 1.0) < 0.01


def test_probabilities_sum_to_one():
    """Output always sums to ~1.0 (within float epsilon)."""
    prompts = [
        "hello world",
        "fix the bug",
        "why did this happen",
        "build a new service",
        "run the deployment",
        "compress the log file",
        "what if we tried this",
        "audit the database",
        "constrain the input size",
        "",
        "merge these two branches",
        "some random text with no keywords here",
    ]
    for prompt in prompts:
        result = classify(prompt)
        total = sum(result.probabilities.values())
        assert abs(total - 1.0) < 0.001, (
            f"Prompt {prompt!r}: probabilities sum to {total}, expected 1.0"
        )


# ── Other well-known archetype triggers ──────────────────────────────


def test_construction_trigger():
    result = classify("build a new microservice")
    assert result.probabilities["CONSTRUCTION"] >= 0.3


def test_execution_trigger():
    result = classify("run the deployment pipeline")
    assert result.probabilities["EXECUTION"] >= 0.3


def test_counterfactual_trigger():
    result = classify("what if we tried a different approach")
    assert result.probabilities["COUNTERFACTUAL"] >= 0.4


def test_audit_trigger():
    result = classify("audit the security compliance")
    assert result.probabilities["AUDIT"] >= 0.3


def test_compression_trigger():
    result = classify("summarize the log output")
    assert result.probabilities["COMPRESSION"] >= 0.3


def test_constraint_injection_trigger():
    result = classify("sanitize the user input")
    assert result.probabilities["CONSTRAINT_INJECTION"] >= 0.3


def test_reconciliation_trigger():
    result = classify("merge the two branches")
    assert result.probabilities["RECONCILIATION"] >= 0.3


# ── Edge cases ───────────────────────────────────────────────────────


def test_empty_prompt():
    """Empty string still produces a valid distribution."""
    result = classify("")
    total = sum(result.probabilities.values())
    assert abs(total - 1.0) < 0.001
    assert result.raw_input == ""


def test_case_insensitivity():
    """Keywords match case-insensitively."""
    lower = classify("FIX THE BUG")
    upper = classify("fix the bug")
    assert lower.probabilities == upper.probabilities


def test_classifier_version():
    result = classify("test")
    assert result.classifier_version == "heuristic-v1"


def test_all_frozen_archetypes_appear():
    """Every prompt returns probabilities for all archetypes + DEFAULT."""
    result = classify("any prompt")
    # ARCHETYPES includes REJECT & DEFAULT, but the classifier produces
    # all functional archetypes + DEFAULT.
    for archetype in (
        "CONSTRUCTION", "EXECUTION", "REFLECTION", "RECONCILIATION",
        "REVISION", "COUNTERFACTUAL", "AUDIT", "COMPRESSION",
        "CONSTRAINT_INJECTION", "DEFAULT",
    ):
        assert archetype in result.probabilities, (
            f"Missing archetype {archetype} in probabilities"
        )


# ── Helper: _count_matches ───────────────────────────────────────────


class TestCountMatches:
    def test_single_word(self):
        assert _count_matches("fix the bug", ["fix"]) == 1
        assert _count_matches("fix the bug", ["fix", "bug"]) == 2
        assert _count_matches("prefix", ["fix"]) == 0  # word boundary

    def test_multi_word_phrase(self):
        assert _count_matches("what if we tried", ["what if"]) == 1
        assert _count_matches("hello world", ["what if"]) == 0

    def test_no_match(self):
        assert _count_matches("hello world", ["build", "create"]) == 0

    def test_multiple_matches_same_archetype(self):
        assert _count_matches("fix the bug and refactor", ["fix", "bug", "refactor"]) == 3
