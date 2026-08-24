#!/usr/bin/env python3
"""
Transcript clean-slate rebuild script (plan 386d13a3, step 5).

Wipes the PG derived tables and flat forum threads so the new segment-based
ingest can re-absorb the corpus from scratch via the timer.

WHAT IT DELETES (with --apply):
  PG:   nebula.candidate_segment_sets
        nebula.requirement_segment_sets
        nebula.segment_set_members
        nebula.segment_sets
        nebula.segments_history
        nebula.conversation_blocks
        nebula.conversation_snapshots
        nebula.open_question_answers
        nebula.open_questions
        nebula.requirements
        nebula.harvest_candidates
        nebula.harvests
  Forum: all threads in the 'transcripts' forum

WHAT IT KEEPS:
  Raw source files (chats/ HTML, chat-export, deepseek-export)
  MongoDB docklang (secondary store, untouched)

SAFETY:
  Dry-run by default. Pass --apply to actually delete.
  Prints counts before and after.

Usage:
  python3 transcript_rebuild.py --dry-run        # preview counts
  python3 transcript_rebuild.py --apply           # wipe + show clean state
  python3 transcript_rebuild.py --apply --test-ingest /path/to/test.html
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request

NEBULA_API = os.environ.get("NEBULA_API", "http://localhost:3101")
ASSEMBLY_API = os.environ.get("ASSEMBLY_API", "http://localhost:3107")
FORUM_SLUG = "transcripts"

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]


def psql(sql: str, timeout: int = 120) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A", "-v", "ON_ERROR_STOP=1"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def _get_json(url: str, timeout: int = 15) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def _delete_url(url: str, timeout: int = 15) -> bool:
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status < 300
    except Exception:
        return False


# ── PG table counts ──────────────────────────────────────────────────

PG_TABLES = [
    "nebula.candidate_segment_sets",
    "nebula.requirement_segment_sets",
    "nebula.segment_set_members",
    "nebula.segment_sets",
    "nebula.segments_history",
    "nebula.conversation_blocks",
    "nebula.conversation_snapshots",
    "nebula.open_question_answers",
    "nebula.open_questions",
    "nebula.requirements",
    "nebula.harvest_candidates",
    "nebula.harvests",
]


def pg_counts() -> dict[str, int]:
    """Current row counts for all derived tables."""
    counts = {}
    for t in PG_TABLES:
        rc, out = psql(f"SELECT count(*) FROM {t};")
        counts[t] = int(out.strip()) if rc == 0 and out.strip().isdigit() else -1
    return counts


# ── Forum thread counts ──────────────────────────────────────────────


def forum_thread_ids() -> list[str]:
    """Get all thread IDs in the transcripts forum."""
    try:
        data = _get_json(f"{ASSEMBLY_API}/api/forums/{FORUM_SLUG}/threads")
        threads = data if isinstance(data, list) else data.get("threads", [])
        return [t["id"] for t in threads if t.get("id")]
    except Exception as e:
        print(f"  WARN: could not list forum threads: {e}", file=sys.stderr)
        return []


# ── Wipe ─────────────────────────────────────────────────────────────


def wipe_pg() -> int:
    """Delete all rows from derived tables (FK-ordered). Returns 0 on success."""
    # Order: children first, parents last
    sql = "BEGIN;\n"
    for t in PG_TABLES:
        sql += f"DELETE FROM {t};\n"
    sql += "COMMIT;"
    rc, out = psql(sql, timeout=300)
    if rc != 0:
        print(f"  PG wipe FAILED (rolled back): {out[:500]}", file=sys.stderr)
        return 1
    return 0


def wipe_forum() -> int:
    """Delete all threads in the transcripts forum."""
    ids = forum_thread_ids()
    if not ids:
        print("  Forum: no threads to delete.")
        return 0
    print(f"  Forum: deleting {len(ids)} threads...")
    deleted = 0
    for i, tid in enumerate(ids):
        if _delete_url(f"{ASSEMBLY_API}/api/forums/threads/{tid}"):
            deleted += 1
        if (i + 1) % 50 == 0:
            print(f"    {i+1}/{len(ids)}...")
    print(f"  Forum: deleted {deleted}/{len(ids)} threads.")
    return 0


# ── Main ─────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="Transcript clean-slate rebuild")
    ap.add_argument("--apply", action="store_true", help="Actually delete (default: dry-run)")
    ap.add_argument("--test-ingest", metavar="PATH", help="After wipe, ingest one test file")
    args = ap.parse_args()

    print("=" * 60)
    print("Transcript Clean-Slate Rebuild")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN (no changes)'}")
    print("=" * 60)

    # Show current state
    print("\n── Current PG counts ──")
    counts = pg_counts()
    total = 0
    for t, c in counts.items():
        print(f"  {t:45s} {c:>8}")
        if c > 0:
            total += c
    print(f"  {'TOTAL':45s} {total:>8}")

    print("\n── Forum threads ──")
    tids = forum_thread_ids()
    print(f"  transcripts forum: {len(tids)} threads")

    if not args.apply:
        print("\n" + "=" * 60)
        print("DRY-RUN — no changes made. Pass --apply to wipe.")
        print("=" * 60)
        return 0

    # Wipe
    print("\n── Wiping PG derived tables ──")
    if wipe_pg() != 0:
        return 1
    print("  PG wipe complete.")

    print("\n── Wiping forum threads ──")
    wipe_forum()

    # Verify clean
    print("\n── Post-wipe PG counts ──")
    counts = pg_counts()
    for t, c in counts.items():
        print(f"  {t:45s} {c:>8}")

    # Optional test ingest
    if args.test_ingest:
        print(f"\n── Test ingest: {args.test_ingest} ──")
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from transcript_ingest import ingest_transcript
        from format_detector import detect
        from ingest import parse_file as _parse

        fmt, _ = detect(args.test_ingest, threshold=0.5)
        if fmt == "unknown":
            print(f"  ERROR: could not detect format for {args.test_ingest}")
            return 1
        parsed = _parse(args.test_ingest, fmt)
        if not parsed:
            print(f"  ERROR: no transcripts parsed from {args.test_ingest}")
            return 1
        r = ingest_transcript(args.test_ingest, fmt, parsed[0])
        print(f"  Result: {r}")

    print("\n" + "=" * 60)
    print("Clean-slate rebuild complete.")
    if not args.test_ingest:
        print("Next: ingest a small test set, then let the timer re-absorb.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
