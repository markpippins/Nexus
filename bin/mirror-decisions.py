#!/usr/bin/env python3
"""
mirror-decisions.py — deterministic mirror of `recordType: decision` agent
records into the Assembly `decisions` forum (admin-facing projection, T27).

The `decisions` forum is an operator read view — a clean, chronological list of
what was arbitrated — NOT an agent-routing channel (no `to:*` semantics, no
inbox consumption). Each mirrored thread carries:

    source_url = "nebula://agent-record/<record-id>"

so re-runs are idempotent: any decision record whose id already appears as a
`source_url` on a decisions-forum thread is skipped. No duplicates are ever
created.

Attribution: the thread's `role` comes from the agent record. The `model` is
left null because agent records do not persist a model id (no such column).

Usage:
    python3 bin/mirror-decisions.py               # mirror all unmirrored decisions
    python3 bin/mirror-decisions.py --dry-run     # report only, no posts
    python3 bin/mirror-decisions.py --limit N     # mirror only the N oldest unmirrored

Env:
    NEXUS_DB_DSN   (default postgresql://pguser:pgpass@localhost:5432/nexus)
    ASSEMBLY_URL   (default http://localhost:3107)
"""

import argparse
import json
import os
import sys
import urllib.request

DB_DSN = os.environ.get(
    "NEXUS_DB_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"
)
ASSEMBLY_URL = os.environ.get("ASSEMBLY_URL", "http://localhost:3107").rstrip("/")

# Assembly forum UUID for slug "decisions" (stable; see /api/forums).
DECISIONS_FORUM_ID = "703bc0f9-faf4-4c94-a52d-8f0d4024a89b"


def _http_json(url: str, method: str = "GET", payload: dict | None = None) -> object:
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"assembly {method} {url} -> HTTP {e.code}: {body[:300]}") from e


def load_decisions(conn) -> list[dict]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, role, title, content, created_at
        FROM nebula.agent_records
        WHERE record_type = 'decision'
        ORDER BY created_at ASC
        """
    )
    return [
        {
            "id": str(row[0]),
            "role": (row[1] or "").strip().lower(),
            "title": row[2] or "",
            "content": row[3] or "",
            "created_at": row[4],
        }
        for row in cur.fetchall()
    ]


def load_mirrored_ids() -> set[str]:
    """Ids of decision records already mirrored (via source_url on existing threads)."""
    threads = _http_json(f"{ASSEMBLY_URL}/api/forums/by-id/{DECISIONS_FORUM_ID}/threads")
    ids: set[str] = set()
    prefix = "nebula://agent-record/"
    for t in threads:
        su = t.get("source_url") or ""
        if su.startswith(prefix):
            ids.add(su[len(prefix):])
    return ids


def load_user_map() -> dict[str, str]:
    users = _http_json(f"{ASSEMBLY_URL}/api/users")
    return {u["name"].lower(): u["id"] for u in users if u.get("name")}


def mirror_one(record: dict, user_id: str) -> str:
    payload = {
        "title": record["title"],
        "body": record["content"],
        "postedById": user_id,
        "source_url": f"nebula://agent-record/{record['id']}",
        "role": record["role"],
        "model": None,
    }
    result = _http_json(
        f"{ASSEMBLY_URL}/api/forums/by-id/{DECISIONS_FORUM_ID}/threads",
        method="POST",
        payload=payload,
    )
    return result["id"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Mirror decision records into the decisions forum")
    ap.add_argument("--dry-run", action="store_true", help="report only, no posts")
    ap.add_argument("--limit", type=int, default=0, help="mirror only the N oldest unmirrored (0 = all)")
    args = ap.parse_args()

    import psycopg2

    conn = psycopg2.connect(DB_DSN)
    try:
        decisions = load_decisions(conn)
    finally:
        conn.close()

    mirrored = load_mirrored_ids()
    users = load_user_map()

    pending = [d for d in decisions if d["id"] not in mirrored]
    if args.limit > 0:
        pending = pending[: args.limit]

    print(f"decision records: {len(decisions)} | already mirrored: {len(mirrored)} | pending: {len(pending)}")

    skipped_role = 0
    posted = 0
    for d in pending:
        uid = users.get(d["role"])
        if not uid:
            print(f"  SKIP (no assembly user for role '{d['role']}'): {d['id']} {d['title'][:60]}")
            skipped_role += 1
            continue
        if args.dry_run:
            print(f"  [dry-run] would mirror {d['id']} ({d['role']}): {d['title'][:60]}")
            continue
        try:
            thread_id = mirror_one(d, uid)
            posted += 1
            print(f"  mirrored {d['id']} ({d['role']}) -> thread {thread_id}: {d['title'][:60]}")
        except Exception as e:
            print(f"  ERROR mirroring {d['id']}: {e}", file=sys.stderr)
            return 1

    print(f"done: posted={posted} skipped_role={skipped_role} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
