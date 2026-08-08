"""
Voyager → Semantics Adapter (3A — Deterministic Ingestion)

Reads voyager.file_observation rows and writes them as canonical_asset +
asset_revision + source_observation in the semantics schema.

Run:  python3 voyager_semantics_adapter.py [--dry-run] [--limit N]

Idempotent: re-running skips already-ingested observations (by revision_id
uniqueness). New observations since last run are picked up automatically.
"""

import os
import re
import sys
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

# ── Config ──────────────────────────────────────────────────────────
DB_DSN = "host=localhost port=5432 dbname=nexus user=pguser password=pgpass"
DRY_RUN = "--dry-run" in sys.argv
LIMIT = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--limit=")), None)

# Where to track last ingestion cursor (simple file-based pointer)
CURSOR_FILE = Path(__file__).parent / ".voyager_adapter_cursor"


def slugify(path: str, root: str = "/home/codex/dev") -> str:
    """Derive a short kebab-case slug from a path, relative to root."""
    # Strip the scan root prefix to get a relative path
    rel = path
    if root and path.startswith(root):
        rel = path[len(root):].lstrip("/")
    if not rel:
        rel = path.lstrip("/")
    s = rel.lower()
    s = re.sub(r"[^\w\s./-]", "", s)
    s = re.sub(r"[/\s]+", "-", s)
    # If still too long, use last 2 path segments
    if len(s) > 120:
        parts = rel.split("/")
        s = "-".join(parts[-3:]).lower()
        s = re.sub(r"[^\w\s./-]", "", s)
        s = re.sub(r"[/\s]+", "-", s)
    return s[:120]


def connect():
    return psycopg2.connect(DB_DSN)


def read_cursor() -> datetime | None:
    if CURSOR_FILE.exists():
        try:
            ts = CURSOR_FILE.read_text().strip()
            return datetime.fromisoformat(ts)
        except Exception:
            pass
    return None


def write_cursor(ts: datetime):
    CURSOR_FILE.write_text(ts.isoformat())


def fetch_observations(cur, since: datetime | None, limit: int | None) -> list:
    """Fetch file_observation rows newer than since, ordered by created_at."""
    if since:
        cur.execute(
            "SELECT observation_id, epoch_id, path, size, mtime, inode, device_id, content_hash "
            "FROM voyager.file_observation WHERE created_at > %s ORDER BY created_at ASC",
            (since,),
        )
    else:
        # First run — ingest everything
        cur.execute(
            "SELECT observation_id, epoch_id, path, size, mtime, inode, device_id, content_hash "
            "FROM voyager.file_observation ORDER BY created_at ASC",
        )
    rows = cur.fetchall()
    if limit:
        rows = rows[:limit]
    return rows


# ── Ingestion logic ─────────────────────────────────────────────────

def upsert_canonical_asset(cur, canonical_asset_id: str, asset_kind: str,
                           canonical_key: dict, source_hash: str,
                           content_hash: str) -> str:
    """Insert or update canonical_asset. Returns the id."""
    cur.execute(
        """INSERT INTO semantics.canonical_asset
             (canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL
           DO UPDATE SET
             canonical_key = EXCLUDED.canonical_key,
             source_hash = EXCLUDED.source_hash,
             content_hash = EXCLUDED.content_hash,
             validity_start = now()
           RETURNING id""",
        (canonical_asset_id, asset_kind, psycopg2.extras.Json(canonical_key),
         source_hash, content_hash),
    )
    return cur.fetchone()[0]


def upsert_asset_revision(cur, revision_id: str, asset_id: str,
                          content_hash: str, source_hash: str,
                          created_by: str, recording_start) -> str:
    """Insert or skip asset_revision. Returns the id."""
    cur.execute(
        """INSERT INTO semantics.asset_revision
             (revision_id, asset_id, content_hash, source_hash,
              created_by, recording_start)
           VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (revision_id) WHERE expired_at IS NULL
           DO NOTHING
           RETURNING id""",
        (revision_id, asset_id, content_hash, source_hash,
         created_by, recording_start),
    )
    row = cur.fetchone()
    if row:
        return row[0]
    # Already exists — fetch its id
    cur.execute(
        "SELECT id FROM semantics.asset_revision WHERE revision_id = %s AND expired_at IS NULL",
        (revision_id,),
    )
    return cur.fetchone()[0]


def insert_source_observation(cur, revision_id: str, platform: str,
                              platform_identifier: str | None,
                              namespace: str, raw_location: str,
                              observed_at, raw_hash: str,
                              ingestion_run_id: str) -> str:
    """Insert source_observation. Returns the id."""
    # Check for duplicates on (revision_id, raw_location)
    cur.execute(
        "SELECT id FROM semantics.source_observation "
        "WHERE revision_id = %s AND raw_location = %s AND expired_at IS NULL",
        (revision_id, raw_location),
    )
    existing = cur.fetchone()
    if existing:
        return existing[0]

    cur.execute(
        """INSERT INTO semantics.source_observation
             (revision_id, platform, platform_identifier, namespace,
              raw_location, observed_at, ingestion_run_id, raw_hash)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (revision_id, platform, platform_identifier, namespace,
         raw_location, observed_at, ingestion_run_id, raw_hash),
    )
    return cur.fetchone()[0]


# ── Main ────────────────────────────────────────────────────────────

def main():
    conn = connect()
    cur = conn.cursor()

    since = read_cursor()
    print(f"Ingestion cursor: {since.isoformat() if since else 'none (full ingestion)'}")

    rows = fetch_observations(cur, since, LIMIT)
    print(f"Observations to ingest: {len(rows)}")

    if DRY_RUN:
        for obs_id, epoch_id, path, size, mtime, inode, device_id, chash in rows[:10]:
            slug = slugify(path)
            asset_id = f"asset:filesystem:nexus:{slug}"
            rev_id = f"{asset_id}@{chash[:12] if chash else 'nohash'}"
            print(f"  {path[-60:]}")
            print(f"    → canonical_asset: {asset_id}")
            print(f"    → asset_revision:  {rev_id}")
            print(f"    → source_obs:      file://{path}")
        if len(rows) > 10:
            print(f"  ... and {len(rows) - 10} more")
        conn.rollback()
        cur.close()
        conn.close()
        return

    stats = {"assets": 0, "revisions": 0, "observations": 0, "skipped": 0, "errors": 0}
    max_created_at = since

    for i, (obs_id, epoch_id, path, size, mtime, inode, device_id, chash) in enumerate(rows):
        try:
            slug = slugify(path)
            canonical_asset_id = f"asset:filesystem:nexus:{slug}"
            content_hash = chash or ""
            revision_id_text = f"{canonical_asset_id}@{content_hash[:12] if content_hash else '000000000000'}"

            canonical_key = {
                "path": path,
                "inode": int(inode),
                "device_id": int(device_id),
                "size": int(size),
            }

            # 1. Upsert canonical_asset
            asset_uuid = upsert_canonical_asset(
                cur, canonical_asset_id, "file", canonical_key,
                source_hash=content_hash, content_hash=content_hash,
            )
            stats["assets"] += 1

            # 2. Upsert asset_revision
            revision_uuid = upsert_asset_revision(
                cur, revision_id_text, asset_uuid,
                content_hash=content_hash, source_hash=content_hash,
                created_by="voyager-adapter", recording_start=mtime,
            )
            stats["revisions"] += 1

            # 3. Insert source_observation
            insert_source_observation(
                cur, revision_uuid,
                platform="filesystem",
                platform_identifier=None,
                namespace="nexus",
                raw_location=f"file://{path}",
                observed_at=mtime,
                raw_hash=content_hash,
                ingestion_run_id=str(epoch_id),
            )
            stats["observations"] += 1

            # Track latest created_at for cursor
            if mtime:
                if max_created_at is None or mtime > max_created_at:
                    max_created_at = mtime

            if (i + 1) % 100 == 0:
                conn.commit()
                print(f"  ... {i + 1}/{len(rows)} committed")

        except Exception as e:
            stats["errors"] += 1
            print(f"ERROR [{path[-60:]}]: {e}", file=sys.stderr)
            conn.rollback()
            cur = conn.cursor()

    conn.commit()

    if max_created_at and not DRY_RUN:
        write_cursor(max_created_at)
        print(f"Cursor advanced to {max_created_at.isoformat()}")

    cur.close()
    conn.close()

    print(f"\nDone.")
    print(f"  canonical_assets:   {stats['assets']} upserted")
    print(f"  asset_revisions:    {stats['revisions']} upserted")
    print(f"  source_observations:{stats['observations']} inserted")
    print(f"  errors:             {stats['errors']}")


if __name__ == "__main__":
    main()
