"""AST Parser — Station 0 of the MEEP pipeline.

Parses raw prompt text into a structured AST (Abstract Syntax Tree) that
captures document structure: headings, paragraphs, code blocks, lists, and
blockquotes. The AST is then processed by the feature extractor to produce
structural signals that improve IRL classification accuracy — especially
for long-form inputs like markdown specs and chat transcripts.

Design:
  - Line-oriented parser (not a full CommonMark implementation)
  - Preserves enough structure for the feature extractor to detect:
      * Section hierarchy (heading depth, section count)
      * Code presence (fenced blocks, inline code)
      * List structure (ordered, unordered)
      * Syntactic mood (imperative/interrogative from sentence analysis)
  - Pure function: same text → same AST every time (deterministic)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final


# ── AST Node Types ────────────────────────────────────────────────────

@dataclass
class ASTNode:
    """A single node in the document AST.

    Attributes:
        node_type: One of ``"document"``, ``"heading"``, ``"paragraph"``,
            ``"code_block"``, ``"list"``, ``"list_item"``, ``"blockquote"``,
            ``"thematic_break"``.
        level: Heading level (1--6) for headings; 0 for everything else.
        content: Text content of the node.
        language: Programming language tag for fenced code blocks.
        children: Child nodes (for document, list).
    """
    node_type: str = "document"
    level: int = 0
    content: str = ""
    language: str = ""
    children: list[ASTNode] = field(default_factory=list)


@dataclass
class ASTDocument:
    """Root AST node representing the entire parsed document.

    Attributes:
        nodes: Top-level child nodes (headings, paragraphs, code blocks,
            lists, blockquotes).
        raw_text: The original input text.
    """
    nodes: list[ASTNode] = field(default_factory=list)
    raw_text: str = ""


# ── Regex patterns ────────────────────────────────────────────────────

_HEADING_RE: Final[re.Pattern] = re.compile(r"^#{1,6}\s")
_HR_RE: Final[re.Pattern] = re.compile(r"^\s*[-*_]{3,}\s*$")
_LIST_MARKER_RE: Final[re.Pattern] = re.compile(r"^(\s*)([-*+]|\d+\.)\s")


# ── Parser ────────────────────────────────────────────────────────────

class _ParserState:
    """Internal parser state to avoid globals across ``parse()`` calls."""

    def __init__(self, lines: list[str]) -> None:
        self.lines = lines
        self.i = 0
        self.top_level: list[ASTNode] = []
        self.list_stack: list[ASTNode] | None = None
        self._paragraph_acc: str | None = None  # accumulating paragraph text

    def flush_paragraph(self) -> None:
        """Emit the accumulated paragraph as an AST node, if any."""
        if self._paragraph_acc is not None:
            self.top_level.append(ASTNode(
                node_type="paragraph",
                content=self._paragraph_acc,
            ))
            self._paragraph_acc = None

    def append_to_paragraph(self, text: str) -> None:
        """Append text to the current paragraph or start a new one."""
        if self._paragraph_acc is None:
            self._paragraph_acc = text
        else:
            self._paragraph_acc += " " + text

    def close_list(self) -> None:
        """If we're inside a list, stop accumulating list items.

        The list node is already attached to ``top_level`` by reference,
        so we just clear the stack.
        """
        if self.list_stack is not None:
            # Check if list is really done — if next non-empty line
            # isn't a list item, seal it.
            lookahead = self.i + 1
            while lookahead < len(self.lines) and self.lines[lookahead].strip() == "":
                lookahead += 1
            if lookahead >= len(self.lines) or not _LIST_MARKER_RE.match(self.lines[lookahead]):
                self.list_stack = None


def parse(text: str) -> ASTDocument:
    """Parse raw text into an AST document.

    Args:
        text: Raw prompt or document text.

    Returns:
        ASTDocument with structured nodes.
    """
    doc = ASTDocument(raw_text=text)
    st = _ParserState(text.split("\n"))

    while st.i < len(st.lines):
        line = st.lines[st.i]

        # ── Thematic break ────────────────────────────────────────
        if _HR_RE.match(line):
            st.flush_paragraph()
            st.list_stack = None
            st.top_level.append(ASTNode(node_type="thematic_break"))
            st.i += 1
            continue

        # ── Fenced code block ─────────────────────────────────────
        if line.startswith("```"):
            st.flush_paragraph()
            st.list_stack = None
            fence_len = len(line) - len(line.lstrip("`"))
            if fence_len == 0:
                fence_len = 3
            lang = line[fence_len:].strip()
            code_lines: list[str] = []
            st.i += 1
            while st.i < len(st.lines) and not st.lines[st.i].startswith("```"):
                code_lines.append(st.lines[st.i])
                st.i += 1
            st.i += 1  # skip closing fence
            st.top_level.append(ASTNode(
                node_type="code_block",
                content="\n".join(code_lines),
                language=lang,
            ))
            continue

        # ── Heading ───────────────────────────────────────────────
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            st.flush_paragraph()
            st.list_stack = None
            level = len(heading_match.group().strip())
            content = line[heading_match.end():].strip()
            st.top_level.append(ASTNode(
                node_type="heading",
                level=level,
                content=content,
            ))
            st.i += 1
            continue

        # ── Blockquote ────────────────────────────────────────────
        if line.startswith(">"):
            st.flush_paragraph()
            st.list_stack = None
            content = line.lstrip(">").strip()
            st.top_level.append(ASTNode(
                node_type="blockquote",
                content=content,
            ))
            st.i += 1
            continue

        # ── List item (unordered or ordered) ──────────────────────
        list_match = _LIST_MARKER_RE.match(line)
        if list_match:
            indent = len(list_match.group(1))
            marker = list_match.group(2)
            content = line[list_match.end():].strip()
            ordered = marker[-1] == '.'

            if st.list_stack is None:
                st.list_stack = []
                st.top_level.append(ASTNode(
                    node_type="list",
                    children=st.list_stack,
                    language="ordered" if ordered else "unordered",
                ))

            st.list_stack.append(ASTNode(
                node_type="list_item",
                content=content,
                level=indent,
            ))
            st.i += 1
            continue

        # ── Empty line ────────────────────────────────────────────
        if line.strip() == "":
            st.flush_paragraph()
            st.close_list()
            st.i += 1
            continue

        # ── Regular text (paragraph content) ──────────────────────
        st.append_to_paragraph(line.strip())
        st.i += 1

    # Flush any remaining paragraph
    st.flush_paragraph()

    doc.nodes = st.top_level
    return doc


# ── Convenience ───────────────────────────────────────────────────────

def extract_headings(doc: ASTDocument) -> list[str]:
    """Return all heading text from the document, in order."""
    return [
        n.content
        for n in doc.nodes
        if n.node_type == "heading"
    ]


def extract_code(doc: ASTDocument) -> list[str]:
    """Return all code block content from the document."""
    return [
        n.content
        for n in doc.nodes
        if n.node_type == "code_block"
    ]


def extract_body_text(doc: ASTDocument) -> str:
    """Return all non-heading, non-code text (paragraphs + list items)."""
    parts: list[str] = []
    for n in doc.nodes:
        if n.node_type == "paragraph":
            parts.append(n.content)
        elif n.node_type == "list":
            for child in n.children:
                if child.node_type == "list_item":
                    parts.append(child.content)
        elif n.node_type == "blockquote":
            parts.append(n.content)
    return " ".join(parts)
