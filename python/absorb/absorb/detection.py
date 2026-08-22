"""Format detection (spec C5/C7): signature registry + required fallback.

The `detect` block is REQUIRED per profile; absence is E_CONFIG_MISSING_DETECT.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .errors import AbsorbError


def _sig_chatgpt_export_markdown(path: str) -> float:
    """utils/chat-export markdown: YAML frontmatter (title/id/create_time)
    followed by '# <title>' and '## User' / '## Assistant' turns."""
    p = Path(path)
    if p.suffix.lower() != ".md":
        return 0.0
    try:
        # 64KB window: long frontmatter or a large first message can push
        # '## User'/'## Assistant' markers past a smaller scan.
        head = p.open("r", errors="replace").read(65536)
    except OSError:
        return 0.0
    score = 0.0
    if head.startswith("---"):
        score += 0.35
        if re.search(r"^title:", head, re.M):
            score += 0.2
        if re.search(r"^create_time:", head, re.M):
            score += 0.15
    if "\n## User" in head or "## User" in head.split("\n\n")[0]:
        score += 0.2
    if "## Assistant" in head:
        score += 0.1
    return min(score, 1.0)


SIGNATURES = {
    "chatgpt_export_markdown": _sig_chatgpt_export_markdown,
}

VALID_FALLBACKS = {"generic_document", "fail_early", "skip_source"}


def detect(path: str, detect_cfg: dict) -> dict:
    """Run signatures against one file.

    detect_cfg is REQUIRED (validated at profile load):
        {confidence_threshold: float, fallback: generic_document|fail_early|skip_source}
    """
    if not detect_cfg:
        raise AbsorbError("E_CONFIG_MISSING_DETECT", "profile has no detect block")
    fallback = detect_cfg.get("fallback")
    threshold = float(detect_cfg.get("confidence_threshold", 0.85))
    if fallback not in VALID_FALLBACKS:
        raise AbsorbError(
            "E_CONFIG_BAD_FALLBACK",
            f"detect.fallback must be one of {sorted(VALID_FALLBACKS)}, got {fallback!r}",
        )

    best_format, best_score = None, 0.0
    for fmt, fn in SIGNATURES.items():
        score = fn(path)
        if best_format is None or score > best_score:
            best_format, best_score = fmt, score

    if best_format and best_score >= threshold:
        return {"format": best_format, "confidence": round(best_score, 2), "action": "parse"}

    # Low confidence / unknown: explicit fallback behavior (no silent default).
    if fallback == "generic_document":
        return {"format": "generic_document", "confidence": round(best_score, 2), "action": "parse"}
    if fallback == "skip_source":
        return {
            "format": best_format or "unknown",
            "confidence": round(best_score, 2),
            "action": "skip",
            "reason": f"E_PERMANENT_FORMAT_UNDETECTED (best={best_format}, conf={best_score:.2f})",
        }
    raise AbsorbError(
        "E_PERMANENT_FORMAT_UNDETECTED",
        f"{path}: best={best_format} conf={best_score:.2f} < {threshold}",
    )


# JSON dump helper kept here so tests can build synthetic profiles easily.
def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)
