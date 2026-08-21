#!/usr/bin/env python3
"""
Unified ingest: parse → MongoDB docklang → Transcripts forum.

Single operation that takes a file or directory and:
  1. Detects format
  2. Parses into normalized transcript
  3. Stores in MongoDB docklang collection
  4. Posts to Assembly Transcripts forum

Usage:
  # Ingest a single file:
  python3 ingest.py /path/to/conversation.json

  # Ingest a directory (all detectable files):
  python3 ingest.py /path/to/exports/ --limit 10

  # Dry run (detect + parse only):
  python3 ingest.py /path/to/exports/ --dry-run

  # Skip forum posting:
  python3 ingest.py /path/to/exports/ --no-forum
"""

import argparse
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from format_detector import detect
from deepseek_parser import parse_export as parse_deepseek_dir
from gemini_parser import parse_gemini_html, parse_directory as parse_gemini_dir
from chatgpt_json_parser import parse_chatgpt_json
from chatgpt_md_parser import parse_chatgpt_markdown
from claude_parser import parse_claude_html
from docklang_store import get_client, get_collection, store_many, ensure_indexes


# ── User IDs for forum posting ─────────────────────────────────────

FORUM_USERS = {
    "deepseek":   "301188fc-8f68-4c4d-8064-31b0cefbeff9",
    "gemini":     "c7fb03d1-d5e9-4fa3-aaa0-d659decf6953",
    "chatgpt":    "c7d28da1-80a2-4079-b478-33cac2747d0c",
    "claude_html": "6a818082-07a4-4d20-baf1-c6151289d2d0",
}


# ── Parse ──────────────────────────────────────────────────────────

def parse_file(fpath, fmt):
    """Parse a single file given its detected format."""
    if fmt == "deepseek_json":
        # parse_export expects a directory; for single file, wrap it
        parent = os.path.dirname(fpath)
        transcripts = parse_deepseek_dir(parent)
        # Filter to just this file
        basename = os.path.basename(fpath)
        return [t for t in transcripts if t.get("file_metadata", {}).get("source_file") == basename]
    
    elif fmt == "gemini3_html":
        t = parse_gemini_html(fpath)
        return [t] if t else []
    
    elif fmt == "chatgpt_json":
        t = parse_chatgpt_json(fpath)
        return [t] if t else []
    
    elif fmt == "chatgpt_markdown":
        t = parse_chatgpt_markdown(fpath)
        return [t] if t else []
    
    elif fmt == "claude_html":
        t = parse_claude_html(fpath)
        return [t] if t else []
    
    return []


def parse_path(path, limit=None):
    """Detect format and parse all files in path, largest first."""
    # Collect files
    files = []
    if os.path.isfile(path):
        files = [path]
    elif os.path.isdir(path):
        for root, _dirs, fnames in os.walk(path):
            for fname in sorted(fnames):
                fpath = os.path.join(root, fname)
                files.append((fpath, os.path.getsize(fpath)))
    else:
        print(f"ERROR: {path} not found", file=sys.stderr)
        return []

    # Sort by size, largest first
    if os.path.isdir(path):
        files.sort(key=lambda x: x[1], reverse=True)
        files = [f[0] for f in files]

    if limit:
        files = files[:limit]

    transcripts = []
    for fpath in files:
        fmt, conf = detect(fpath, threshold=0.5)
        if fmt == "unknown":
            continue
        
        parsed = parse_file(fpath, fmt)
        transcripts.extend(parsed)

    return transcripts


# ── Store ──────────────────────────────────────────────────────────

def store(transcripts):
    """Store transcripts in MongoDB docklang collection."""
    client = get_client()
    collection = get_collection(client)
    ensure_indexes(collection)
    return store_many(collection, transcripts)


# ── Forum post ─────────────────────────────────────────────────────

def post_to_forum(transcript):
    """
    Post a transcript to Assembly Transcripts forum.
    Chunks large transcripts into multiple posts if needed (forum body limit ~900KB).
    """
    fmt = transcript.get("source_format", "unknown")
    user_id = FORUM_USERS.get(fmt)
    if not user_id:
        return None

    turns = transcript.get("turns", [])
    if not turns:
        return None

    title = transcript.get("title", "Untitled")
    model = transcript.get("model", "unknown")
    
    # Build full body to check size
    full_body = f"**Source:** {fmt}\n**Model:** {model}\n\n"
    full_body += f"# {title}\n\n"
    for turn in turns:
        role_label = "User" if turn["role"] == "user" else "Assistant"
        full_body += f"## {role_label}\n\n{turn['content']}\n\n"

    # If small enough, post as single thread
    if len(full_body) <= 900000:
        return _post_thread(title, full_body, user_id, fmt, model)

    # Large transcript — chunk into multiple posts
    # First post is the thread with first ~100 turns
    chunk_size = 100
    first_chunk_turns = turns[:chunk_size]
    first_body = f"**Source:** {fmt}\n**Model:** {model}\n**Total turns:** {len(turns)} (chunked)\n\n"
    first_body += f"# {title}\n\n"
    for turn in first_chunk_turns:
        role_label = "User" if turn["role"] == "user" else "Assistant"
        first_body += f"## {role_label}\n\n{turn['content']}\n\n"
    first_body += f"\n*... {len(turns) - chunk_size} more turns in follow-up posts*\n"

    thread_id = _post_thread(title, first_body, user_id, fmt, model)
    if not thread_id:
        return None

    # Post remaining chunks as replies
    for i in range(chunk_size, len(turns), chunk_size):
        chunk = turns[i:i + chunk_size]
        chunk_body = f"*Turns {i+1}-{min(i+chunk_size, len(turns))} of {len(turns)}*\n\n"
        for turn in chunk:
            role_label = "User" if turn["role"] == "user" else "Assistant"
            chunk_body += f"## {role_label}\n\n{turn['content']}\n\n"
        
        _post_reply(thread_id, chunk_body, user_id, fmt, model)
        time.sleep(0.3)

    return thread_id


def _post_thread(title, body, user_id, fmt, model):
    """Post a new thread to the forum."""
    data = json.dumps({
        "title": title[:200],
        "body": body,
        "postedById": user_id,
        "role": fmt,
        "model": model,
    }).encode()

    req = urllib.request.Request(
        "http://localhost:3107/api/forums/transcripts/threads",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return result.get("id")
    except Exception as e:
        print(f"  Forum error: {e}", file=sys.stderr)
        return None


def _post_reply(thread_id, body, user_id, fmt, model):
    """Post a reply to an existing thread."""
    data = json.dumps({
        "body": body,
        "postedById": user_id,
        "role": fmt,
        "model": model,
    }).encode()

    req = urllib.request.Request(
        f"http://localhost:3107/api/forums/threads/{thread_id}/comments",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Forum reply error: {e}", file=sys.stderr)
        return None


# ── Main ───────────────────────────────────────────────────────────

def ingest(path, limit=None, dry_run=False, no_forum=False):
    """
    Unified ingest: parse → store → post.
    Returns summary dict.
    """
    results = {
        "parsed": 0,
        "inserted": 0,
        "updated": 0,
        "unchanged": 0,
        "forum_posted": 0,
        "errors": 0,
    }

    # Parse
    transcripts = parse_path(path, limit)
    results["parsed"] = len(transcripts)

    if dry_run or not transcripts:
        return results

    # Store
    store_result = store(transcripts)
    results["inserted"] = store_result.get("inserted", 0)
    results["updated"] = store_result.get("updated", 0)
    results["unchanged"] = store_result.get("unchanged", 0)

    # Forum — only post new/updated, not unchanged
    if not no_forum:
        for t in transcripts:
            # Check if this transcript was actually stored (new or updated)
            # Skip forum post for unchanged
            # (We don't have per-transcript status here, so post all — forum dedup is by title)
            thread_id = post_to_forum(t)
            if thread_id:
                results["forum_posted"] += 1
            time.sleep(0.3)

    return results


def main():
    parser = argparse.ArgumentParser(description="Unified ingest: parse → MongoDB → forum")
    parser.add_argument("path", help="File or directory to ingest")
    parser.add_argument("--limit", type=int, help="Max files to process")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, don't store/post")
    parser.add_argument("--no-forum", action="store_true", help="Skip forum posting")
    args = parser.parse_args()

    results = ingest(args.path, args.limit, args.dry_run, args.no_forum)

    print(f"\n=== Ingest Summary ===", file=sys.stderr)
    print(f"Parsed: {results['parsed']}", file=sys.stderr)
    print(f"Inserted: {results['inserted']}", file=sys.stderr)
    print(f"Updated: {results['updated']}", file=sys.stderr)
    print(f"Unchanged: {results['unchanged']}", file=sys.stderr)
    print(f"Forum posted: {results['forum_posted']}", file=sys.stderr)
    print(f"Errors: {results['errors']}", file=sys.stderr)


if __name__ == "__main__":
    main()
