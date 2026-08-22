#!/usr/bin/env python3
"""
ChatGPT JSON parser — extracts conversations from ChatGPT JSON exports.

Input: ChatGPT JSON file(s) with mapping tree structure
Output: NormalizedTranscript JSON (same shape as deepseek_parser.py)

Usage:
  # Parse a single file:
  python3 chatgpt_json_parser.py /path/to/conversation.json --output json

  # Parse all JSON files in a directory:
  python3 chatgpt_json_parser.py /path/to/exports/json/ --output json

  # Markdown output:
  python3 chatgpt_json_parser.py /path/to/conversation.json --output markdown
"""

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone


# ── Helpers ────────────────────────────────────────────────────────

def _parse_filename(fname):
    """
    Parse ChatGPT export filename to extract date and title.
    Format: 2023-04-21_Index_HTML_with_CSS._5021ca27-fd78.json
           or 2026-07-18_Cascade_Uncertainty_Awareness_6a5b5f41-4cc4.json
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

def _ts_to_iso(ts):
    """Convert Unix timestamp to ISO string."""
    if ts is None:
        return None
    try:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return None


def _extract_text(content):
    """Extract human-readable text from a ChatGPT message content object."""
    if not content:
        return ""

    content_type = content.get("content_type", "")
    parts = content.get("parts", [])

    if content_type == "text":
        return "\n".join(p for p in parts if isinstance(p, str))

    if content_type == "multimodal_text":
        texts = []
        for p in parts:
            if isinstance(p, str):
                texts.append(p)
            elif isinstance(p, dict):
                ct = p.get("content_type", "")
                if ct == "audio_transcription":
                    texts.append(p.get("text", ""))
                elif ct == "image_asset_pointer":
                    texts.append(f"[Image: {p.get('asset_pointer', '?')}]")
                elif ct == "real_time_user_audio_video_asset_pointer":
                    texts.append("[Video]")
        return "\n".join(texts)

    # thoughts, reasoning_recap, code — hidden/internal, skip
    return ""


# ── Main parser ────────────────────────────────────────────────────

def parse_chatgpt_json(file_path):
    """
    Parse a single ChatGPT JSON export into a NormalizedTranscript.

    Returns: dict (the transcript) or None if parsing fails.
    """
    fname = os.path.basename(file_path)
    filename_date, filename_title = _parse_filename(fname)
    
    try:
        with open(file_path, "r", errors="replace") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  ERROR reading {file_path}: {e}", file=sys.stderr)
        return None

    if not isinstance(data, dict) or "mapping" not in data:
        print(f"  WARNING: Not a ChatGPT export: {file_path}", file=sys.stderr)
        return None

    mapping = data["mapping"]
    current_node_id = data.get("current_node")

    if not current_node_id or current_node_id not in mapping:
        print(f"  WARNING: No current_node in {file_path}", file=sys.stderr)
        return None

    # Trace path from current_node to root
    path = []
    node = mapping[current_node_id]
    while node is not None:
        path.append(node)
        parent_id = node.get("parent")
        node = mapping.get(parent_id) if parent_id else None
    path.reverse()

    # Extract conversational turns (skip root, skip intermediate steps)
    turns = []
    for node in path:
        msg = node.get("message")
        if msg is None:
            continue  # root node

        role = msg.get("author", {}).get("role", "")
        channel = msg.get("channel")
        content = msg.get("content", {})
        content_type = content.get("content_type", "")

        # User messages: always include
        if role == "user":
            text = _extract_text(content)
            if text:
                turns.append({
                    "role": "user",
                    "content": text,
                    "timestamp": _ts_to_iso(msg.get("create_time")),
                })
            continue

        # Assistant messages: include text responses on the active path
        # (channel may be "final" or None — older exports lack channel)
        if role == "assistant":
            if content_type == "text":
                text = _extract_text(content)
                if text:
                    model = msg.get("metadata", {}).get("resolved_model_slug", "")
                    turns.append({
                        "role": "assistant",
                        "content": text,
                        "timestamp": _ts_to_iso(msg.get("create_time")),
                        "model": model or None,
                    })
            continue

        # Tool messages: include as user (they're system-generated context)
        if role == "tool":
            text = _extract_text(content)
            if text:
                turns.append({
                    "role": "user",
                    "content": f"[Tool output]\n{text}",
                    "timestamp": _ts_to_iso(msg.get("create_time")),
                })

    if not turns:
        print(f"  WARNING: No turns extracted from {file_path}", file=sys.stderr)
        return None

    # Count orphaned branches
    reachable = set()
    node = mapping[current_node_id]
    while node:
        reachable.add(node["id"])
        parent_id = node.get("parent")
        node = mapping.get(parent_id) if parent_id else None
    orphaned = len(set(mapping.keys()) - reachable - {"client-created-root"})

    # Use filename title (cleaned) over JSON title
    title = filename_title or data.get("title", os.path.splitext(fname)[0])
    
    # Use filename date as fallback for created_at
    created_at = _ts_to_iso(data.get("create_time"))
    if not created_at and filename_date:
        created_at = f"{filename_date}T00:00:00Z"

    return {
        "source_format": "chatgpt",
        "conversation_id": data.get("conversation_id", str(uuid.uuid4())),
        "title": title,
        "created_at": created_at,
        "updated_at": _ts_to_iso(data.get("update_time")),
        "as_of_dt": created_at,
        "valid_from": _ts_to_iso(data.get("update_time")),
        "model": data.get("default_model_slug"),
        "turns": turns,
        "file_metadata": {
            "source_file": fname,
            "file_size": os.path.getsize(file_path),
            "filename_date": filename_date,
            "total_nodes": len(mapping),
            "orphaned_branches": orphaned,
        },
    }


def parse_directory(dir_path, limit=None):
    """Parse all ChatGPT JSON files in a directory."""
    results = []
    count = 0

    for root, _dirs, files in os.walk(dir_path):
        for fname in sorted(files):
            if limit and count >= limit:
                return results
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(root, fname)
            transcript = parse_chatgpt_json(fpath)
            if transcript:
                results.append(transcript)
                count += 1

    return results


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ChatGPT JSON parser")
    parser.add_argument("path", help="JSON file or directory")
    parser.add_argument("--output", choices=["json", "markdown"], default="json", help="Output format")
    parser.add_argument("--limit", type=int, help="Max files to parse")
    args = parser.parse_args()

    if os.path.isfile(args.path):
        transcript = parse_chatgpt_json(args.path)
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
            print("---")
            print(f"title: \"{t['title']}\"")
            print(f"id: {t['conversation_id']}")
            print(f"source: chatgpt")
            print(f"created_at: {t['created_at']}")
            print(f"model: {t['model']}")
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
