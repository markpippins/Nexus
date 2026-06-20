"""Tests for the AST parser (Station 0)."""

from meep.ast_parser import parse, extract_headings, extract_body_text, ASTDocument


# ── Basic structure ───────────────────────────────────────────────────


def test_empty_text_returns_empty_document():
    """Empty string → document with no nodes."""
    doc = parse("")
    assert len(doc.nodes) == 0
    assert doc.raw_text == ""


def test_single_paragraph():
    """Plain text without markdown produces a single paragraph node."""
    doc = parse("hello world")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "paragraph"
    assert doc.nodes[0].content == "hello world"


def test_multi_line_paragraph():
    """Multiple consecutive text lines fold into one paragraph."""
    doc = parse("line one\nline two\nline three")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "paragraph"
    assert "line one" in doc.nodes[0].content
    assert "line three" in doc.nodes[0].content


def test_blank_line_splits_paragraphs():
    """Blank line between text blocks produces two paragraphs."""
    doc = parse("first paragraph\n\nsecond paragraph")
    assert len(doc.nodes) == 2
    assert doc.nodes[0].node_type == "paragraph"
    assert doc.nodes[1].node_type == "paragraph"
    assert "first" in doc.nodes[0].content
    assert "second" in doc.nodes[1].content


# ── Headings ──────────────────────────────────────────────────────────


def test_atx_heading_h1():
    doc = parse("# Title")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "heading"
    assert doc.nodes[0].level == 1
    assert doc.nodes[0].content == "Title"


def test_atx_heading_h2():
    doc = parse("## Section")
    assert doc.nodes[0].node_type == "heading"
    assert doc.nodes[0].level == 2
    assert doc.nodes[0].content == "Section"


def test_atx_heading_h6():
    doc = parse("###### Deepest")
    assert doc.nodes[0].node_type == "heading"
    assert doc.nodes[0].level == 6
    assert doc.nodes[0].content == "Deepest"


def test_heading_and_paragraph():
    doc = parse("# Title\n\nSome content here.")
    assert len(doc.nodes) == 2
    assert doc.nodes[0].node_type == "heading"
    assert doc.nodes[1].node_type == "paragraph"


def test_multiple_headings():
    doc = parse("# H1\n\n## H2\n\n### H3")
    assert len(doc.nodes) == 3
    assert [n.content for n in doc.nodes] == ["H1", "H2", "H3"]
    assert [n.level for n in doc.nodes] == [1, 2, 3]


# ── Code blocks ───────────────────────────────────────────────────────


def test_fenced_code_block():
    doc = parse("```python\nprint('hello')\n```")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "code_block"
    assert doc.nodes[0].language == "python"
    assert "print('hello')" in doc.nodes[0].content


def test_code_block_without_language():
    doc = parse("```\nplain code\n```")
    assert doc.nodes[0].language == ""


def test_paragraph_then_code():
    doc = parse("some text\n\n```\ncode here\n```")
    assert len(doc.nodes) == 2
    assert doc.nodes[0].node_type == "paragraph"
    assert doc.nodes[1].node_type == "code_block"


# ── Lists ─────────────────────────────────────────────────────────────


def test_unordered_list():
    doc = parse("- item one\n- item two\n- item three")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "list"
    assert doc.nodes[0].language == "unordered"
    assert len(doc.nodes[0].children) == 3
    items = [c.content for c in doc.nodes[0].children]
    assert items == ["item one", "item two", "item three"]


def test_ordered_list():
    doc = parse("1. first\n2. second")
    assert doc.nodes[0].node_type == "list"
    assert doc.nodes[0].language == "ordered"
    items = [c.content for c in doc.nodes[0].children]
    assert items == ["first", "second"]


# ── Blockquotes ───────────────────────────────────────────────────────


def test_blockquote():
    doc = parse("> a quoted line")
    assert len(doc.nodes) == 1
    assert doc.nodes[0].node_type == "blockquote"
    assert doc.nodes[0].content == "a quoted line"


# ── Thematic break ────────────────────────────────────────────────────


def test_thematic_break():
    doc = parse("before\n\n---\n\nafter")
    assert len(doc.nodes) == 3
    assert doc.nodes[1].node_type == "thematic_break"


# ── Complex document ──────────────────────────────────────────────────


def test_complex_markdown_document():
    text = """# Architecture Overview

This document describes the system architecture.

## Components

- API Gateway
- Service Bus
- Database

## Deployment

Run the following:

```bash
docker compose up
```

> Note: This requires Docker.
"""
    doc = parse(text)
    # Expected: heading, paragraph, heading, list, heading, paragraph, code_block, blockquote
    assert len(doc.nodes) == 8
    assert doc.nodes[0].node_type == "heading" and doc.nodes[0].content == "Architecture Overview"
    assert doc.nodes[1].node_type == "paragraph"
    assert doc.nodes[2].node_type == "heading" and doc.nodes[2].content == "Components"
    assert doc.nodes[3].node_type == "list"
    assert doc.nodes[4].node_type == "heading" and doc.nodes[4].content == "Deployment"
    assert doc.nodes[5].node_type == "paragraph"
    assert doc.nodes[6].node_type == "code_block"
    assert doc.nodes[7].node_type == "blockquote"


# ── Convenience helpers ───────────────────────────────────────────────


def test_extract_headings():
    doc = parse("# A\n\nb\n\n## C\n\n### D")
    headings = extract_headings(doc)
    assert headings == ["A", "C", "D"]


def test_extract_body_text_excludes_headings_and_code():
    doc = parse("# Title\n\nBody paragraph.\n\n```\ncode\n```\n\n- list item")
    body = extract_body_text(doc)
    assert "Title" not in body  # heading excluded
    assert "code" not in body  # code excluded
    assert "Body paragraph" in body
    assert "list item" in body


# ── Determinism ───────────────────────────────────────────────────────


def test_parse_determinism():
    """Same text → same AST structure every time."""
    text = "# Title\n\nHello world.\n\n```py\nx=1\n```"
    doc1 = parse(text)
    doc2 = parse(text)
    assert len(doc1.nodes) == len(doc2.nodes)
    for n1, n2 in zip(doc1.nodes, doc2.nodes):
        assert n1.node_type == n2.node_type
        assert n1.content == n2.content
        assert n1.level == n2.level


def test_parse_determinism_long_doc():
    """Same long document → same node count every time."""
    text = "# Doc\n\n## Sec 1\n\nText.\n\n## Sec 2\n\n- a\n- b\n\n> note\n\n---\n\n```\nc\n```"
    doc1 = parse(text)
    doc2 = parse(text)
    assert len(doc1.nodes) == len(doc2.nodes)
