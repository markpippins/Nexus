#!/usr/bin/env python3
"""
Rule-based discourse-arc segmenter.

INPUT:  a parsed transcript = { title, turns: [{role, content, ...}], ... }
OUTPUT: a list of segments, each covering a contiguous range of turns:

    {
      "segment_index": 0,
      "arc_type": "initiation-response-resolution",
      "start_turn": 0,
      "end_turn": 2,            # inclusive
      "roles": ["user","assistant","user"],
      "boundary_reason": "topic_drift",   # for the NEXT segment's start
      "is_filler_turns": [false, false, false],
      "title": "<first non-filler user turn, truncated>",
      "turn_count": 3,
    }

A segment is a coherent discourse arc. It NEVER ends mid-arc (e.g. the
assistant trailing "if you'd like, we could extend…" is kept with the arc
it belongs to) and NEVER starts on filler ("sure, let's continue" is pooled
into the arc it bookends rather than launching a new one).

Segmentation signals (deterministic, no LLM):

  1. Filler detection — short user acknowledgements that carry no new topic
     ("sure", "ok", "let's continue", "yeah", "go ahead", …). Filler turns
     never start a new segment; they attach to the surrounding arc.

  2. Topic drift — lexical overlap between consecutive user turns falls below
     a threshold (Jaccard on token sets, stopword-filtered). A drift on a
     non-filler user turn opens a new segment.

  3. Arc closure — an assistant turn that exhibits resolution markers
     ("in summary", "to recap", "is there anything", "let me know if",
     a closing question, or a sharp length drop after a long answer) closes
     the arc; the next non-filler user turn opens a new one.

  4. Role boundary guard — a segment always starts on a non-filler user
     turn (the initiator). If the transcript starts with an assistant turn
     (rare), it is folded into the first segment as preamble.

The segmenter is intentionally conservative: when in doubt, it extends the
current segment rather than splitting. Over-segmentation is worse than
under-segmentation for harvest candidates (a candidate that spans a real arc
is recoverable; one cut mid-arc is not).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

# ── Configuration ────────────────────────────────────────────────────

# Short user turns that carry no new topic. Matched case-insensitively
# against the stripped, lowercased content. A turn is "filler" if its
# alphanumeric token count is <= MAX_FILLER_TOKENS AND its normalized
# text is in (or starts with) one of these phrases.
FILLER_PHRASES = {
    # acknowledgements
    "ok", "okay", "sure", "yeah", "yes", "yep", "yup", "right", "correct",
    "got it", "gotcha", "understood", "makes sense", "agreed", "sounds good",
    "great", "perfect", "nice", "cool", "good",
    # continuations
    "let's continue", "lets continue", "continue", "go ahead", "proceed",
    "next", "next one", "go on", "keep going", "and then",
    "alright", "alright let's continue", "alright, let's continue",
    "ok let's continue", "ok lets continue",
    "please continue", "continue please",
    # hand-backs
    "anything else", "nothing else", "that's all", "thats all",
}
MAX_FILLER_TOKENS = 6

# Resolution markers — assistant turns that look like arc closure.
RESOLUTION_MARKERS = [
    r"\bis there anything else\b",
    r"\banything else (i can|you need)\b",
    r"\blet me know if\b",
    r"\b(shall|do you want me to) (continue|proceed|move on|go on)\b",
    r"\bto (recap|summarize|sum up)\b",
    r"\bin summary\b",
    r"\bdoes that (answer|address|make sense|help)\b",
    r"\bhope that helps\b",
    r"\bwe could (extend|continue|explore) (this|that|further|more)\b",
    r"\bwould you like me to (continue|proceed|elaborate|expand|go deeper)\b",
    r"\bif you['']?d like\b",
]

# Topic-drift threshold (Jaccard similarity). Below this on a non-filler
# user turn => open a new segment. Measured against the MOST RECENT
# topic signature (not a running union — a union never drifts).
DRIFT_THRESHOLD = 0.08

# Explicit topic-shift markers — a user turn beginning with one of these
# phrases signals a deliberate change of subject even if lexically similar.
TOPIC_SHIFT_RE = re.compile(
    r"^\s*(?:alright|ok|okay|so|now|next|let'?s|let us|moving on|"
    r"switching|unrelated|different question|another thing|one more thing|"
    r"let'?s talk about|can we|how about|what about)\b",
    re.IGNORECASE,
)

# Stopwords for the token-overlap signal.
STOPWORDS = {
    "the","a","an","and","or","but","to","of","in","on","for","with","is",
    "are","was","were","be","been","being","it","this","that","these","those",
    "i","you","we","they","he","she","my","your","our","their","its","his","her",
    "so","if","then","than","as","at","by","from","into","about","what","which",
    "can","could","should","would","will","do","does","did","not","no","yes",
    "have","has","had","just","also","very","more","most","some","any","all",
    "let's","lets","ok","okay","sure","yeah","please","like","get","got","want",
    "make","makes","use","using","used","one","two","new","now","here","there",
}

RESOLUTION_RE = re.compile("|".join(RESOLUTION_MARKERS), re.IGNORECASE)

# ── Helpers ──────────────────────────────────────────────────────────

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_-]*")


def _tokens(text: str) -> set[str]:
    """Lowercase alphanumeric tokens, stopwords removed."""
    if not text:
        return set()
    return {tok for tok in _TOKEN_RE.findall(text.lower()) if tok not in STOPWORDS}


def _normalized(text: str) -> str:
    """Lowercased, punctuation-stripped, whitespace-collapsed."""
    if not text:
        return ""
    t = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", t).strip()


def _is_filler_turn(turn: dict) -> bool:
    """A short user acknowledgement with no new topic."""
    if (turn.get("role") or "").lower() != "user":
        return False
    content = turn.get("content") or ""
    if not content.strip():
        return True  # empty user turn = filler
    norm = _normalized(content)
    # token-count guard
    tokens = _TOKEN_RE.findall(norm)
    if len(tokens) > MAX_FILLER_TOKENS:
        return False
    # phrase match
    for phrase in FILLER_PHRASES:
        if norm == phrase or norm.startswith(phrase):
            return True
    return False


def _is_resolution_turn(turn: dict) -> bool:
    """An assistant turn that exhibits arc-closure markers."""
    if (turn.get("role") or "").lower() != "assistant":
        return False
    content = turn.get("content") or ""
    return bool(RESOLUTION_RE.search(content))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _segment_title(segments_turns: list[dict]) -> str:
    """First non-filler user turn content, truncated."""
    for t in segments_turns:
        if (t.get("role") or "").lower() == "user" and not _is_filler_turn(t):
            c = (t.get("content") or "").strip().replace("\n", " ")
            c = re.sub(r"\s+", " ", c)
            return c[:120] + ("…" if len(c) > 120 else "")
    # fall back to first turn content
    c = (segments_turns[0].get("content") or "").strip().replace("\n", " ")
    c = re.sub(r"\s+", " ", c)
    return c[:120] + ("…" if len(c) > 120 else "")


# ── Core segmenter ───────────────────────────────────────────────────

def segment(transcript: dict) -> list[dict[str, Any]]:
    """
    Segment a parsed transcript into discourse arcs.

    Returns a list of segment descriptors (see module docstring).
    """
    turns = transcript.get("turns") or []
    if not turns:
        return []

    # Pre-compute per-turn signals.
    user_tokens: list[set[str]] = []
    for t in turns:
        user_tokens.append(_tokens(t.get("content") or "") if (t.get("role") or "").lower() == "user" else set())

    is_filler = [_is_filler_turn(t) for t in turns]

    # segments: list of (start_idx, end_idx, boundary_reason) — boundary_reason
    # describes why THIS segment started (None for the very first segment).
    segments: list[tuple[int, int, str | None]] = []
    start = 0
    last_topic_tokens: set[str] = set()
    seen_non_filler_user = False

    # Initialize topic signature from the first non-filler user turn (if any).
    for i, turn in enumerate(turns):
        if (turn.get("role") or "").lower() == "user" and not is_filler[i]:
            last_topic_tokens = user_tokens[i]
            seen_non_filler_user = True
            break

    for i, turn in enumerate(turns):
        if i == 0:
            # First segment always starts at turn 0 (folds any assistant preamble).
            continue

        role = (turn.get("role") or "").lower()
        open_new = False
        boundary_reason: str | None = None

        if role == "user" and not is_filler[i]:
            content = turn.get("content") or ""
            topic_shift = bool(TOPIC_SHIFT_RE.match(content))
            # Topic drift? Compare against the most recent topic signature.
            sim = _jaccard(last_topic_tokens, user_tokens[i]) if last_topic_tokens else 1.0
            if seen_non_filler_user and (topic_shift or sim < DRIFT_THRESHOLD):
                open_new = True
                boundary_reason = "topic_shift" if topic_shift else "topic_drift"
            # Refresh topic signature to this turn (not a union — a union
            # accumulates and never drifts). A new arc resets the topic.
            last_topic_tokens = user_tokens[i]
            seen_non_filler_user = True
        elif role == "user" and is_filler[i]:
            # Filler never opens a segment; it attaches to the current arc.
            pass

        # Resolution closure: if the PREVIOUS turn (assistant) closed the arc
        # and this is a non-filler user turn, open a new segment.
        if not open_new and role == "user" and not is_filler[i]:
            prev = turns[i - 1]
            if _is_resolution_turn(prev):
                open_new = True
                boundary_reason = "arc_closed"

        if open_new:
            segments.append((start, i - 1, boundary_reason))
            start = i

    # Flush the final segment (no boundary reason — it's the last one).
    segments.append((start, len(turns) - 1, None))

    # Build descriptors.
    result = []
    for sidx, (s, e, br) in enumerate(segments):
        idxs = list(range(s, e + 1))
        seg_turns = [turns[j] for j in idxs]
        result.append({
            "segment_index": sidx,
            "arc_type": "initiation-response-resolution",
            "start_turn": s,
            "end_turn": e,
            "roles": [t.get("role") for t in seg_turns],
            "boundary_reason": br,  # None for segment 0 and the last segment
            "is_filler_turns": [is_filler[j] for j in idxs],
            "title": _segment_title(seg_turns),
            "turn_count": len(idxs),
        })
    return result


# ── Turns (pooled same-role runs) ────────────────────────────────────

def pool_turns(transcript: dict, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Pool the transcript's raw turns into display turns = maximal runs of
    consecutive same-role raw turns. Each display turn maps to exactly one
    Assembly comment and carries the segment indices it spans.

    (A segment may contain turns from both roles — an arc crosses speakers.
    Turns are a speaker grouping over the raw turn sequence, independent of
    segment boundaries; candidates pick sets of segments regardless of turns.)
    """
    turns = transcript.get("turns") or []
    if not turns:
        return []

    # Build a turn-index → segment-index lookup.
    turn_to_seg: dict[int, int] = {}
    for seg in segments:
        for ti in range(seg["start_turn"], seg["end_turn"] + 1):
            turn_to_seg[ti] = seg["segment_index"]

    pooled: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None

    for i, turn in enumerate(turns):
        role = (turn.get("role") or "").lower() or "unknown"
        seg_idx = turn_to_seg.get(i)
        if cur is None or cur["role"] != role:
            if cur is not None:
                pooled.append(cur)
            cur = {
                "role": role,
                "turn_indices": [i],
                "segment_indices": [seg_idx] if seg_idx is not None else [],
                "content_parts": [turn.get("content", "")],
            }
        else:
            cur["turn_indices"].append(i)
            if seg_idx is not None and (not cur["segment_indices"] or cur["segment_indices"][-1] != seg_idx):
                cur["segment_indices"].append(seg_idx)
            cur["content_parts"].append(turn.get("content", ""))

    if cur is not None:
        pooled.append(cur)

    # Finalize: concatenate content, assign turn index.
    for i, p in enumerate(pooled):
        p["turn_index"] = i
        p["content"] = "\n\n".join(part for part in p.pop("content_parts") if part and part.strip())
    return pooled


# ── CLI (for sample-segment review) ──────────────────────────────────

def _load_transcript(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _pretty(segments: list[dict]) -> str:
    lines = []
    for s in segments:
        lines.append(
            f"  [{s['segment_index']}] turns {s['start_turn']}–{s['end_turn']} "
            f"({s['turn_count']}t, roles={'→'.join(s['roles'])}) "
            f"{'DRIFT' if s['boundary_reason']=='topic_drift' else ('CLOSED' if s['boundary_reason']=='arc_closed' else '—')}"
        )
        lines.append(f"      title: {s['title']}")
        fillers = [s['start_turn'] + j for j, f in enumerate(s['is_filler_turns']) if f]
        if fillers:
            lines.append(f"      filler turns pooled: {fillers}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Rule-based discourse-arc segmenter")
    ap.add_argument("path", help="Path to a parsed-transcript JSON file")
    ap.add_argument("--turns", action="store_true", help="also print pooled turns")
    args = ap.parse_args()

    t = _load_transcript(args.path)
    segs = segment(t)
    print(f"# {t.get('title','?')}  —  {len(t.get('turns') or [])} turns → {len(segs)} segments\n")
    print(_pretty(segs))
    if args.turns:
        pooled = pool_turns(t, segs)
        print(f"\n# Pooled turns: {len(pooled)}")
        for p in pooled:
            print(f"  turn {p['turn_index']} [{p['role']}] segs={p['segment_indices']} turns={p['turn_indices'][0]}..{p['turn_indices'][-1]} ({len(p['content'])} chars)")


if __name__ == "__main__":
    main()
