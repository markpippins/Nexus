#!/usr/bin/env python3
"""Re-run pgvector similarity matching at a lower threshold for all embeddings."""

import json, logging, sys, subprocess
import urllib.request, urllib.error
from pathlib import Path

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

log = logging.getLogger("rematch")
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "batch_rematch_cross_schema.log"),
    ])

def psql(sql, timeout=60):
    r = subprocess.run(DOCKER_PSQL + ["-t", "-A"], input=sql, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip()

def nebula_post(path, body):
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": True, "status": e.code}

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--threshold", type=float, default=0.55)
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

log.info("=" * 60)
log.info("Re-match Cross-Schema at threshold %.2f", args.threshold)

# Step 1: Get existing cross_schema refs for dedup
log.info("Fetching existing cross_schema refs...")
rc, out = psql("SELECT source_id, target_id FROM nebula.cross_references WHERE rel_type = 'cross_schema';")
existing_xrefs = set()
if out:
    for line in out.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            existing_xrefs.add((parts[0].strip(), parts[1].strip()))
log.info("Existing cross_schema refs: %d", len(existing_xrefs))

# Step 2: Run pgvector cosine similarity at the new threshold
log.info("Running pgvector cosine similarity (threshold: %.2f)...", args.threshold)

rc2, matching_out = psql(f"""
SELECT hce.id::text, hce.candidate_title,
       gee.kg_entity_id, gee.name,
       1 - (hce.embedding <=> gee.embedding) AS similarity
FROM nebula.harvest_candidate_embeddings hce
CROSS JOIN knowledge.graph_entity_embeddings gee
WHERE 1 - (hce.embedding <=> gee.embedding) >= {args.threshold}
ORDER BY hce.candidate_title, similarity DESC;
""")

if not matching_out:
    log.info("No matches found.")
    sys.exit(0)

lines = matching_out.splitlines()
log.info("Found %d matching pairs", len(lines))

if args.dry_run:
    log.info("DRY RUN — showing top matches:")
    shown = 0
    for line in lines:
        parts = line.split("|", 4)
        if len(parts) >= 5:
            embed_id, title, kg_id, kg_name, similarity = parts
            xref_key = (embed_id, kg_id)
            is_new = "NEW" if xref_key not in existing_xrefs else "SKIP"
            if is_new == "NEW" and shown < 20:
                shown += 1
                log.info("  %.4f | %s ↔ %s", float(similarity), title[:60], kg_name[:60])
    new_count = sum(1 for l in lines if (l.split("|", 4)[0].strip(), l.split("|", 4)[2].strip()) not in existing_xrefs)
    log.info("Would create %d new cross_schema refs (skip %d existing)", sum(1 for l in lines if (l.split("|", 4)[0].strip(), l.split("|", 4)[2].strip()) not in existing_xrefs), len(lines)-new_count)
    sys.exit(0)

# Step 3: Create cross_schema cross-references
created = 0
skipped = 0
errors = 0

for line in lines:
    parts = line.split("|", 4)
    if len(parts) < 5:
        continue
    embed_id = parts[0].strip()
    title = parts[1].strip()
    kg_id = parts[2].strip()
    kg_name = parts[3].strip()
    similarity = float(parts[4].strip())

    xref_key = (embed_id, kg_id)
    if xref_key in existing_xrefs:
        skipped += 1
        continue

    body = {
        "sourceType": "harvest_candidate_embedding",
        "sourceId": embed_id,
        "targetType": "knowledge_entity_embedding",
        "targetId": kg_id,
        "relType": "cross_schema",
        "metadata": {
            "version": "v4",
            "similarity": similarity,
            "knowledge_name": kg_name,
            "candidate_title": title[:200],
            "matching_method": "cosine_similarity_pgvector",
            "threshold": args.threshold,
        }
    }

    result = nebula_post("/cross-references", body)
    if result.get("error"):
        errors += 1
        if errors <= 5:
            log.warning("  Error creating ref for: %s ↔ %s", title[:40], kg_name[:40])
    else:
        created += 1
        existing_xrefs.add(xref_key)

    if (created + skipped) % 100 == 0:
        log.info("  Progress: %d created, %d skipped...", created, skipped)

log.info("=" * 60)
log.info("RESULTS: %d created, %d skipped (existing), %d errors", created, skipped, errors)
