"""AST Feature Extractor — extracts structured signals from parsed AST.

The feature extractor sits between the AST parser (Station 0) and the IRL
classifier (Station 1). It computes structural features that the classifier
uses as additional dimensions alongside keyword matching — improving
accuracy for long-form documents (markdown specs, transcripts, etc.).

Features extracted:
  - **Document structure**: heading count/depth, code block presence, list
    presence, total word count, long-document flag
  - **Weighted keyword access**: heading text and body text are exposed
    separately so the classifier can weight them differently

Key design constraint: structural bonuses are ONLY applied for documents
with meaningful markdown structure (headings, code blocks, or lists) OR
long documents (75+ words). Short paragraph-only prompts get NO structural
bonuses, preserving backward compatibility with the raw-text classifier.

All computations are deterministic — same AST → same features.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from meep.ast_parser import ASTDocument


@dataclass
class ASTFeatures:
    """Structured features extracted from a parsed AST document.

    These features are passed to the IRL classifier alongside the raw
    prompt text to improve archetype probability estimation.
    """
    # ── Document statistics ───────────────────────────────────────
    word_count: int = 0
    is_long_document: bool = False

    # ── Heading structure ─────────────────────────────────────────
    has_headings: bool = False
    heading_count: int = 0
    max_heading_depth: int = 0

    # ── Code presence ─────────────────────────────────────────────
    has_code_blocks: bool = False
    code_block_count: int = 0
    code_block_line_count: int = 0

    # ── List structure ────────────────────────────────────────────
    has_lists: bool = False
    list_count: int = 0

    # ── Segmented text for weighted keyword matching ──────────────
    heading_text: str = ""
    body_text: str = ""
    code_text: str = ""

    # ── Gate: whether this document has structural prose features ─
    # ``True`` if headings, code blocks, lists, or word_count > 75.
    has_structural_features: bool = False

    # ── Raw AST reference (for debugging / downstream use) ────────
    raw_ast: ASTDocument | None = None


# ── Constants ────────────────────────────────────────────────────────

# Threshold: documents over this word count get structural bonuses
# even without markdown structure.
_LONG_DOC_THRESHOLD: Final[int] = 75


def extract_features(doc: ASTDocument) -> ASTFeatures:
    """Extract structured features from a parsed AST document.

    Args:
        doc: The parsed AST document from ``ast_parser.parse()``.

    Returns:
        ASTFeatures with all feature fields populated.
    """
    features = ASTFeatures(raw_ast=doc)

    # Collect segmented text
    heading_texts: list[str] = []
    body_parts: list[str] = []
    code_texts: list[str] = []

    for node in doc.nodes:
        if node.node_type == "heading":
            heading_texts.append(node.content)
            features.heading_count += 1
            features.max_heading_depth = max(features.max_heading_depth, node.level)

        elif node.node_type == "code_block":
            code_texts.append(node.content)
            features.code_block_count += 1
            features.code_block_line_count += node.content.count("\n") + 1

        elif node.node_type == "paragraph":
            body_parts.append(node.content)

        elif node.node_type == "list":
            features.list_count += 1
            items = [c.content for c in node.children if c.node_type == "list_item"]
            body_parts.extend(items)

        elif node.node_type == "blockquote":
            body_parts.append(node.content)

    features.has_headings = features.heading_count > 0
    features.has_code_blocks = features.code_block_count > 0
    features.has_lists = features.list_count > 0

    features.heading_text = "\n".join(heading_texts)
    features.body_text = " ".join(body_parts)
    features.code_text = "\n".join(code_texts)

    # Word count (all text including headings and code)
    all_text = " ".join([features.heading_text, features.body_text, features.code_text])
    words = all_text.split()
    features.word_count = len(words)
    features.is_long_document = features.word_count > _LONG_DOC_THRESHOLD

    # Gate: structural bonuses are only applied when the document has
    # genuine markdown structure OR is long enough to warrant analysis.
    features.has_structural_features = (
        features.has_headings
        or features.has_code_blocks
        or features.has_lists
        or features.is_long_document
    )

    return features
