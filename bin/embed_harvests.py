#!/usr/bin/env python3
"""
Harvest Candidate Embedding Pipeline

Extracts all harvest candidates from nebula.harvests_history, generates
vector embeddings via Ollama (nomic-embed-text, 768-dim), and stores
them in nebula.harvest_candidate_embeddings.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 embed_harvests.py
    python3 embed_harvests.py --dry-run
"""

import argparse
import json
import logging
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

from event_emitter import emit_embedding_created

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("embed_harvests")

# ── Config ─────────────────────────────────────────────────────
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
EMBED_DIM = 768
INSERT_BATCH = 25  # Multi-row INSERT batch size

# PostgreSQL connection via docker
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
    "-t", "-A", "-q",
]


def sql_escape(val: str) -> str:
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def fetch_all_candidates():
    """Fetch all harvest candidates from the nebula REST API using httpx."""
    client = httpx.Client(timeout=60.0)
    try:
        log.info("Fetching all harvests from nebula API...")
        try:
            r = client.get("http://localhost:3101/api/harvests")
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log.error("Failed to fetch harvest list: %s", e)
            return []

        harvests = data.get("harvests", [])
        with_candidates = [
            (h["id"], h["source_filename"])
            for h in harvests
            if h.get("total_candidates", 0) > 0
        ]
        log.info("Found %d harvests with candidates", len(with_candidates))

        all_candidates = []
        fetch_errors = 0
        for idx, (hid, fname) in enumerate(with_candidates):
            if idx % 20 == 0:
                log.info("  Fetching harvest %d/%d...", idx + 1, len(with_candidates))
            try:
                r = client.get(f"http://localhost:3101/api/harvests/{hid}")
                r.raise_for_status()
                d = r.json()
            except Exception as e:
                fetch_errors += 1
                if fetch_errors <= 3:
                    log.warning("Failed to fetch harvest %s: %s", hid, e)
                continue

            for i, c in enumerate(d.get("candidates", [])):
                title = c.get("title", "")
                intent = c.get("intent_description", "") or ""
                if not intent.strip():
                    continue
                all_candidates.append({
                    "harvest_id": hid,
                    "candidate_index": i,
                    "candidate_title": title,
                    "intent_text": intent,
                    "source_filename": fname,
                })

        if fetch_errors:
            log.warning("Fetch errors: %d harvests failed to retrieve", fetch_errors)
        log.info("Extracted %d candidates with non-empty intent_description", len(all_candidates))
        return all_candidates
    finally:
        client.close()


def generate_embeddings(candidates):
    """Generate embeddings via Ollama nomic-embed-text one candidate at a time.

    nomic-embed-text uses the "prompt" field (singular string), NOT "input" or batched lists.
    """
    embeddings = []
    total = len(candidates)
    failures = 0

    client = httpx.Client(timeout=120.0)

    for idx, c in enumerate(candidates):
        if idx % 25 == 0:
            log.info("Embedding %d/%d...", idx + 1, total)

        try:
            resp = client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={
                    "model": EMBED_MODEL,
                    "prompt": c["intent_text"],
                },
            )
            resp.raise_for_status()
            result = resp.json()
            emb = result.get("embedding", [])

            if emb and len(emb) == EMBED_DIM:
                embeddings.append({**c, "embedding": emb})
            else:
                failures += 1
                if failures <= 3:
                    log.warning(
                        "Candidate '%s' got bad embedding (dim=%d)",
                        c["candidate_title"][:60], len(emb) if emb else 0,
                    )
        except Exception as e:
            failures += 1
            if failures <= 3:
                log.error("Embedding %d failed: %s", idx + 1, e)

        # Small delay to avoid overwhelming Ollama
        if idx % 10 == 9:
            time.sleep(0.3)

    client.close()
    log.info("Generated %d embeddings (%d failures)", len(embeddings), failures)
    return embeddings


def insert_embeddings(embeddings, dry_run: bool = False):
    """Insert embeddings into nebula.harvest_candidate_embeddings via batch INSERT.
    
    Pipes SQL via stdin to docker exec (avoids temp file path issues with containers).
    """
    if dry_run:
        log.info("DRY RUN — would insert %d embeddings", len(embeddings))
        for e in embeddings[:3]:
            log.info("  %s (dim=%d)", e["candidate_title"][:60], len(e["embedding"]))
        return len(embeddings)

    inserted = 0
    errors = 0
    total = len(embeddings)

    for batch_start in range(0, total, INSERT_BATCH):
        batch = embeddings[batch_start:batch_start + INSERT_BATCH]
        batch_num = batch_start // INSERT_BATCH + 1
        total_insert_batches = (total + INSERT_BATCH - 1) // INSERT_BATCH

        # Build multi-row INSERT
        value_rows = []
        for e in batch:
            vec_str = "[" + ",".join(str(x) for x in e["embedding"]) + "]"
            row = (
                f"({sql_escape(e['harvest_id'])},"
                f"{e['candidate_index']},"
                f"{sql_escape(e['candidate_title'])},"
                f"{sql_escape(e['intent_text'])},"
                f"'{vec_str}'::vector,"
                f"{sql_escape(e['source_filename'])})"
            )
            value_rows.append(row)

        sql = (
            f"INSERT INTO nebula.harvest_candidate_embeddings "
            f"(harvest_id, candidate_index, candidate_title, intent_text, embedding, source_filename) "
            f"VALUES {','.join(value_rows)} "
            f"ON CONFLICT (harvest_id, candidate_index) DO UPDATE SET "
            f"candidate_title = EXCLUDED.candidate_title, "
            f"intent_text = EXCLUDED.intent_text, "
            f"embedding = EXCLUDED.embedding, "
            f"source_filename = EXCLUDED.source_filename;"
        )

        try:
            result = subprocess.run(
                DOCKER_PSQL,
                input=sql,
                capture_output=True, text=True, timeout=60,
            )

            if result.returncode == 0:
                inserted += len(batch)
            else:
                errors += len(batch)
                log.error("Insert batch %d failed: %s", batch_num, result.stderr[:200])
        except Exception as ex:
            errors += len(batch)
            log.error("Insert batch %d error: %s", batch_num, ex)

        log.info("  Insert progress: %d/%d (%d errors)", inserted, total, errors)

    log.info("Inserted %d embeddings (%d errors)", inserted, errors)
    return inserted


def rebuild_index():
    """Rebuild the ivfflat index after data is loaded for better recall."""
    log.info("Rebuilding ivfflat index for better recall...")
    result = subprocess.run(
        DOCKER_PSQL + [
            "-c",
            "REINDEX INDEX nebula.idx_candidate_embeddings_ivfflat;"
        ],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode == 0:
        log.info("Index rebuilt successfully")
    else:
        log.warning("Index rebuild issue: %s", result.stderr[:200])


def run_semantic_test():
    """Run a quick semantic search test to verify embeddings work."""
    log.info("Running semantic search test...")

    # First get the embedding for a test query
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": "TypeSpec contract-first architecture code generation"},
            timeout=30,
        )
        resp.raise_for_status()
        query_embedding = resp.json()["embedding"]
    except Exception as e:
        log.warning("Test query embedding failed: %s", e)
        return

    vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    sql = f"""
    SELECT candidate_title,
           (1 - (embedding <=> '{vec_str}'::vector))::real AS similarity,
           LEFT(intent_text, 120) AS preview
    FROM nebula.harvest_candidate_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> '{vec_str}'::vector
    LIMIT 5
    """

    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=30,
    )

    log.info("Semantic search test results (top 5):")
    for line in result.stdout.strip().split("\n"):
        log.info("  %s", line.strip())


def main():
    parser = argparse.ArgumentParser(description="Embed harvest candidates via Ollama")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without inserting")
    parser.add_argument("--skip-reindex", action="store_true", help="Skip ivfflat index rebuild")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Harvest Candidate Embedding Pipeline")
    log.info("Model: %s @ %s (dim=%d)", EMBED_MODEL, OLLAMA_URL, EMBED_DIM)
    log.info("=" * 60)

    # Step 1: Fetch candidates
    candidates = fetch_all_candidates()
    if not candidates:
        log.error("No candidates found")
        return 1

    log.info("Candidate text stats:")
    lengths = [len(c["intent_text"]) for c in candidates]
    log.info("  Min: %d  Max: %d  Mean: %.0f  Median: %d",
             min(lengths), max(lengths),
             sum(lengths) / len(lengths),
             sorted(lengths)[len(lengths) // 2])

    # Step 2: Generate embeddings (one per candidate, nomic-embed-text "prompt" field)
    start = time.time()
    embeddings = generate_embeddings(candidates)
    elapsed = time.time() - start
    if embeddings:
        log.info("Embedding generation took %.1fs (%.2f s/candidate)", elapsed, elapsed / len(candidates))

    if not embeddings:
        log.error("No embeddings generated")
        return 1

    # Step 3: Insert embeddings in batched multi-row INSERTs
    inserted = insert_embeddings(embeddings, dry_run=args.dry_run)

    if args.dry_run:
        return 0

    # Cascade event: embedding.created (aggregate by harvest)
    if inserted > 0:
        harvest_ids = list(set(e["harvest_id"] for e in embeddings if e.get("harvest_id")))
        for hid in harvest_ids:
            count = sum(1 for e in embeddings if e.get("harvest_id") == hid)
            try:
                emit_embedding_created(
                    harvest_id=hid,
                    candidate_count=count,
                    model=EMBED_MODEL,
                    source="rover.embed_harvests",
                )
            except Exception as e:
                log.debug("  embedding.created emission failed for %s: %s", hid[:8], e)

    # Step 4: Rebuild index for better recall
    if not args.skip_reindex and inserted > 0:
        rebuild_index()

    # Step 5: Quick verification
    run_semantic_test()

    log.info("=" * 60)
    log.info("COMPLETE: %d/%d candidates embedded", inserted, len(candidates))
    log.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
