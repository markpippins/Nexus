"""Discourse-arc segmenter (spec C6) — deterministic port of the legacy
discourse_segmenter.py rules. Segments NEVER start on filler and NEVER end
mid-arc: candidates don't open with "alright, go ahead" or trail off with
"if you'd like, we could...".

drift_threshold metric: Jaccard similarity between stopword-filtered,
lowercased alphanumeric token sets of consecutive NON-FILLER user turns.
similarity < drift_threshold => topic drift => new arc. Default 0.08 biases
toward extending segments (under-segmentation is recoverable; mid-arc cuts
are not). Tune per spec: label ~30 boundaries, sweep 0.02-0.20, pick knee.
"""

from __future__ import annotations

import re

FILLER_PHRASES = {
    "ok", "okay", "sure", "yeah", "yes", "yep", "yup", "right", "correct",
    "got it", "gotcha", "understood", "makes sense", "agreed", "sounds good",
    "great", "perfect", "nice", "cool", "good",
    "let's continue", "lets continue", "continue", "go ahead", "proceed",
    "next", "next one", "go on", "keep going", "and then",
    "alright", "alright let's continue", "please continue",
    "anything else", "nothing else", "that's all", "thats all",
}
MAX_FILLER_TOKENS = 6

RESOLUTION_MARKERS = [
    r"\bis there anything else\b", r"\banything else (i can|you need)\b",
    r"\blet me know if\b", r"\b(shall|do you want me to) (continue|proceed|move on|go on)\b",
    r"\bto (recap|summarize|sum up)\b", r"\bin summary\b",
    r"\bdoes that (answer|address|make sense|help)\b", r"\bhope that helps\b",
    r"\bwe could (extend|continue|explore) (this|that|further|more)\b",
    r"\bwould you like me to (continue|proceed|elaborate|expand|go deeper)\b",
    r"\bif you['’]?d like\b",
]
_RES = [re.compile(p, re.I) for p in RESOLUTION_MARKERS]

TOPIC_SHIFT_RE = re.compile(
    r"^\s*(?:alright|ok|okay|so|now|next|let'?s|moving on|switching|unrelated|"
    r"different question|another thing|one more thing|can we|how about|what about)\b",
    re.I,
)

STOPWORDS = set(
    """the a an and or but to of in on for with is are was were be been being it this
    that these those i you we they he she my your our their its his her so if then than
    as at by from into about what which can could should would will do does did not no
    yes have has had just also very more most some any all lets ok okay sure yeah please
    like get got want make makes use using used one two new now here there""".split()
)

TOKEN_RE = re.compile(r"[a-z0-9']+")


def _tokens(text: str) -> set[str]:
    return {t for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 1.0  # no overlap signal -> treat as fully similar (conservative)
    return len(a & b) / len(a | b)


def _is_filler(text: str) -> bool:
    t = text.strip().lower()
    tokens = TOKEN_RE.findall(t)
    if len(tokens) > MAX_FILLER_TOKENS:
        return False
    norm = " ".join(tokens).strip(" .!,")
    return any(norm == p or norm.startswith(p) for p in FILLER_PHRASES)


def _closes_arc(text: str) -> bool:
    return any(rx.search(text) for rx in _RES)


def segment(turns: list[dict], drift_threshold: float = 0.08) -> list[dict]:
    """turns: [{index, role, content_md}] -> arc segments.

    Returns [{segment_index, start_turn, end_turn, boundary_reason, heading,
              turn_count, is_filler[]}]. Conservative: extends rather than splits.
    """
    n = len(turns)
    if n == 0:
        return []
    filler = [_is_filler(t["content_md"]) for t in turns]
    user_sigs: dict[int, set] = {
        t["index"]: _tokens(t["content_md"]) for t in turns if t["role"] == "user"
    }

    segs: list[dict] = []
    start = 0
    last_user_idx = next((t["index"] for t in turns if t["role"] == "user"), None)

    def close(end: int, reason: str):
        seg_turns = turns[start:end + 1]
        first_non_filler = next((t for t in seg_turns if not filler[t["index"]]), None)
        title_src = (first_non_filler or seg_turns[0])["content_md"]
        heading = " ".join(TOKEN_RE.findall(title_src.lower()))[:60].strip() or f"Segment {len(segs)}"
        segs.append({
            "segment_index": len(segs),
            "start_turn": start,
            "end_turn": end,
            "boundary_reason": reason,
            "heading": heading,
            "turn_count": len(seg_turns),
            "is_filler": [filler[t["index"]] for t in seg_turns],
        })

    for i, t in enumerate(turns):
        is_last = i == n - 1
        if is_last:
            close(i, "end_of_transcript")
            break

        nxt = turns[i + 1]
        # Arc closure on assistant resolution markers.
        if t["role"] == "assistant" and _closes_arc(t["content_md"]) and nxt["role"] == "user":
            close(i, "arc_closure")
            start = i + 1
            last_user_idx = nxt["index"]
            continue

        # Topic drift between consecutive non-filler USER turns.
        if nxt["role"] == "user" and not filler[nxt["index"]]:
            drift = False
            if last_user_idx is not None and last_user_idx != nxt["index"]:
                sim = _jaccard(user_sigs.get(last_user_idx, set()), user_sigs.get(nxt["index"], set()))
                drift = sim < drift_threshold
            explicit_shift = bool(TOPIC_SHIFT_RE.match(nxt["content_md"]))
            if (drift or explicit_shift) and i >= start:
                close(i, "topic_drift" if drift else "explicit_topic_shift")
                start = i + 1
            last_user_idx = nxt["index"]
    return segs
