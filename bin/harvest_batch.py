#!/usr/bin/env python3
"""
Batch harvest orchestrator — detect format, parse, store in MongoDB.

Usage:
  # Harvest all files in a directory:
  python3 harvest_batch.py /path/to/exports/

  # Harvest with limit:
  python3 harvest_batch.py /path/to/exports/ --limit 50

  # Dry run (detect only):
  python3 harvest_batch.py /path/to/exports/ --dry-run

  # Also post to Transcripts forum:
  python3 harvest_batch.py /path/to/exports/ --post-forum --limit 10

  # Just get stats:
  python3 harvest_batch.py --stats
"""

import argparse
import json
import os
import sys
import time
import urllib.request

# Add the same directory to path for sibling imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from format_detector import detect
from deepseek_parser import parse_export as parse_deepseek
from gemini_parser import parse_gemini_html as parse_gemini
from chatgpt_json_parser import parse_chatgpt_json as parse_chatgpt_json
from chatgpt_md_parser import parse_chatgpt_markdown as parse_chatgpt_md


# ── Parser registry ────────────────────────────────────────────────

PARSERS = {
    "deepseek_json":     lambda p: [parse_deepseek(p)] if os.path.isfile(p) else _parse_deepseek_dir(p),
    "gemini3_html":      lambda p: [parse_gemini(p)] if os.path.isfile(p) else _parse_gemini_dir(p),
    "chatgpt_json":      lambda p: [parse_chatgpt_json(p)] if os.path.isfile(p) else _parse_chatgpt_json_dir(p),
    "chatgpt_markdown":  lambda p: [parse_chatgpt_md(p)] if os.path.isfile(p) else _parse_chatgpt_md_dir(p),
    "chatgpt_html":      lambda p: [],  # Low priority — skip for now
    "deepseek_html":     lambda p: [],  # TODO: build parser
}


def _parse_deepseek_dir(path):
    """Parse all DeepSeek JSON files in a directory."""
    results = []
    for root, _dirs, files in os.walk(path):
        for fname in sorted(files):
            if fname == "conversations.json" or fname.endswith(".json"):
                fpath = os.path.join(root, fname)
                try:
                    t = parse_deepseek(fpath)
                    if t:
                        if isinstance(t, list):
                            results.extend(t)
                        else:
                            results.append(t)
                except Exception as e:
                    print(f"  ERROR: {fpath}: {e}", file=sys.stderr)
    return results


def _parse_gemini_dir(path):
    """Parse all Gemini HTML files in a directory."""
    from gemini_parser import parse_directory
    return parse_directory(path)


def _parse_chatgpt_json_dir(path):
    """Parse all ChatGPT JSON files in a directory."""
    from chatgpt_json_parser import parse_directory
    return parse_directory(path)


def _parse_chatgpt_md_dir(path):
    """Parse all ChatGPT markdown files in a directory."""
    from chatgpt_md_parser import parse_directory
    return parse_directory(path)


# ── MongoDB store ──────────────────────────────────────────────────

def _store_in_mongodb(transcripts):
    """Store transcripts in MongoDB docklang collection."""
    try:
        from docklang_store import get_client, get_collection, store_many, ensure_indexes
        client = get_client()
        collection = get_collection(client)
        ensure_indexes(collection)
        result = store_many(collection, transcripts)
        return result
    except Exception as e:
        print(f"  MongoDB error: {e}", file=sys.stderr)
        return None


# ── Forum post ─────────────────────────────────────────────────────

def _post_to_forum(transcript, forum_slug="transcripts"):
    """Post a transcript to the Assembly Transcripts forum."""
    # Map source format to user
    user_map = {
        "deepseek": "301188fc-8f68-4c4d-8064-31b0cefbeff9",
        "gemini":   "c7fb03d1-d5e9-4fa3-aaa0-d659decf6953",
        "chatgpt":  "c7d28da1-80a2-4079-b478-33cac2747d0c",
    }

    fmt = transcript.get("source_format", "unknown")
    user_id = user_map.get(fmt)
    if not user_id:
        return None

    # Build the body from the first turn
    turns = transcript.get("turns", [])
    if not turns:
        return None

    body = f"**Source:** {fmt}\n**Model:** {transcript.get('model', 'unknown')}\n\n"
    body += f"# {transcript.get('title', 'Untitled')}\n\n"

    for turn in turns[:10]:  # Limit to first 10 turns for forum
        role_label = "User" if turn["role"] == "user" else "Assistant"
        body += f"## {role_label}\n\n{turn['content']}\n\n"

    if len(turns) > 10:
        body += f"*... {len(turns) - 10} more turns truncated*\n"

    # Post via REST
    data = json.dumps({
        "title": transcript.get("title", "Untitled")[:200],
        "body": body[:10000],  # Forum body limit
        "postedById": user_id,
        "role": fmt,
        "model": transcript.get("model", "unknown"),
    }).encode()

    req = urllib.request.Request(
        f"http://localhost:3107/api/forums/{forum_slug}/threads",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result.get("id")
    except Exception as e:
        print(f"  Forum post error: {e}", file=sys.stderr)
        return None


# ── Main orchestrator ──────────────────────────────────────────────

def harvest(path, limit=None, dry_run=False, post_forum=False):
    """
    Harvest transcripts from a path.

    1. Detect format for each file
    2. Parse using format-specific parser
    3. Store in MongoDB
    4. Optionally post to forum
    """
    results = {
        "detected": {},
        "parsed": 0,
        "stored": 0,
        "forum_posted": 0,
        "errors": 0,
    }

    # Collect files
    files = []
    if os.path.isfile(path):
        files = [path]
    elif os.path.isdir(path):
        for root, _dirs, fnames in os.walk(path):
            for fname in sorted(fnames):
                fpath = os.path.join(root, fname)
                files.append(fpath)
    else:
        print(f"ERROR: {path} not found", file=sys.stderr)
        return results

    if limit:
        files = files[:limit]

    # Detect formats
    print(f"Scanning {len(files)} files...", file=sys.stderr)
    transcripts = []

    for fpath in files:
        fmt, conf = detect(fpath, threshold=0.5)
        results["detected"][fmt] = results["detected"].get(fmt, 0) + 1

        if fmt == "unknown":
            continue

        if dry_run:
            continue

        # Parse
        parser_fn = PARSERS.get(fmt)
        if not parser_fn:
            continue

        try:
            parsed = parser_fn(fpath)
            if parsed:
                if isinstance(parsed, list):
                    transcripts.extend(parsed)
                else:
                    transcripts.append(parsed)
                results["parsed"] += 1
        except Exception as e:
            print(f"  PARSE ERROR [{fmt}] {fpath}: {e}", file=sys.stderr)
            results["errors"] += 1

    if dry_run:
        print(f"\nDry run results:", file=sys.stderr)
        for fmt, count in sorted(results["detected"].items()):
            print(f"  {fmt}: {count} files", file=sys.stderr)
        return results

    # Store in MongoDB
    if transcripts:
        print(f"\nStoring {len(transcripts)} transcripts in MongoDB...", file=sys.stderr)
        store_result = _store_in_mongodb(transcripts)
        if store_result:
            results["stored"] = store_result.get("inserted", 0) + store_result.get("updated", 0)
            print(f"  Stored: {store_result}", file=sys.stderr)

    # Post to forum
    if post_forum and transcripts:
        print(f"\nPosting to Transcripts forum...", file=sys.stderr)
        for t in transcripts[:5]:  # Limit forum posts
            thread_id = _post_to_forum(t)
            if thread_id:
                results["forum_posted"] += 1
                print(f"  Posted: {t.get('title', 'Untitled')[:50]}", file=sys.stderr)
            time.sleep(0.5)  # Rate limit

    return results


def main():
    parser = argparse.ArgumentParser(description="Batch harvest orchestrator")
    parser.add_argument("path", nargs="?", help="Path to scan")
    parser.add_argument("--limit", type=int, help="Max files to process")
    parser.add_argument("--dry-run", action="store_true", help="Detect only, don't parse/store")
    parser.add_argument("--post-forum", action="store_true", help="Post to Transcripts forum")
    parser.add_argument("--stats", action="store_true", help="Show MongoDB collection stats")
    args = parser.parse_args()

    if args.stats:
        from docklang_store import get_client, get_collection, get_stats
        client = get_client()
        collection = get_collection(client)
        stats = get_stats(collection)
        print(json.dumps(stats, indent=2))
        return

    if not args.path:
        parser.print_help()
        sys.exit(1)

    results = harvest(args.path, args.limit, args.dry_run, args.post_forum)
    print(f"\n=== Harvest Summary ===", file=sys.stderr)
    print(f"Detected: {results['detected']}", file=sys.stderr)
    print(f"Parsed: {results['parsed']}", file=sys.stderr)
    print(f"Stored: {results['stored']}", file=sys.stderr)
    print(f"Forum posted: {results['forum_posted']}", file=sys.stderr)
    print(f"Errors: {results['errors']}", file=sys.stderr)


if __name__ == "__main__":
    main()
