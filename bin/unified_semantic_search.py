#!/usr/bin/env python3
"""
Unified Semantic Search: Knowledge Graph + Harvest Pipeline

Queries both knowledge.graph_entity_embeddings (cosine similarity via pgvector)
and nebula.harvest_candidate_embeddings (cosine similarity via pgvector)
simultaneously. Merges results with provenance labels (curated vs harvested)
and returns sorted by relevance.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/unified_semantic_search.py "TypeSpec contract-first architecture"
    python3 bin/unified_semantic_search.py "agent orchestration leases" --limit 10
    python3 bin/unified_semantic_search.py "TypeSpec" --json
"""

import argparse
import json
import logging
import subprocess
import sys
import time

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("unified_search")

# ── Config ─────────────────────────────────────────────────────
OLLAMA_URL = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
    "-t", "-A", "-q",
]


def generate_query_embedding(query: str) -> list[float] | None:
    """Generate an embedding for the search query via Ollama."""
    try:
        resp = httpx.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": query},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
    except Exception as e:
        log.error("Failed to generate query embedding: %s", e)
        return None


def search_harvest_candidates(query_embedding: list[float], limit: int = 10) -> list[dict]:
    """Search harvest candidate embeddings via cosine similarity."""
    if not query_embedding:
        return []

    vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    sql = f"""
    SELECT id, candidate_title AS title, intent_text AS description,
           (1 - (embedding <=> '{vec_str}'::vector))::real AS similarity,
           source_filename,
           'harvested' AS provenance,
           'candidate' AS result_type
    FROM nebula.harvest_candidate_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> '{vec_str}'::vector
    LIMIT {limit}
    """

    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=30,
    )

    results = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 7:
            try:
                results.append({
                    "id": parts[0],
                    "title": parts[1],
                    "description": parts[2][:300],
                    "similarity": float(parts[3]),
                    "source": parts[4],
                    "provenance": parts[5],
                    "result_type": parts[6],
                })
            except (ValueError, IndexError):
                continue

    return results


def search_knowledge_entities(query_embedding: list[float], limit: int = 10) -> list[dict]:
    """Search knowledge entity embeddings via cosine similarity (pgvector)."""
    if not query_embedding:
        return []

    vec_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    sql = f"""
    SELECT ee.id, ge.section, ge.entity_type, ge.status,
           ee.name AS title, COALESCE(ge.description, ee.embed_text) AS description,
           (1 - (ee.embedding <=> '{vec_str}'::vector))::real AS similarity,
           'curated' AS provenance,
           'knowledge_entity' AS result_type
    FROM knowledge.graph_entity_embeddings ee
    JOIN knowledge.graph_entities ge ON ge.id = ee.entity_id
    WHERE ee.embedding IS NOT NULL
    ORDER BY ee.embedding <=> '{vec_str}'::vector
    LIMIT {limit}
    """

    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=30,
    )

    results = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 9:
            try:
                results.append({
                    "id": parts[0],
                    "section": parts[1],
                    "entity_type": parts[2],
                    "status": parts[3],
                    "title": parts[4],
                    "description": parts[5][:300] if parts[5] else "",
                    "similarity": float(parts[6]),
                    "provenance": parts[7],
                    "result_type": parts[8],
                })
            except (ValueError, IndexError):
                continue

    return results


def merge_and_rank(harvest_results, knowledge_results, limit=15):
    """Merge results from both sources, sorted by cosine similarity."""
    merged = []

    for r in harvest_results:
        merged.append(r)
    for r in knowledge_results:
        merged.append(r)

    # Sort by similarity descending (both sides use cosine similarity now)
    merged.sort(key=lambda x: -x["similarity"])

    return merged[:limit]


def search(query: str, limit: int = 15, json_output: bool = False) -> dict:
    """Run the unified search and return results."""
    log.info("Unified search: '%s' (limit=%d)", query, limit)

    # Generate embedding for semantic search
    start = time.time()
    query_embedding = generate_query_embedding(query)
    embed_time = time.time() - start

    if query_embedding:
        log.info("Query embedding dimension: %d (%.2fs)", len(query_embedding), embed_time)

    # Search both sources in parallel-like sequential calls
    harvest_results = search_harvest_candidates(query_embedding, limit=limit)
    knowledge_results = search_knowledge_entities(query_embedding, limit=limit)

    log.info("Harvest (cosine): %d results", len(harvest_results))
    log.info("Knowledge (cosine): %d results", len(knowledge_results))

    # Merge and rank
    merged = merge_and_rank(harvest_results, knowledge_results, limit=limit)

    return {
        "query": query,
        "total_results": len(merged),
        "harvest_results": len(harvest_results),
        "knowledge_results": len(knowledge_results),
        "results": merged,
    }


def main():
    parser = argparse.ArgumentParser(description="Unified semantic search across knowledge graph and harvests")
    parser.add_argument("query", help="Search query string")
    parser.add_argument("--limit", type=int, default=15, help="Max results (default: 15)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    result = search(args.query, limit=args.limit, json_output=args.json)

    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        # Pretty print
        print(f"\nQuery: \"{result['query']}\"")
        print(f"Results: {result['total_results']} ({result['harvest_results']} harvested, {result['knowledge_results']} curated)")
        print("-" * 80)

        for i, r in enumerate(result["results"], 1):
            prov_label = "📦" if r["provenance"] == "harvested" else "🧠"
            print(f"\n{i}. {prov_label} [{r['provenance'].upper()}] {r['title']}")
            print(f"   Similarity: {r.get('similarity', 0):.4f}")
            if "section" in r:
                print(f"   Section: {r['section']} ({r.get('entity_type', '')})")
            if "source" in r:
                print(f"   Source: {r['source']}")
            desc = r.get("description", "")
            if desc:
                print(f"   {desc[:200]}")

        print(f"\n{'-' * 80}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
