"""IRL Classifier — Station 1 of the MEEP pipeline.

Keyword-based heuristic classifier that maps a raw prompt string to a
probability distribution over frozen InteractionArchetypes.

The IRL classifier never decides a single answer — it only proposes
probability mass across archetypes. Deterministic selection is delegated
to the IR resolver (Station 2).

Design:
  - Each archetype has a keyword list (single words and multi-word phrases)
  - Keyword hits are counted with word-boundary matching for single words
    and substring matching for phrases
  - DEFAULT always receives a standing reserve of 1.0, ensuring prompts
    with no matching keywords default to a fallback archetype
  - Raw scores are normalized to produce a valid probability distribution
    that sums to 1.0 (within floating-point epsilon)
  - When AST features are provided (from Station 0) AND the document has
    genuine structural features (headings, code blocks, lists, or 75+
    words), heading text is keyword-matched at 2x weight and structural
    bonuses are applied.  Short paragraph-only prompts are unaffected —
    the classifier behaves identically to the raw-text baseline.
"""

from __future__ import annotations

import re
from typing import Final

from meep.models import IRLResult


# ── Keyword sets ──────────────────────────────────────────────────────
# Each archetype has a list of trigger words or short phrases.
# Single words are matched with \b word boundaries.
# Multi-word phrases are matched as substrings.

KEYWORDS: Final[dict[str, list[str]]] = {
    "CONSTRUCTION": [
        "build", "create", "make", "implement", "construct", "add",
        "new", "develop", "establish", "setup", "scaffold", "generate",
        "write", "produce", "assemble", "configure",
    ],
    "EXECUTION": [
        "run", "execute", "do", "perform", "process", "start",
        "deploy", "launch", "trigger", "invoke", "proceed", "go",
        "apply", "activate", "engage",
    ],
    "REFLECTION": [
        "why", "analyze", "reflect", "think", "understand", "explain",
        "happen", "happened", "investigate", "meaning", "root cause",
        "reason", "what happened", "how did", "what does", "what caused",
        "diagnose", "trace",
    ],
    "RECONCILIATION": [
        "reconcile", "merge", "align", "harmonize", "unify", "integrate",
        "bring together", "resolve conflict", "synchronize", "consolidate",
        "mediate",
    ],
    "REVISION": [
        "fix", "change", "update", "revise", "modify", "correct",
        "improve", "refactor", "bug", "patch", "error", "issue",
        "rewrite", "redo", "amend", "edit", "adjust", "repair",
    ],
    "COUNTERFACTUAL": [
        "what if", "imagine", "alternative", "hypothetical",
        "could have", "might have", "suppose", "what would",
        "what could", "otherwise",
    ],
    "AUDIT": [
        "audit", "check", "verify", "validate", "inspect",
        "assess", "compliance", "review compliance", "examine",
        "confirm",
    ],
    "COMPRESSION": [
        "compress", "summarize", "summarise", "condense", "shorten",
        "extract", "reduce", "overview", "tl;dr", "brief",
        "digest", "synopsis",
    ],
    "CONSTRAINT_INJECTION": [
        "constrain", "limit", "restrict", "safe", "guard", "bound",
        "permission", "authorize", "secure", "sanitize", "validate input",
        "safety", "permit", "allowlist",
    ],
}

# Archetypes that are classified by keyword matching (all functional ones).
# DEFAULT is synthetic (standing reserve). REJECT is handled by the resolver.
CLASSIFIER_ARCHETYPES: Final[tuple[str, ...]] = tuple(KEYWORDS.keys())

# Standing reserve for DEFAULT — ensures every prompt produces a non-zero
# probability for the fallback archetype.
_DEFAULT_RESERVE: Final[float] = 1.0


def classify(prompt: str, ast_features: object = None) -> IRLResult:
    """Classify a prompt into a probability distribution over archetypes.

    Args:
        prompt: Raw text prompt.
        ast_features: Optional ``ASTFeatures`` from the feature extractor.
            When provided and the document has structural features
            (headings, code blocks, lists, or 75+ words), heading text
            is weighted at 2x and structural bonuses boost archetypes
            that match the document's shape.  Short paragraph-only
            prompts behave identically to the baseline.

    Returns:
        IRLResult with probabilities summing to 1.0 (within float epsilon).
    """
    # Import here to avoid circular dependency at module level.
    if ast_features is not None:
        from meep.ast_features import ASTFeatures
        assert isinstance(ast_features, ASTFeatures)

        if ast_features.has_structural_features:
            version = "heuristic-v1+ast"
            probs = _compute_probs_with_features(prompt, ast_features)
        else:
            # Document has no structural features — fall back to baseline.
            version = "heuristic-v1"
            probs = _compute_probs(prompt)
    else:
        version = "heuristic-v1"
        probs = _compute_probs(prompt)

    return IRLResult(
        probabilities=probs,
        raw_input=prompt,
        classifier_version=version,
    )


# ── Baseline: raw-text keyword matching ───────────────────────────────


def _compute_probs(prompt: str) -> dict[str, float]:
    """Compute normalized probabilities from raw text only.

    Algorithm:
        1. Lowercase the prompt.
        2. For each functional archetype, count keyword matches.
        3. Add the DEFAULT standing reserve.
        4. Normalize so the distribution sums to 1.0.
    """
    lower = prompt.lower()

    raw_scores: dict[str, float] = {}
    for archetype, keywords in KEYWORDS.items():
        raw_scores[archetype] = float(_count_matches(lower, keywords))

    raw_scores["DEFAULT"] = _DEFAULT_RESERVE
    return _normalize(raw_scores)


# ── AST-enhanced: uses structural features ────────────────────────────


def _compute_probs_with_features(prompt: str,
                                 features: object) -> dict[str, float]:
    """Compute normalized probabilities using AST structural features.

    Only called when ``features.has_structural_features`` is True.

    Adds additional signal on top of the baseline keyword matching:
      - Heading text keywords contribute an extra +1 per match (2x total)
      - Structural bonuses boost archetypes that match the document shape
      - DEFAULT still gets its standing reserve
    """
    from meep.ast_features import ASTFeatures
    assert isinstance(features, ASTFeatures)

    # 1. Keyword matching on raw prompt (baseline) — ensures short-prompt
    #    keyword hits are always counted regardless of structure.
    lower = prompt.lower()
    raw_scores: dict[str, float] = {}
    for archetype, keywords in KEYWORDS.items():
        raw_scores[archetype] = float(_count_matches(lower, keywords))

    # 2. Additional keyword matching on heading text at 2x weight.
    #    Heading text often carries higher semantic density than body text.
    if features.has_headings and features.heading_text.strip():
        heading_lower = features.heading_text.lower()
        for archetype, keywords in KEYWORDS.items():
            heading_matches = _count_matches(heading_lower, keywords)
            raw_scores[archetype] += heading_matches * 1.0  # extra weight
            # Total heading weight = 2x (1x from body text already counted
            # in step 1, 1x extra here)

    # 3. Structural bonuses — these boost archetypes that match the
    #    document's structural profile.
    #    - Code blocks → document describes implementation → CONSTRUCTION
    #    - Headings → document is a structured spec → CONSTRUCTION
    #    - Lists → document has enumerated items → CONSTRUCTION (weak)
    if features.has_code_blocks:
        raw_scores["CONSTRUCTION"] += 1.0

    if features.has_headings:
        raw_scores["CONSTRUCTION"] += 1.0

    if features.has_lists:
        raw_scores["CONSTRUCTION"] += 0.5

    if features.is_long_document:
        raw_scores["CONSTRUCTION"] += 0.5

    # 4. DEFAULT standing reserve.
    raw_scores["DEFAULT"] = _DEFAULT_RESERVE

    return _normalize(raw_scores)


# ── Shared helpers ────────────────────────────────────────────────────


def _normalize(raw_scores: dict[str, float]) -> dict[str, float]:
    """Normalize a dict of raw scores to probabilities summing to 1.0."""
    total = sum(raw_scores.values())
    if total == 0.0:
        n = len(raw_scores)
        return {k: 1.0 / n for k in raw_scores}
    return {k: v / total for k, v in raw_scores.items()}


def _count_matches(lower: str, keywords: list[str]) -> int:
    """Count how many keywords match the lowercased prompt text.

    Single-word keywords use ``\\b`` word-boundary matching.
    Multi-word phrases use simple substring containment.
    """
    count = 0
    for kw in keywords:
        if " " in kw:
            # Multi-word phrase — substring match is sufficient.
            if kw in lower:
                count += 1
        else:
            # Single word — require word boundaries so "fix" doesn't
            # match "prefix" or "suffix".
            if re.search(r"\b" + re.escape(kw) + r"\b", lower):
                count += 1
    return count
