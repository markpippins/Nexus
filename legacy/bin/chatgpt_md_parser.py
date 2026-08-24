#!/usr/bin/env python3
"""
ChatGPT Markdown parser — extracts conversations from ChatGPT markdown exports.

Input: ChatGPT markdown file(s) with YAML frontmatter + ## User / ## Assistant sections
Output: NormalizedTranscript JSON (same shape as deepseek_parser.py)

Usage:
  # Parse a single file:
  python3 chatgpt_md_parser.py /path/to/conversation.md --output json

  # Parse all markdown files in a directory:
  python3 chatgpt_md_parser.py /path/to/exports/markdown/ --output json

  # Markdown passthrough:
  python3 chatgpt_md_parser.py /path/to/conversation.md --output markdown
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone


# ── Helpers ────────────────────────────────────────────────────────

def _parse_filename(fname):
    """
    Parse ChatGPT export filename to extract date and title.
    Format: 2023-04-21_Index_HTML_with_CSS._5021ca27-fd78.md
           or 2026-07-18_Cascade_Uncertainty_Awareness_6a5b5f41-4cc4.md
    Returns: (date_str, clean_title) or (None, original_basename)
    """
    basename = os.path.splitext(fname)[0]
    
    # Match date prefix: YYYY-MM-DD_
    match = re.match(r'^(\d{4}-\d{2}-\d{2})_(.+)$', basename)
    if match:
        date_str = match.group(1)
        title_part = match.group(2)
        # Remove trailing UUID-like suffix (with or without dot prefix)
        title_part = re.sub(r'\.?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', '', title_part)
        # Also try shorter hash suffix (8 chars + dash + 4 chars)
        title_part = re.sub(r'_?[a-f0-9]{8}-[a-f0-9]{4}$', '', title_part)
        # Replace underscores with spaces, strip trailing whitespace
        clean_title = title_part.replace('_', ' ').strip()
        return date_str, clean_title
    
    return None, basename

def _parse_yaml_frontmatter(content):
    """Extract YAML frontmatter from markdown content."""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return {}, content

    yaml_text = match.group(1)
    rest = content[match.end():]

    # Simple YAML parser (no dependency needed)
    meta = {}
    for line in yaml_text.split('\n'):
        line = line.strip()
        if ':' in line:
            key, _, value = line.partition(':')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            meta[key] = value

    return meta, rest


def _parse_turns(markdown_body):
    """Parse ## User / ## Assistant sections into turns."""
    # Split on ## User or ## Assistant headers
    # Pattern: ## followed by role name, then content until next ## or end
    parts = re.split(r'^## (User|Assistant)\s*$', markdown_body, flags=re.MULTILINE)

    turns = []
    i = 1  # Skip empty string before first header
    while i < len(parts) - 1:
        role_text = parts[i].strip()
        content = parts[i + 1].strip()

        if content:
            role = "user" if role_text == "User" else "assistant"
            turns.append({
                "role": role,
                "content": content,
            })

        i += 2

    return turns


# ── Main parser ────────────────────────────────────────────────────

def parse_chatgpt_markdown(file_path):
    """
    Parse a single ChatGPT markdown file into a NormalizedTranscript.

    Returns: dict (the transcript) or None if parsing fails.
    """
    fname = os.path.basename(file_path)
    filename_date, filename_title = _parse_filename(fname)
    
    try:
        with open(file_path, "r", errors="replace") as f:
            content = f.read()
    except Exception as e:
        print(f"  ERROR reading {file_path}: {e}", file=sys.stderr)
        return None

    meta, body = _parse_yaml_frontmatter(content)
    if not meta.get("id"):
        print(f"  WARNING: No YAML frontmatter in {file_path}", file=sys.stderr)
        return None

    turns = _parse_turns(body)
    if not turns:
        print(f"  WARNING: No turns in {file_path}", file=sys.stderr)
        return None

    # Parse timestamps
    def _parse_ts(ts_str):
        if not ts_str:
            return None
        try:
            # Handle ISO format with Z suffix
            ts_str = re.sub(r'Z$', '+00:00', ts_str)
            dt = datetime.fromisoformat(ts_str)
            return dt.isoformat()
        except Exception:
            return None

    # Use filename title (cleaned) over YAML title
    title = filename_title or meta.get("title", os.path.splitext(fname)[0])
    
    # Use filename date as fallback for created_at
    created_at = _parse_ts(meta.get("create_time"))
    if not created_at and filename_date:
        created_at = f"{filename_date}T00:00:00Z"

    return {
        "source_format": "chatgpt",
        "conversation_id": meta.get("id", ""),
        "title": title,
        "created_at": created_at,
        "updated_at": _parse_ts(meta.get("update_time")),
        "as_of_dt": created_at,
        "valid_from": _parse_ts(meta.get("update_time")),
        "model": None,
        "turns": turns,
        "file_metadata": {
            "source_file": fname,
            "file_size": os.path.getsize(file_path),
            "filename_date": filename_date,
        },
    }


def parse_directory(dir_path, limit=None):
    """Parse all ChatGPT markdown files in a directory."""
    results = []
    count = 0

    for fname in sorted(os.listdir(dir_path)):
        if limit and count >= limit:
            return results
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(dir_path, fname)
        transcript = parse_chatgpt_markdown(fpath)
        if transcript:
            results.append(transcript)
            count += 1

    return results


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ChatGPT Markdown parser")
    parser.add_argument("path", help="Markdown file or directory")
    parser.add_argument("--output", choices=["json", "markdown"], default="json", help="Output format")
    parser.add_argument("--limit", type=int, help="Max files to parse")
    args = parser.parse_args()

    if os.path.isfile(args.path):
        transcript = parse_chatgpt_markdown(args.path)
        if not transcript:
            sys.exit(1)
        transcripts = [transcript]
    elif os.path.isdir(args.path):
        transcripts = parse_directory(args.path, args.limit)
    else:
        print(f"ERROR: {args.path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Parsed {len(transcripts)} conversations from {args.path}", file=sys.stderr)

    if args.output == "json":
        print(json.dumps(transcripts, indent=2))
    else:
        for t in transcripts:
            # Markdown passthrough (already markdown format)
            print("---")
            print(f"title: \"{t['title']}\"")
            print(f"id: {t['conversation_id']}")
            print(f"source: chatgpt")
            print(f"created_at: {t['created_at']}")
            print("---")
            print()
            print(f"# {t['title']}")
            print()
            for turn in t["turns"]:
                role_label = "User" if turn["role"] == "user" else "Assistant"
                print(f"## {role_label}")
                print()
                print(turn["content"])
                print()
            print()


if __name__ == "__main__":
    main()
