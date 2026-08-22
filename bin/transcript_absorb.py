#!/usr/bin/env python3
"""
Transcript batch absorber — the timer-driven re-absorb for the clean-slate rebuild.

Walks source directories (chats/, chat-export/pages/, deepseek-export/),
detects format, parses, and feeds each transcript through the atomic
transcript_ingest.py pipeline (segment → docklang → snapshot → blocks →
segment-set → forum).

Idempotent: transcript_ingest.py checks content hashes and skips unchanged.
Incremental: --limit caps files per run so the timer doesn't hog resources.

Usage:
  python3 transcript_absorb.py --apply --limit 20     # process up to 20 files
  python3 transcript_absorb.py --apply                 # process all remaining
  python3 transcript_absorb.py --dry-run               # preview only
  python3 transcript_absorb.py --apply --no-forum      # skip forum posting
  python3 transcript_absorb.py --apply --no-substance  # skip segment-set creation
  python3 transcript_absorb.py --stats                 # show corpus stats only

Env:
  ABSORB_LIMIT   — default file limit (overridden by --limit)
  NEBULA_API     — default http://localhost:3101
  ASSEMBLY_API   — default http://localhost:3107
  SUBSTANCE_API  — default http://localhost:3115
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

# Ensure bin/ and legacy/bin are on the path for sibling imports
BIN_DIR = os.path.dirname(os.path.abspath(__file__))
_LEGACY_BIN = os.path.join(os.path.dirname(BIN_DIR), "legacy", "bin")
sys.path.insert(0, BIN_DIR)
sys.path.insert(0, _LEGACY_BIN)
sys.path.insert(0, os.path.join(BIN_DIR, "python"))

from format_detector import detect
from transcript_ingest import ingest_transcript, parse_file

# ── Source directories ──────────────────────────────────────────────

WORKSPACE = os.environ.get("WORKSPACE", os.path.join(BIN_DIR, "..", ".."))
SOURCE_DIRS = [
    os.path.join(WORKSPACE, "chats"),
    os.path.join(WORKSPACE, "chat-export", "exports", "markdown"),
    os.path.join(WORKSPACE, "deepseek-export"),
    # chat-export/pages/ has chatgpt_html (quarantined, no parser) — skipped
    # chat-export/exports/markdown/ has chatgpt_markdown (supported)
]

# Skip non-transcript files
SKIP_EXTENSIONS = {".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg",
                    ".woff", ".woff2", ".ttf", ".eot", ".map", ".lock"}
# Only accept files with known transcript extensions
ALLOWED_EXTENSIONS = {".html", ".htm", ".md", ".json", ".txt", ".xml"}
MIN_FILE_SIZE = 1000  # skip tiny files

# ── Manifest (local skip cache) ────────────────────────────────────

MANIFEST_PATH = os.path.join(BIN_DIR, "..", "logs", "transcript-absorb-manifest.json")


def _load_manifest() -> dict:
    """Load the local manifest: {filepath: content_hash}."""
    try:
        with open(MANIFEST_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_manifest(manifest: dict) -> None:
    """Persist the manifest."""
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)


# ── File collection ─────────────────────────────────────────────────

def collect_files(source_dirs: list[str] | None = None) -> list[str]:
    """Walk source directories and return candidate file paths, largest first."""
    dirs = source_dirs or SOURCE_DIRS
    files = []
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for root, _dirs, fnames in os.walk(d):
            for fname in fnames:
                ext = os.path.splitext(fname)[1].lower()
                if ext in SKIP_EXTENSIONS or ext not in ALLOWED_EXTENSIONS:
                    continue
                fpath = os.path.join(root, fname)
                try:
                    size = os.path.getsize(fpath)
                except OSError:
                    continue
                if size < MIN_FILE_SIZE:
                    continue
                files.append((fpath, size))
    # Largest first — big transcripts are the most valuable
    files.sort(key=lambda x: x[1], reverse=True)
    return [f[0] for f in files]


def get_ingested_filenames() -> set[str]:
    """Query nebula API for already-ingested source filenames."""
    try:
        url = os.environ.get("NEBULA_API", "http://localhost:3101") + "/api/harvests"
        data = json.loads(urllib.request.urlopen(url, timeout=15).read())
        harvests = data.get("harvests", data) if isinstance(data, dict) else data
        if not isinstance(harvests, list):
            return set()
        return {(h.get("source_filename") or h.get("sourceFilename") or "")
                for h in harvests
                if h.get("source_filename") or h.get("sourceFilename")}
    except Exception:
        return set()


# ── Stats ───────────────────────────────────────────────────────────

def show_stats() -> None:
    """Print corpus statistics."""
    files = collect_files()
    ingested = get_ingested_filenames()
    manifest = _load_manifest()

    print(f"Source files found:   {len(files)}")
    print(f"Already in PG:        {len(ingested)}")
    print(f"Manifest entries:     {len(manifest)}")

    # Count by format
    format_counts: dict[str, int] = {}
    for fpath in files:
        try:
            fmt, _ = detect(fpath, threshold=0.5)
            format_counts[fmt] = format_counts.get(fmt, 0) + 1
        except Exception:
            format_counts["error"] = format_counts.get("error", 0) + 1

    print("\nBy format:")
    for fmt, count in sorted(format_counts.items(), key=lambda x: -x[1]):
        print(f"  {fmt:25s} {count:>6}")

    # Estimate remaining
    remaining = len(files) - len(ingested)
    print(f"\nRemaining to absorb:  {remaining}")
    print(f"At 20/run:            ~{(remaining + 19) // 20} timer ticks")


# ── Main absorb loop ────────────────────────────────────────────────

def absorb(
    limit: int = 0,
    dry_run: bool = False,
    no_forum: bool = False,
    no_substance: bool = False,
) -> dict:
    """
    Walk source files and ingest through the atomic pipeline.

    Returns summary dict.
    """
    files = collect_files()
    ingested = get_ingested_filenames()
    manifest = _load_manifest()

    # Filter out already-ingested files (by filename match)
    remaining = []
    for fpath in files:
        fname = os.path.basename(fpath)
        if fname in ingested:
            continue
        remaining.append(fpath)

    if limit > 0:
        remaining = remaining[:limit]

    if not remaining:
        print("Nothing to absorb — all files already in PG.")
        return {"total": 0, "processed": 0, "ingested": 0,
                "unchanged": 0, "errors": 0, "skipped": 0}

    print(f"Files to process: {len(remaining)} (of {len(files)} total)")
    if dry_run:
        print("Mode: DRY-RUN\n")

    results = {
        "total": len(remaining),
        "processed": 0,
        "ingested": 0,
        "unchanged": 0,
        "errors": 0,
        "skipped": 0,
    }

    for i, fpath in enumerate(remaining):
        fname = os.path.basename(fpath)
        try:
            fmt, conf = detect(fpath, threshold=0.5)
        except Exception as e:
            print(f"  [{i+1}/{len(remaining)}] [SKIP] {fname}: detect error: {e}")
            results["skipped"] += 1
            continue

        if fmt == "unknown":
            results["skipped"] += 1
            continue

        try:
            parsed = parse_file(fpath, fmt)
        except Exception as e:
            print(f"  [{i+1}/{len(remaining)}] [ERR]  {fname}: parse error: {e}")
            results["errors"] += 1
            continue

        if not parsed:
            results["skipped"] += 1
            continue

        # Each file may produce multiple transcripts (e.g. DeepSeek)
        for t in parsed:
            try:
                r = ingest_transcript(
                    fpath, fmt, t,
                    dry_run=dry_run,
                    no_forum=no_forum,
                    no_substance=no_substance,
                )
                action = r["action"]
                title = r.get("title", "?")[:50]

                if action == "dry_run":
                    print(f"  [{i+1}/{len(remaining)}] [dry]  {title}: "
                          f"{r['turn_count']}t → {r['segment_count']} segs")
                elif action == "error":
                    print(f"  [{i+1}/{len(remaining)}] [ERR]  {title}: {r.get('error','?')}")
                    results["errors"] += 1
                elif action == "unchanged":
                    results["unchanged"] += 1
                    # Update manifest with known hash
                    ch = r.get("content_hash", "")
                    if ch:
                        manifest[fpath] = ch
                else:
                    print(f"  [{i+1}/{len(remaining)}] [{action:7s}] {title}: "
                          f"{r['turn_count']}t → {r['segment_count']} segs"
                          + (f" | thread={r.get('thread_id','')[:8]}" if r.get("thread_id") else ""))
                    results["ingested"] += 1
                    ch = r.get("content_hash", "")
                    if ch:
                        manifest[fpath] = ch

                results["processed"] += 1

            except Exception as e:
                print(f"  [{i+1}/{len(remaining)}] [ERR]  {fname}: ingest error: {e}")
                results["errors"] += 1

        # Save manifest periodically (every 10 files)
        if (i + 1) % 10 == 0:
            _save_manifest(manifest)

    # Final manifest save
    _save_manifest(manifest)

    print(f"\n{'DRY-RUN ' if dry_run else ''}Summary:")
    print(f"  Processed:  {results['processed']}")
    print(f"  Ingested:   {results['ingested']}")
    print(f"  Unchanged:  {results['unchanged']}")
    print(f"  Errors:     {results['errors']}")
    print(f"  Skipped:    {results['skipped']}")
    return results


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Transcript batch absorber (timer-driven re-absorb)")
    ap.add_argument("--apply", action="store_true",
                    help="Actually ingest (default: dry-run)")
    ap.add_argument("--limit", type=int,
                    default=int(os.environ.get("ABSORB_LIMIT", "0")),
                    help="Max files to process (0=all remaining)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse + segment only, no writes")
    ap.add_argument("--no-forum", action="store_true",
                    help="Skip forum posting")
    ap.add_argument("--no-substance", action="store_true",
                    help="Skip segment-set creation")
    ap.add_argument("--stats", action="store_true",
                    help="Show corpus statistics only")
    ap.add_argument("--source-dirs", nargs="+",
                    help="Override source directories")
    args = ap.parse_args()

    if args.stats:
        show_stats()
        return 0

    if args.source_dirs:
        global SOURCE_DIRS
        SOURCE_DIRS = args.source_dirs

    dry_run = not args.apply
    if dry_run:
        print("NOTE: Running in DRY-RUN mode. Pass --apply to actually ingest.\n")

    results = absorb(
        limit=args.limit,
        dry_run=dry_run,
        no_forum=args.no_forum,
        no_substance=args.no_substance,
    )

    return 1 if results["errors"] > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
