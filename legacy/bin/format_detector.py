#!/usr/bin/env python3
"""
Format detector — signature scan the first 10KB of a file to determine
the transcript format and hand off to the appropriate parser.

Supported formats:
  - deepseek_json    DeepSeek JSON export (conversations.json)
  - deepseek_html    DeepSeek browser HTML (ds-message elements)
  - gemini3_html     Gemini 3 Angular HTML (conversation-container + model-response)
  - chatgpt_json     ChatGPT JSON export (mapping + create_time)
  - chatgpt_markdown ChatGPT markdown export (YAML frontmatter + ## User)
  - chatgpt_html     ChatGPT browser HTML (Save Page As — quarantined)
  - claude_html      Claude.ai browser HTML (transcript-row + user-message)
  - unknown          No match

Usage:
  python3 format_detector.py /path/to/file
  python3 format_detector.py /path/to/directory   # scan all files
"""

import argparse
import json
import os
import sys


# ── Signature definitions ──────────────────────────────────────────

def _check_deepseek_json(path):
    """DeepSeek JSON export: array of {id, title, mapping} with fragments."""
    if not path.endswith(".json"):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(8192)
        # Quick signature: has 'inserted_at' and 'mapping' (DeepSeek-specific)
        if '"inserted_at"' in head and '"mapping"' in head:
            # Confirm with parse
            with open(path, "r", errors="replace") as f2:
                data = json.load(f2)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                if "mapping" in data[0] and "inserted_at" in data[0]:
                    return 0.95
            elif isinstance(data, dict) and "mapping" in data:
                return 0.95
        return 0
    except Exception:
        return 0


def _check_chatgpt_json(path):
    """ChatGPT JSON export: mapping tree with create_time."""
    if not path.endswith(".json"):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(8192)
        if '"mapping"' in head and '"create_time"' in head:
            return 0.95
        return 0
    except Exception:
        return 0


def _check_gemini3_html(path):
    """Gemini 3 HTML: Angular conversation-container + model-response."""
    if not (path.endswith(".html") or path.endswith(".htm")):
        return 0
    try:
        # Gemini HTML is large (2-4MB) — conversation content starts ~20% in
        with open(path, "r", errors="replace") as f:
            head = f.read(1000000)  # 1MB scan window
        score = 0
        if "conversation-container" in head:
            score += 0.5
        if "model-response" in head:
            score += 0.4
        if "user-query" in head or "user-input" in head:
            score += 0.1
        return min(score, 1.0)
    except Exception:
        return 0


def _check_deepseek_html(path):
    """DeepSeek HTML: ds-message + ds-assistant-message-main-content."""
    if not (path.endswith(".html") or path.endswith(".htm")):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(200000)
        score = 0
        if "ds-message" in head:
            score += 0.5
        if "ds-assistant-message" in head:
            score += 0.4
        if "ds-search-result" in head:
            score += 0.1
        return min(score, 1.0)
    except Exception:
        return 0


def _check_chatgpt_html(path):
    """ChatGPT browser HTML: Save Page As — typically has ChatGPT-specific classes."""
    if not (path.endswith(".html") or path.endswith(".htm")):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(200000)
        score = 0
        lower = head.lower()
        if "chatgpt" in lower:
            score += 0.4
        if "markdown" in lower or "prose" in lower:
            score += 0.3
        if "thread" in lower or "conversation" in lower:
            score += 0.2
        if "user" in lower and "assistant" in lower:
            score += 0.1
        return min(score, 1.0)
    except Exception:
        return 0


def _check_claude_html(path):
    """Claude HTML: browser-saved from claude.ai with transcript-row + user-message."""
    if not (path.endswith(".html") or path.endswith(".htm")):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(1000000)  # 1MB — Claude HTML is large
        score = 0
        if "claude.ai/chat/" in head:
            score += 0.4
        if 'data-testid="transcript-row"' in head:
            score += 0.3
        if 'data-testid="user-message"' in head:
            score += 0.2
        if "font-claude-response" in head or "standard-markdown" in head:
            score += 0.1
        return min(score, 1.0)
    except Exception:
        return 0


# ── Registry ───────────────────────────────────────────────────────

def _check_chatgpt_markdown(path):
    """ChatGPT markdown export: YAML frontmatter + ## User / ## Assistant."""
    if not (path.endswith(".md") or path.endswith(".markdown")):
        return 0
    try:
        with open(path, "r", errors="replace") as f:
            head = f.read(2048)
        score = 0
        if head.startswith("---"):
            score += 0.3
        if "## User" in head or "## Assistant" in head:
            score += 0.5
        if "create_time:" in head or "update_time:" in head:
            score += 0.2
        return min(score, 1.0)
    except Exception:
        return 0


FORMAT_CHECKS = [
    ("deepseek_json",     _check_deepseek_json),
    ("chatgpt_json",      _check_chatgpt_json),
    ("chatgpt_markdown",  _check_chatgpt_markdown),
    ("gemini3_html",      _check_gemini3_html),
    ("deepseek_html",     _check_deepseek_html),
    ("claude_html",       _check_claude_html),
    ("chatgpt_html",      _check_chatgpt_html),
]


def detect(path, threshold=0.5):
    """
    Detect the format of a single file.

    Returns: (format_name, confidence)
    """
    best_format = "unknown"
    best_score = 0

    for fmt, check_fn in FORMAT_CHECKS:
        score = check_fn(path)
        if score > best_score:
            best_score = score
            best_format = fmt

    if best_score < threshold:
        return "unknown", best_score

    return best_format, best_score


def detect_directory(dir_path, threshold=0.5, limit=None):
    """
    Scan a directory and detect formats for each file.

    Returns: list of {path, format, confidence}
    """
    results = []
    count = 0

    for root, _dirs, files in os.walk(dir_path):
        for fname in sorted(files):
            if limit and count >= limit:
                return results
            fpath = os.path.join(root, fname)
            fmt, conf = detect(fpath, threshold)
            results.append({
                "path": fpath,
                "format": fmt,
                "confidence": round(conf, 2),
            })
            count += 1

    return results


def main():
    parser = argparse.ArgumentParser(description="Transcript format detector")
    parser.add_argument("path", help="File or directory to scan")
    parser.add_argument("--threshold", type=float, default=0.5, help="Minimum confidence (default 0.5)")
    parser.add_argument("--limit", type=int, help="Max files to scan")
    parser.add_argument("--summary", action="store_true", help="Show format distribution summary")
    args = parser.parse_args()

    if os.path.isfile(args.path):
        fmt, conf = detect(args.path, args.threshold)
        print(json.dumps({"path": args.path, "format": fmt, "confidence": round(conf, 2)}, indent=2))
    elif os.path.isdir(args.path):
        results = detect_directory(args.path, args.threshold, args.limit)
        if args.summary:
            summary = {}
            for r in results:
                fmt = r["format"]
                summary[fmt] = summary.get(fmt, 0) + 1
            print(f"Scanned {len(results)} files:")
            for fmt, count in sorted(summary.items()):
                print(f"  {fmt}: {count}")
        else:
            print(json.dumps(results, indent=2))
    else:
        print(f"ERROR: {args.path} not found", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
