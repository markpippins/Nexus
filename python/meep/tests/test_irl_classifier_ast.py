"""Tests for the IRL classifier with AST feature enhancement.

Verifies that AST structural features correctly adjust archetype
probabilities while maintaining backward compatibility for short
paragraph-only prompts.
"""

from meep.ast_parser import parse
from meep.ast_features import extract_features
from meep.irl_classifier import classify


# ── Backward compatibility ────────────────────────────────────────────


def test_classify_without_ast_matches_baseline():
    """classify(prompt) without ast_features produces heuristic-v1 version."""
    result = classify("hello world")  # no ast_features
    assert result.classifier_version == "heuristic-v1"


def test_short_prompt_no_ast_version_with_features():
    """Short paragraph-only prompt with AST features → still heuristic-v1."""
    doc = parse("hello world")
    features = extract_features(doc)
    assert not features.has_structural_features  # no headings/code/lists
    result = classify("hello world", ast_features=features)
    # Falls back to baseline because no structural features
    assert result.classifier_version == "heuristic-v1"


def test_markdown_doc_uses_ast_version():
    """Document with headings uses heuristic-v1+ast."""
    doc = parse("# Title\n\nBody text.")
    features = extract_features(doc)
    assert features.has_structural_features
    result = classify("# Title\n\nBody text.", ast_features=features)
    assert result.classifier_version == "heuristic-v1+ast"


# ── Short prompts: unchanged (no structural features) ────────────────


def test_short_greeting_default_unchanged():
    """'hello world' — AST features don't change probabilities."""
    doc = parse("hello world")
    features = extract_features(doc)
    result = classify("hello world", ast_features=features)
    baseline = classify("hello world")
    assert result.probabilities == baseline.probabilities


def test_short_audit_unchanged():
    """'audit the database' — no structural features → baseline behavior."""
    doc = parse("audit the database")
    features = extract_features(doc)
    result = classify("audit the database", ast_features=features)
    baseline = classify("audit the database")
    assert result.probabilities["AUDIT"] == baseline.probabilities["AUDIT"]
    assert result.probabilities["AUDIT"] >= 0.4


def test_probs_still_sum_to_one():
    """Classifier still produces valid distributions with AST features."""
    prompts = [
        "hello world",
        "fix the bug",
        "why did this happen",
        "build a new service",
        "run the deployment",
    ]
    for prompt in prompts:
        doc = parse(prompt)
        features = extract_features(doc)
        result = classify(prompt, ast_features=features)
        total = sum(result.probabilities.values())
        assert abs(total - 1.0) < 0.001, f"Prompt {prompt!r}: sum={total}"


# ── AST structure effects ─────────────────────────────────────────────


def test_headings_boost_construction():
    """Document with headings gets CONSTRUCTION boosted."""
    text = "# Specification\n\n## Requirements\n\n## Design"
    doc = parse(text)
    features = extract_features(doc)
    assert features.has_structural_features
    result = classify(text, ast_features=features)
    baseline = classify(text)
    assert result.probabilities["CONSTRUCTION"] > baseline.probabilities["CONSTRUCTION"]


def test_code_blocks_boost_construction():
    text = "some text\n\n```python\nx = 1\n```\n\nmore text"
    doc = parse(text)
    features = extract_features(doc)
    assert features.has_structural_features
    result = classify(text, ast_features=features)
    baseline = classify(text)
    assert result.probabilities["CONSTRUCTION"] > baseline.probabilities["CONSTRUCTION"]


def test_lists_boost_construction():
    text = "- item a\n- item b\n- item c"
    doc = parse(text)
    features = extract_features(doc)
    assert features.has_structural_features
    result = classify(text, ast_features=features)
    baseline = classify(text)
    assert result.probabilities["CONSTRUCTION"] > baseline.probabilities["CONSTRUCTION"]


def test_heading_keywords_weighted_higher():
    """Keywords in heading text get extra weight (2x)."""
    # 'build' in heading should give CONSTRUCTION more boost than
    # 'build' in body text alone
    body_only = parse("We need to build the system.")
    heading = parse("# Build the system\n\nSome details.")

    feats_body = extract_features(body_only)
    feats_heading = extract_features(heading)
    assert not feats_body.has_structural_features   # short, no headings
    assert feats_heading.has_structural_features     # has heading

    result_body = classify("We need to build the system.", ast_features=feats_body)
    result_heading = classify("# Build the system\n\nSome details.", ast_features=feats_heading)

    # The heading version should have higher CONSTRUCTION from 2x keyword weight
    assert result_heading.probabilities["CONSTRUCTION"] >= result_body.probabilities["CONSTRUCTION"]


# ── Long document effects ─────────────────────────────────────────────


def test_long_document_boosts_construction():
    """Long document (80+ words) gets CONSTRUCTION boost even without markdown."""
    text = "word " * 80
    doc = parse(text)
    features = extract_features(doc)
    assert features.has_structural_features  # via long doc gate

    result = classify(text, ast_features=features)
    baseline = classify(text)
    assert result.probabilities["CONSTRUCTION"] > baseline.probabilities["CONSTRUCTION"]


# ── Markdown spec detection ───────────────────────────────────────────


def test_markdown_spec_shifts_toward_construction():
    """A structured markdown document shifts probability toward CONSTRUCTION."""
    text = """# System Architecture

## Overview

This document describes the system architecture.

## Components

- API Gateway
- Service Bus
- Database

## Data Flow

Requests flow through the system as follows:

```mermaid
graph TD
    A[Client] --> B[Gateway]
    B --> C[Service Bus]
    C --> D[Worker]
    D --> E[Database]
```

## Configuration

Set environment variables before deployment.
"""
    doc = parse(text)
    features = extract_features(doc)

    assert features.has_structural_features
    assert features.has_headings
    assert features.heading_count == 5  # System Architecture, Overview, Components, Data Flow, Configuration
    assert features.has_code_blocks
    assert features.has_lists

    result = classify(text, ast_features=features)
    baseline = classify(text)

    # CONSTRUCTION should be higher with AST features for a spec doc
    assert result.probabilities["CONSTRUCTION"] > baseline.probabilities["CONSTRUCTION"]


# ── Determinism ───────────────────────────────────────────────────────


def test_classifier_with_ast_determinism():
    """Same text + same AST → same probabilities every time."""
    text = "# Title\n\nBody.\n\n```\ncode\n```"
    doc = parse(text)
    features = extract_features(doc)

    r1 = classify(text, ast_features=features)
    r2 = classify(text, ast_features=features)

    assert r1.probabilities == r2.probabilities
    assert r1.classifier_version == r2.classifier_version
