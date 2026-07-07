#!/usr/bin/env python3
"""
Batch Publish Harvests — Query-driven forum publishing + duplicate harvest cleanup.

Queries nebula.harvests for harvests that have candidates but no Assembly
forum post, then publishes each one via assembly-mcp. No hard-coded IDs.

Also supports --deduplicate to clean up duplicate harvests (same source_filename,
different UUIDs from re-ingestion), keeping only the most recent per filename.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_publish_harvests.py [--dry-run] [--limit N] [--deduplicate]
"""

import argparse
import json
import logging
import subprocess
import sys
import time
import urllib.request
import urllib.error

log = logging.getLogger("batch_publish")

ASSEMBLY_MCP_URL = "http://localhost:3104"
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    result = subprocess.run(
        DOCKER_PSQL + ["-t", "-A"],
        input=sql, capture_output=True, text=True, timeout=timeout,
    )
    return result.returncode, result.stdout.strip()


def assembly_mcp_call(method: str, params: dict) -> dict:
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": "1",
        "method": method,
        "params": params,
    }).encode("utf-8")
    req = urllib.request.Request(
        ASSEMBLY_MCP_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else "(no body)"
        log.error("  Assembly MCP %s: %s", method, body_text[:500])
        return {"error": True, "status": e.code, "body": body_text[:500]}
    except Exception as e:
        log.error("  Assembly MCP call failed: %s", e)
        return {"error": True}


def publish_harvest_to_forum(harvest_id: str) -> bool:
    result = assembly_mcp_call("tools/call", {
        "name": "assembly_publish_harvest",
        "arguments": {"harvest_id": harvest_id},
    })
    if isinstance(result, dict) and result.get("error"):
        return False
    content = result.get("result", {}).get("content", [])
    if content:
        log.info("  Forum post result: %s", content[0].get("text", "")[:200])
    return True


def get_unpublished_harvests(limit: int | None = None) -> list[dict]:
    """Query for harvests with candidates but no Assembly forum post."""
    sql = """
    SELECT h.id, h.source_filename, COUNT(hc.id) AS candidate_count
    FROM nebula.harvests h
    JOIN nebula.harvest_candidates hc ON hc.harvest_id = h.id
    WHERE h.id NOT IN (
        SELECT DISTINCT artifact_id
        FROM assembly.post_artifact_refs
        WHERE artifact_type = 'harvest'
    )
    GROUP BY h.id, h.source_filename
    ORDER BY h.source_filename
    """
    if limit:
        sql += f" LIMIT {limit}"

    rc, out = psql(sql)
    if rc != 0 or not out:
        log.error("Failed to query unpublished harvests")
        return []

    harvests = []
    for line in out.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            harvests.append({
                "id": parts[0],
                "filename": parts[1],
                "candidate_count": int(parts[2]),
            })
    return harvests


def get_duplicate_groups() -> list[dict]:
    """Find duplicate harvests (same source_filename, multiple IDs)."""
    sql = """
    WITH dupes AS (
        SELECT source_filename, COUNT(*) as cnt
        FROM nebula.harvests
        GROUP BY source_filename
        HAVING COUNT(*) > 1
    ),
    keep AS (
        SELECT DISTINCT ON (h.source_filename)
            h.id as keep_id, h.source_filename, h.created_at
        FROM nebula.harvests h
        JOIN dupes d ON d.source_filename = h.source_filename
        ORDER BY h.source_filename, h.created_at DESC
    )
    SELECT
        k.source_filename,
        k.keep_id,
        h.id as remove_id,
        (SELECT COUNT(*) FROM nebula.harvest_candidates WHERE harvest_id = h.id) as remove_cands,
        (SELECT COUNT(*) FROM nebula.harvest_candidates WHERE harvest_id = k.keep_id) as keep_cands,
        (SELECT COUNT(*) FROM assembly.post_artifact_refs
         WHERE artifact_type = 'harvest' AND artifact_id = h.id) as remove_posts
    FROM keep k
    JOIN nebula.harvests h ON h.source_filename = k.source_filename AND h.id != k.keep_id
    ORDER BY k.source_filename;
    """
    rc, out = psql(sql)
    if rc != 0:
        log.error("Failed to query duplicate groups")
        return []

    if not out:
        return []  # No duplicates — expected, not an error

    groups = []
    for line in out.splitlines():
        parts = line.split("|", 5)
        if len(parts) == 6:
            groups.append({
                "filename": parts[0],
                "keep_id": parts[1],
                "remove_id": parts[2],
                "remove_cands": int(parts[3]),
                "keep_cands": int(parts[4]),
                "remove_posts": int(parts[5]),
            })
    return groups


def deduplicate_harvests(dry_run: bool = False) -> dict:
    """Deduplicate harvests: reassign candidates, clean refs, delete duplicates.
    For each duplicate filename group, keeps the most recent harvest (by created_at).
    Returns summary dict with counts."""
    groups = get_duplicate_groups()
    if not groups:
        log.info("No duplicate harvests found.")
        return {"groups": 0, "removed": 0, "candidates_moved": 0, "posts_cleaned": 0}

    unique_filenames = len(set(g["filename"] for g in groups))
    total_remove = len(groups)
    total_remove_cands = sum(g["remove_cands"] for g in groups)
    total_remove_posts = sum(g["remove_posts"] for g in groups)

    log.info("=" * 60)
    log.info("Duplicate Harvest Analysis")
    log.info("  Duplicate groups: %d filenames, %d harvests to remove",
             unique_filenames, total_remove)
    log.info("  Candidates to reassign: %d", total_remove_cands)
    log.info("  Forum post refs to clean: %d", total_remove_posts)

    for g in groups:
        log.info("  [%s] %s → keep=%s (keep_cands=%d, remove_cands=%d)",
                 g["remove_id"][:12], g["filename"][:60],
                 g["keep_id"][:12], g["keep_cands"], g["remove_cands"])

    if dry_run:
        log.info("DRY RUN — no changes made.")
        log.info("=" * 60)
        return {
            "groups": unique_filenames,
            "removed": total_remove,
            "candidates_moved": total_remove_cands,
            "posts_cleaned": total_remove_posts,
        }

    # Step 1: Reassign candidates from remove → keep harvest
    sql_reassign = """
    WITH keep AS (
        SELECT DISTINCT ON (source_filename) id, source_filename
        FROM nebula.harvests
        ORDER BY source_filename, created_at DESC
    ),
    remove AS (
        SELECT h.id, h.source_filename, k.id as keep_id
        FROM nebula.harvests h
        JOIN keep k ON k.source_filename = h.source_filename AND k.id != h.id
        WHERE h.source_filename IN (
            SELECT source_filename FROM nebula.harvests
            GROUP BY source_filename HAVING COUNT(*) > 1
        )
    )
    UPDATE nebula.harvest_candidates hc
    SET harvest_id = r.keep_id
    FROM remove r
    WHERE hc.harvest_id = r.id;
    """
    rc, _ = psql(sql_reassign)
    if rc == 0:
        log.info("  ✓ Reassigned %d candidates", total_remove_cands)
    else:
        log.error("  ✗ Failed to reassign candidates")
        return {"error": True}

    # Step 2: Delete forum post artifact refs on remove harvests
    sql_clean_refs = """
    WITH keep AS (
        SELECT DISTINCT ON (source_filename) id, source_filename
        FROM nebula.harvests
        ORDER BY source_filename, created_at DESC
    )
    DELETE FROM assembly.post_artifact_refs
    WHERE artifact_type = 'harvest'
    AND artifact_id IN (
        SELECT h.id FROM nebula.harvests h
        WHERE h.id NOT IN (SELECT id FROM keep)
        AND h.source_filename IN (
            SELECT source_filename FROM nebula.harvests
            GROUP BY source_filename HAVING COUNT(*) > 1
        )
    );
    """
    rc, _ = psql(sql_clean_refs)
    if rc == 0:
        log.info("  ✓ Cleaned %d forum post artifact refs", total_remove_posts)
    else:
        log.warning("  ⚠ Failed to clean some forum post refs")

    # Step 3: Delete the duplicate harvests
    sql_delete = """
    WITH keep AS (
        SELECT DISTINCT ON (source_filename) id, source_filename
        FROM nebula.harvests
        ORDER BY source_filename, created_at DESC
    )
    DELETE FROM nebula.harvests
    WHERE id NOT IN (SELECT id FROM keep)
    AND source_filename IN (
        SELECT source_filename FROM nebula.harvests
        GROUP BY source_filename HAVING COUNT(*) > 1
    );
    """
    rc, _ = psql(sql_delete)
    if rc == 0:
        log.info("  ✓ Deleted %d duplicate harvests", total_remove)
    else:
        log.error("  ✗ Failed to delete duplicate harvests")
        return {"error": True}

    log.info("=" * 60)
    return {
        "groups": unique_filenames,
        "removed": total_remove,
        "candidates_moved": total_remove_cands,
        "posts_cleaned": total_remove_posts,
    }


def main():
    parser = argparse.ArgumentParser(description="Batch publish harvests to Assembly forum")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Delay in seconds between publishes (default: 0.5)")
    parser.add_argument("--deduplicate", action="store_true",
                        help="Deduplicate harvests: keep most recent per filename, "
                             "reassign candidates, clean forum refs, delete old harvests")
    args = parser.parse_args()

    # Deduplication mode
    if args.deduplicate:
        result = deduplicate_harvests(dry_run=args.dry_run)
        if result.get("error"):
            return 1
        log.info("Dedup summary: %d groups, %d harvests removed, %d candidates moved, %d posts cleaned",
                 result["groups"], result["removed"],
                 result["candidates_moved"], result["posts_cleaned"])
        return 0

    # Publishing mode
    harvests = get_unpublished_harvests(args.limit)
    if not harvests:
        log.info("No unpublished harvests found.")
        return 0

    log.info("=" * 60)
    log.info("Batch Publish Harvests — Query-Driven")
    log.info("Unpublished harvests: %d", len(harvests))
    log.info("Total candidates: %d", sum(h["candidate_count"] for h in harvests))
    log.info("=" * 60)

    if args.dry_run:
        for h in harvests:
            log.info("  [%s] %s (%d candidates)",
                     h["id"][:12], h["filename"], h["candidate_count"])
        return 0

    published = 0
    failed = 0
    start_time = time.time()

    for i, h in enumerate(harvests):
        hid_short = h["id"][:12]
        log.info("[%d/%d] Publishing %s (%d candidates)...",
                 i + 1, len(harvests), hid_short, h["candidate_count"])

        if publish_harvest_to_forum(h["id"]):
            log.info("  ✓ [%s] Published", hid_short)
            published += 1
        else:
            log.warning("  ⚠ [%s] Failed (%s)", hid_short, h["filename"])
            failed += 1

        if args.delay and i < len(harvests) - 1:
            time.sleep(args.delay)

    elapsed = time.time() - start_time
    log.info("=" * 60)
    log.info("COMPLETE: %d published, %d failed, %d total (%.1fs)",
             published, failed, len(harvests), elapsed)
    log.info("=" * 60)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
