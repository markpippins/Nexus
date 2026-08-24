#!/usr/bin/env python3
"""Backfill thread status ratings (assembly.posts.rating) from reply content.

Reads every thread in the target forums, scans replies chronologically, and
derives the thread's colored-status value using keyword heuristics. Later
matching replies override earlier states (e.g. Accepted then "still broken"
-> Reopened). Threads with no signal keep rating NULL (= Posted/default).

Status vocabulary (canonical, mirrors assembly-srv routes/forums.js and
assembly-ui src/types/index.ts):
    0 posted  1 specified(blue)   2 planned(yellow)     3 implemented(orange)
    4 accepted(green)  5 rejected(red)  6 reopened(purple)  7 closed(grey)

Usage:
    backfill_thread_status.py --dry-run   # report only, no writes
    backfill_thread_status.py --apply     # write classified ratings

Connection: ASSEMBLY_PG_DSN env var or the assembly-srv default DSN.
"""
import argparse
import os
import re
import sys
from collections import Counter

import psycopg2
import psycopg2.extras

DEFAULT_DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"

TARGET_FORUMS = [
    "to-do",
    "discussions",
    "engineering",
    "issues-and-open-questions",
    "planning",
]

# Priority order: per comment, first matching category wins. Terminal /
# negative states outrank progress states so "rejected, closing" is not
# misread as implemented.
RULES = [
    (5, "rejected", r"\b(won'?t fix|wontfix|rejected|declined|duplicate of|obsolete|not needed|closing as|invalid)\b"),
    (6, "reopened", r"\b(re-?opened|regression|still broken|still failing|resurfaced|recurring|came back)\b"),
    (7, "closed", r"\b(closed|archived|no action needed|withdrawn|moot)\b"),
    (4, "accepted", r"\b(completed:?|done|fixed|resolved|shipped|merged|verified working|accepted|approved|ratified|landed)\b|✅"),
    (3, "implemented", r"\b(implemented|deployed|built|pushed|committed|in place)\b"),
    (2, "planned", r"\b(planned|scheduled|queued|on the list|will implement|in progress|started working|assigned|picked up|taking this|next up)\b"),
    (1, "specified", r"\b(specifica?tion|spec'?d|acceptance criteria|requirements (are|defined)|scoped)\b"),
]
COMPILED = [(rating, name, re.compile(pattern, re.IGNORECASE)) for rating, name, pattern in RULES]


def classify_comment(text: str):
    """Return the status rating implied by a single reply, or None."""
    for rating, _name, pattern in COMPILED:
        if pattern.search(text):
            return rating
    return None


def classify_thread(replies):
    """Chronological scan; later matching replies override earlier states."""
    current = None
    for text in replies:
        hit = classify_comment(text)
        if hit is not None:
            current = hit
    return current


def fetch(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT p.id, f.slug,
                   array_agg(c.text ORDER BY c.created) FILTER (WHERE c.id IS NOT NULL) AS replies
            FROM assembly.posts p
            JOIN assembly.forums f ON f.id = p.forum_uuid
            LEFT JOIN assembly.comments c ON c.post_id = p.id
                AND (c.expiration_dt = 'infinity'::timestamptz OR c.expiration_dt > now())
            WHERE f.slug = ANY(%s)
              AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
            GROUP BY p.id, f.slug
            """,
            (TARGET_FORUMS,),
        )
        return cur.fetchall()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    conn = psycopg2.connect(os.environ.get("ASSEMBLY_PG_DSN", DEFAULT_DSN))
    try:
        rows = fetch(conn)
        updates = []
        by_forum_status = {}
        for post_id, slug, replies in rows:
            rating = classify_thread([r for r in (replies or []) if r])
            if rating is None:
                continue  # no signal -> stays NULL = Posted
            updates.append((post_id, rating))
            by_forum_status.setdefault(slug, Counter())[rating] += 1

        names = {v: k for k, v in [("posted", 0), ("specified", 1), ("planned", 2),
                                   ("implemented", 3), ("accepted", 4), ("rejected", 5),
                                   ("reopened", 6), ("closed", 7)]}
        print(f"threads scanned: {len(rows)} | classified != Posted: {len(updates)}")
        for slug in TARGET_FORUMS:
            counter = by_forum_status.get(slug)
            if not counter:
                print(f"  {slug}: no classified threads")
                continue
            dist = ", ".join(f"{names[s]}={n}" for s, n in sorted(counter.items()))
            print(f"  {slug}: {dist} (of which changed: {sum(counter.values())})")

        if args.apply and updates:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    UPDATE assembly.posts AS p SET rating = v.rating, updated = now()
                    FROM (VALUES %s) AS v(id, rating)
                    WHERE p.id = v.id AND p.rating IS DISTINCT FROM v.rating
                    """,
                    updates,
                    template="(%s::uuid, %s::bigint)",
                    # single statement so cur.rowcount reflects every row
                    page_size=max(len(updates), 1),
                )
                print(f"applied: {cur.rowcount} rows updated")
            conn.commit()
        elif args.dry_run:
            print("dry run — nothing written")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
