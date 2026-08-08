#!/usr/bin/env python3
"""
claim_triage.py — Docklang pre-processor for the Auditor.

Reads a docklang JSON file, pattern-scans discourse_units for claim
indicators, and outputs the flagged subset as a compact JSON snippet
suitable for LLM extraction.

Usage:
    python3 claim_triage.py <docklang.json>        # full report
    python3 claim_triage.py <docklang.json> --json  # flagged units as JSON
    python3 claim_triage.py <docklang.json> --text  # flagged units as plain text

The output JSON is small enough to pass directly to an LLM as part of
the extraction prompt, replacing the raw 500KB HTML file.
"""

import json
import re
import sys
from pathlib import Path

# ── Claim indicator patterns ──────────────────────────────────────────
# Each pattern is a (regex, weight) pair. A turn that matches multiple
# patterns accumulates weight. Turns above the threshold are flagged.
#
# Patterns target: design decisions, tradeoffs, file/api changes,
# bugs, blockers, and explicit agreements/conclusions.

PATTERNS = [
    # Design decisions
    (re.compile(r'\b(?:decision|decided|chose|chosen|choose)\b.*\b(?:over|instead|rather|because|since)\b', re.I), 3),
    (re.compile(r'\b(?:architecture|architectural|design)\s+(?:decision|choice|direction)\b', re.I), 3),
    (re.compile(r'\b(?:agreed|concluded|settled\s+on|landed\s+on)\b', re.I), 2),

    # Tradeoffs
    (re.compile(r'\b(?:tradeoff|trade-off|trade\s+off)\b', re.I), 3),
    (re.compile(r'\b(?:pros?\s*(?:and|&)\s*cons?|cost\s*(?:vs|versus)\s*benefit)\b', re.I), 2),
    (re.compile(r'\b(?:worth\s+it|not\s+worth|too\s+(?:expensive|costly|heavy|slow|complex))\b', re.I), 2),

    # File / API changes
    (re.compile(r'\b(?:changed|modified|updated|added|removed|deleted|renamed|moved)\s+(?:the\s+)?(?:file|module|function|class|endpoint|route|API|schema|type|interface)\b', re.I), 2),
    (re.compile(r'\b(?:refactored|rewrote|extracted|inlined|split|merged)\b', re.I), 2),

    # Bugs and fixes
    (re.compile(r'\b(?:bug|broke|broken|crash|hang|deadlock|race\s*condition|memory\s*leak)\b', re.I), 3),
    (re.compile(r'\b(?:fixed|resolved|patched|worked\s*around)\b', re.I), 2),

    # Blockers
    (re.compile(r'\b(?:blocker|blocking|blocked|can\u2019t\s+(?:proceed|continue|move\s+forward)|stuck|waiting\s+on)\b', re.I), 3),
    (re.compile(r'\b(?:missing|absent|not\s+(?:yet\s+)?(?:built|ready|available|implemented))\b', re.I), 2),

    # Explicit architectural assertions
    (re.compile(r'\b(?:should|must|need\s+to|have\s+to)\b.*\bbecause\b', re.I), 1),
    (re.compile(r'\b(?:principle|invariant|guarantee|contract)\b', re.I), 2),
    (re.compile(r'\b(?:the\s+(?:right|wrong|correct|incorrect)\s+(?:way|approach|pattern|design))\b', re.I), 2),
]

# Threshold: a turn needs this much cumulative weight to be flagged
FLAG_THRESHOLD = 2


def load_docklang(path: str) -> dict:
    """Load and validate a docklang JSON file."""
    with open(path, encoding='utf-8') as f:
        d = json.load(f)

    if 'discourse_units' not in d:
        raise ValueError(f"Not a valid docklang file: missing 'discourse_units' key in {path}")

    return d


def score_turn(body: str) -> tuple[int, list[str]]:
    """Score a turn's body text against claim indicator patterns.

    Returns (total_weight, [matched_patterns]).
    """
    total = 0
    matched = []
    for pattern, weight in PATTERNS:
        if pattern.search(body):
            total += weight
            matched.append(pattern.pattern[:60])
    return total, matched


def triage(docklang: dict, threshold: int = FLAG_THRESHOLD) -> list[dict]:
    """Scan all discourse_units and return flagged units with metadata."""
    flagged = []
    stats = {'total_units': 0, 'total_chars': 0,
             'flagged_units': 0, 'flagged_chars': 0,
             'by_role': {}}

    for unit in docklang['discourse_units']:
        body = unit.get('body', '')
        provenance = unit.get('provenance', {})
        role = provenance.get('role', 'unknown')
        turn = provenance.get('turn_index', -1)

        stats['total_units'] += 1
        stats['total_chars'] += len(body)
        stats['by_role'][role] = stats['by_role'].get(role, 0) + 1

        score, matched = score_turn(body)

        if score >= threshold:
            stats['flagged_units'] += 1
            stats['flagged_chars'] += len(body)
            flagged.append({
                'heading': unit.get('heading', f'Turn {turn}'),
                'provenance': provenance,
                'score': score,
                'indicators': matched,
                'body': body,
            })

    return flagged, stats


def flagged_to_text(flagged: list[dict]) -> str:
    """Convert flagged units to a plain-text block for LLM consumption."""
    parts = []
    for i, unit in enumerate(flagged):
        p = unit['provenance']
        parts.append(
            f"--- Turn {p.get('turn_index', '?')} "
            f"({p.get('role', '?')}) "
            f"[score={unit['score']}] ---\n"
            f"{unit['body']}\n"
        )
    return "\n".join(parts)


def flagged_to_json(flagged: list[dict], stats: dict) -> str:
    """Convert flagged units to a compact JSON snippet."""
    # Strip body text from output JSON to keep the snippet small;
    # the LLM gets body via --text mode (or reads the file directly).
    compact = []
    for unit in flagged:
        compact.append({
            'turn': unit['provenance'].get('turn_index'),
            'role': unit['provenance'].get('role'),
            'score': unit['score'],
            'indicators': unit['indicators'][:3],  # top 3 indicators
        })
    return json.dumps({
        'meta': {
            'total_units': stats['total_units'],
            'flagged_units': stats['flagged_units'],
            'reduction': f"{stats['flagged_chars']}/{stats['total_chars']} chars "
                         f"({100*stats['flagged_chars']//max(1,stats['total_chars'])}%)",
        },
        'flagged': compact,
    }, indent=2)


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <docklang.json> [--json|--text]", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    mode = 'report'
    if len(sys.argv) > 2:
        mode = sys.argv[2].lstrip('-')

    docklang = load_docklang(path)
    flagged, stats = triage(docklang)

    if mode == 'json':
        print(flagged_to_json(flagged, stats))
    elif mode == 'text':
        print(flagged_to_text(flagged))
    else:
        # Report mode
        title = docklang.get('meta', {}).get('title', Path(path).stem)
        print(f"Transcript: {title}")
        print(f"Total units: {stats['total_units']} ({stats['total_chars']:,} chars)")
        print(f"By role: {stats['by_role']}")
        print(f"Flagged: {stats['flagged_units']} units "
              f"({stats['flagged_chars']:,} chars, "
              f"{100*stats['flagged_chars']//max(1,stats['total_chars'])}% of total)")
        print(f"Threshold: {FLAG_THRESHOLD}")
        print()
        if flagged:
            print("Flagged turns:")
            for unit in flagged:
                p = unit['provenance']
                body_preview = unit['body'][:100].replace('\n', ' ')
                print(f"  Turn {p.get('turn_index','?'):>3} "
                      f"({p.get('role','?'):10s}) "
                      f"score={unit['score']:<2} "
                      f"[{', '.join(unit['indicators'][:2])}]")
                print(f"       \"{body_preview}...\"")
        else:
            print("No turns flagged — no claim indicators found.")


if __name__ == '__main__':
    main()
