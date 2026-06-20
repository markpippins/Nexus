"""Tests for the AST feature extractor."""

from meep.ast_parser import parse
from meep.ast_features import extract_features


# ── Short prompts (no markdown structure) ─────────────────────────────


def test_short_prompt_no_structure():
    """'hello world' → no headings, no code, not long, word_count=2."""
    doc = parse("hello world")
    features = extract_features(doc)
    assert features.word_count == 2
    assert not features.is_long_document
    assert not features.has_headings
    assert not features.has_code_blocks
    assert not features.has_lists
    assert not features.has_structural_features


def test_short_prompt_no_structural_gate():
    """'audit the database' → no structural features (short, no markdown)."""
    doc = parse("audit the database")
    features = extract_features(doc)
    assert not features.has_structural_features
    assert not features.has_headings
    assert not features.has_code_blocks
    assert not features.has_lists
    assert not features.is_long_document


# ── Document structure features ───────────────────────────────────────


def test_headings_detected():
    doc = parse("# Title\n\n## Section\n\nContent here.")
    features = extract_features(doc)
    assert features.has_headings
    assert features.heading_count == 2
    assert features.max_heading_depth == 2
    assert features.has_structural_features


def test_code_blocks_detected():
    doc = parse("```python\nprint('hello')\n```")
    features = extract_features(doc)
    assert features.has_code_blocks
    assert features.code_block_count == 1
    assert features.code_block_line_count == 1
    assert features.has_structural_features


def test_code_block_line_count():
    doc = parse("```\nline1\nline2\nline3\n```")
    features = extract_features(doc)
    assert features.code_block_line_count == 3


def test_lists_detected():
    doc = parse("- a\n- b\n- c")
    features = extract_features(doc)
    assert features.has_lists
    assert features.list_count == 1
    assert features.has_structural_features


# ── Long document threshold ───────────────────────────────────────────


def test_short_document_not_long():
    doc = parse("hello world")
    features = extract_features(doc)
    assert not features.is_long_document


def test_long_document_flag():
    """Document with 80+ words → is_long_document = True."""
    text = "word " * 80
    doc = parse(text)
    features = extract_features(doc)
    assert features.is_long_document
    assert features.has_structural_features  # gated via length


# ── Segmented text ────────────────────────────────────────────────────


def test_segmented_text():
    """Heading, body, and code text are separated."""
    text = "# Design\n\nThis is the design doc.\n\n```\ncode snippet\n```"
    doc = parse(text)
    features = extract_features(doc)
    assert "Design" in features.heading_text
    assert "design doc" in features.body_text
    assert "code snippet" in features.code_text


def test_body_text_includes_list_items():
    doc = parse("- item 1\n- item 2")
    features = extract_features(doc)
    assert "item 1" in features.body_text
    assert "item 2" in features.body_text


# ── Complex document ──────────────────────────────────────────────────


def test_complex_document_features():
    """A markdown spec triggers multiple structural signals."""
    text = """# System Design

## Overview

This system handles distributed task execution.

## Components

- Task Scheduler
- Worker Pool
- Result Store

## Deployment

Run with Docker:

```yaml
version: '3'
services:
  app:
    build: .
```

## Configuration

Set environment variables before starting.
"""
    doc = parse(text)
    features = extract_features(doc)

    assert features.has_headings
    assert features.heading_count == 5  # System Design, Overview, Components, Deployment, Configuration
    assert features.max_heading_depth == 2

    assert features.has_code_blocks
    assert features.code_block_count == 1

    assert features.has_lists
    assert features.list_count == 1

    assert features.word_count > 30
    assert not features.is_long_document  # < 75 words with this text

    assert features.has_structural_features  # headings + code + lists

    # Heading text should contain section titles
    assert "System Design" in features.heading_text
    assert "Components" in features.heading_text
    assert "Deployment" in features.heading_text


# ── Determinism ───────────────────────────────────────────────────────


def test_feature_extraction_determinism():
    """Same text → identical features every time."""
    text = "# Title\n\nBody.\n\n```\ncode\n```"
    f1 = extract_features(parse(text))
    f2 = extract_features(parse(text))
    assert f1.word_count == f2.word_count
    assert f1.heading_count == f2.heading_count
    assert f1.has_headings == f2.has_headings
    assert f1.has_code_blocks == f2.has_code_blocks
    assert f1.heading_text == f2.heading_text
    assert f1.body_text == f2.body_text
    assert f1.code_text == f2.code_text
    assert f1.has_structural_features == f2.has_structural_features
