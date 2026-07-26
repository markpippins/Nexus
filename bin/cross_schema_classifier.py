#!/usr/bin/env python3
"""
Cross-Schema Classifier v2: Cosine Similarity via pgvector

Matches harvest candidates to knowledge graph entities using cosine similarity
between their pre-computed embeddings (both in pgvector tables).

Replaces the v1 keyword Jaccard approach with much higher precision.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/cross_schema_classifier.py
    python3 bin/cross_schema_classifier.py --threshold 0.20 --dry-run
"""

import argparse
import json
import logging
import subprocess
import sys

import psycopg2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("cross_schema_v2")

# ── Config ─────────────────────────────────────────────────────
NEBULA_API = "http://localhost:3101"
MATCH_THRESHOLD = 0.18  # Cosine similarity threshold (higher = stricter)
TOP_N_PER_CANDIDATE = 2

# Direct PostgreSQL connection
DB = {
    "host": "localhost", "port": 5432,
    "user": "pguser", "password": "pgpass",
    "dbname": "nexus",
}


def connect():
    return psycopg2.connect(**DB)


def parse_embedding(val) -> list[float]:
    """Parse pgvector embedding value — handles string, list, and other formats."""
    if val is None:
        return []
    if isinstance(val, list):
        return [float(x) for x in val]
    if isinstance(val, str):
        val = val.strip()
        if val.startswith('[') and val.endswith(']'):
            return [float(x) for x in val[1:-1].split(',') if x.strip()]
        # Space-separated format
        return [float(x) for x in val.split() if x.strip()]
    return []


def load_harvest_embeddings(conn) -> list[dict]:
    """Load all harvest candidate embeddings with metadata."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, candidate_title, intent_text, source_filename, embedding
        FROM nebula.harvest_candidate_embeddings
        WHERE embedding IS NOT NULL
        ORDER BY candidate_title
    """)
    rows = []
    for row in cur.fetchall():
        rows.append({
            "id": str(row[0]),
            "title": row[1],
            "intent_text": row[2],
            "source_filename": row[3],
            "embedding": parse_embedding(row[4]),
        })
    cur.close()
    log.info("Loaded %d harvest candidate embeddings", len(rows))
    return rows


def load_knowledge_embeddings(conn) -> list[dict]:
    """Load all knowledge entity embeddings with metadata."""
    cur = conn.cursor()
    cur.execute("""
        SELECT ee.id, ee.name, ee.section, ee.kg_entity_id, ee.embed_text, ee.embedding
        FROM knowledge.graph_entity_embeddings ee
        WHERE ee.embedding IS NOT NULL
        ORDER BY ee.section, ee.name
    """)
    rows = []
    for row in cur.fetchall():
        rows.append({
            "id": str(row[0]),
            "name": row[1],
            "section": row[2],
            "kg_entity_id": row[3],
            "embed_text": row[4],
            "embedding": parse_embedding(row[5]),
        })
    cur.close()
    log.info("Loaded %d knowledge entity embeddings", len(rows))
    return rows


def cosine_similarity(a, b) -> float:
    """Compute cosine similarity between two vectors (lists of floats)."""
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def compute_matches(harvest_embs, knowledge_embs, threshold=MATCH_THRESHOLD):
    """Match each harvest candidate to the most similar knowledge entities."""
    log.info("Computing cosine similarity matches (%d × %d)...",
             len(harvest_embs), len(knowledge_embs))

    matches = []
    unmatched = 0
    total = len(harvest_embs)

    for idx, h in enumerate(harvest_embs):
        if idx % 50 == 0:
            log.info("  Matching candidate %d/%d...", idx + 1, total)

        # Compute similarity to all knowledge entities
        top_matches = []
        for k in knowledge_embs:
            sim = cosine_similarity(h["embedding"], k["embedding"])
            if sim >= threshold:
                top_matches.append({
                    "knowledge_id": k["id"],
                    "section": k["section"],
                    "kg_entity_id": k["kg_entity_id"],
                    "name": k["name"],
                    "similarity": round(sim, 4),
                })

        top_matches.sort(key=lambda x: -x["similarity"])
        top_matches = top_matches[:TOP_N_PER_CANDIDATE]

        if top_matches:
            for m in top_matches:
                matches.append({
                    "harvest_embedding_id": h["id"],
                    "candidate_title": h["title"],
                    "intent_text": h["intent_text"],
                    "source_filename": h["source_filename"],
                    "knowledge_section": m["section"],
                    "knowledge_entity_id": m["kg_entity_id"],
                    "knowledge_name": m["name"],
                    "similarity": m["similarity"],
                })
        else:
            unmatched += 1

    log.info("Matched %d candidate→entity pairs (%d candidates unmatched of %d)",
             len(matches), unmatched, total)
    return matches


def clear_old_cross_schema_refs(conn):
    """Delete existing cross_schema cross-references to start fresh."""
    cur = conn.cursor()
    cur.execute("DELETE FROM nebula.cross_references WHERE rel_type = 'cross_schema'")
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    log.info("Deleted %d old cross_schema cross-references", deleted)


def insert_cross_references(matches, dry_run: bool = False):
    """Insert cross-references into nebula.cross_references via the REST API."""
    if dry_run:
        log.info("DRY RUN — would insert %d cross-references", len(matches))
        for m in matches[:5]:
            log.info("  [%.4f] %s → %s/%s",
                     m["similarity"], m["candidate_title"][:60],
                     m["knowledge_section"], m["knowledge_name"])
        return len(matches)

    inserted = 0
    errors = 0
    total = len(matches)

    for idx, m in enumerate(matches):
        payload = {
            "sourceType": "harvest_candidate_embedding",
            "sourceId": m["harvest_embedding_id"],
            "targetType": "knowledge_entity_embedding",
            "targetId": f"{m['knowledge_section']}:{m['knowledge_entity_id']}",
            "relType": "cross_schema",
            "metadata": {
                "similarity": m["similarity"],
                "candidate_title": m["candidate_title"][:200],
                "knowledge_name": m["knowledge_name"],
                "source_filename": m["source_filename"],
                "matching_method": "cosine_similarity_pgvector",
                "version": "v2",
            },
        }

        try:
            r = subprocess.run(
                ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST",
                 f"{NEBULA_API}/api/cross-references",
                 "-H", "Content-Type: application/json",
                 "-d", json.dumps(payload)],
                capture_output=True, text=True, timeout=15,
            )
            if "201" in r.stdout or "200" in r.stdout:
                inserted += 1
            else:
                errors += 1
                if errors <= 3:
                    log.warning("Insert failed: %s", r.stdout[:150])
        except Exception as ex:
            errors += 1
            if errors <= 3:
                log.error("Insert error: %s", ex)

        if (inserted + errors) % 50 == 0:
            log.info("  Progress: %d/%d (%d errors)", inserted, total, errors)

    log.info("Inserted %d cross-schema cross-references (%d errors)", inserted, errors)
    return inserted


def print_summary(matches, harvest_count, knowledge_count):
    """Print classification summary."""
    from collections import Counter

    log.info("=" * 60)
    log.info("COSINE SIMILARITY CLASSIFICATION SUMMARY")
    log.info("=" * 60)
    log.info("Harvest candidates with embeddings: %d", harvest_count)
    log.info("Knowledge entities with embeddings: %d", knowledge_count)
    log.info("Cross-schema matches: %d", len(matches))

    section_counts = Counter(m["knowledge_section"] for m in matches)
    log.info("Matches per knowledge section:")
    for section, count in section_counts.most_common():
        log.info("  %s: %d (%.1f%%)", section, count, 100 * count / len(matches))

    top = sorted(matches, key=lambda x: -x["similarity"])[:15]
    log.info("Top 15 cosine matches:")
    for m in top:
        log.info("  %.4f | %s → [%s] %s",
                 m["similarity"], m["candidate_title"][:65],
                 m["knowledge_section"], m["knowledge_name"])


def main():
    parser = argparse.ArgumentParser(description="Cross-schema classifier v2: cosine similarity via pgvector")
    parser.add_argument("--threshold", type=float, default=MATCH_THRESHOLD)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Cross-Schema Classifier v2 — Cosine Similarity")
    log.info("Threshold: %.3f  Max per candidate: %d", args.threshold, TOP_N_PER_CANDIDATE)
    log.info("=" * 60)

    conn = connect()
    try:
        # Step 1: Load embeddings
        harvest_embs = load_harvest_embeddings(conn)
        knowledge_embs = load_knowledge_embeddings(conn)

        if not harvest_embs or not knowledge_embs:
            log.error("Missing embeddings on one or both sides")
            return 1

        # Step 2: Compute cosine similarity matches
        matches = compute_matches(harvest_embs, knowledge_embs, threshold=args.threshold)

        # Step 3: Clear old keyword-based cross-references
        if not args.dry_run:
            clear_old_cross_schema_refs(conn)

        # Step 4: Print summary
        print_summary(matches, len(harvest_embs), len(knowledge_embs))

        # Step 5: Insert new cross-references
        inserted = insert_cross_references(matches, dry_run=args.dry_run)

        log.info("=" * 60)
        log.info("COMPLETE: %d cross-schema references (cosine similarity)", inserted)
        log.info("=" * 60)

    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
