#!/usr/bin/env python3
"""
Batch Publish Harvests — Query-driven forum publishing.

Queries nebula.harvests for harvests that have candidates but no Assembly
forum post, then publishes each one via assembly-mcp. No hard-coded IDs.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_publish_harvests.py [--dry-run] [--limit N]
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


def main():
    parser = argparse.ArgumentParser(description="Batch publish harvests to Assembly forum")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Delay in seconds between publishes (default: 0.5)")
    args = parser.parse_args()

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
