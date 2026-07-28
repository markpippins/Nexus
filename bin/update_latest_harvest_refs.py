#!/usr/bin/env python3
"""
Update cross-references and harvest-references for the latest harvest only.

Usage:
    python3 bin/update_latest_harvest_refs.py [--dry-run]
"""

import json, logging, sys, subprocess, time, uuid
import urllib.request, urllib.error
from collections import defaultdict

log = logging.getLogger("update_latest")
NEBULA_API = "http://localhost:3101/api"
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stderr)

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
        body_text = e.read().decode() if e.fp else "(no body)"
        log.warning("  API %s: %s", e.code, body_text[:200])
        return {"error": True, "status": e.code}

def nebula_get(path):
    url = f"{NEBULA_API}{path}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--harvest-id", help="Specific harvest UUID to update (default: latest)")
args = parser.parse_args()

# ── Find the latest harvest ────────────────────────────────────────
if args.harvest_id:
    harvest_id = args.harvest_id
else:
    rc, out = psql("SELECT id FROM nebula.harvests ORDER BY created_at DESC LIMIT 1;")
    harvest_id = out.strip()
    if not harvest_id:
        log.error("No harvests found in database!")
        sys.exit(1)

log.info("=" * 60)
log.info("Updating refs for harvest: %s", harvest_id)

rc, fname = psql(f"SELECT source_filename FROM nebula.harvests WHERE id = '{harvest_id}';")
harvest_name = fname.strip() if fname else harvest_id[:12]
log.info("Harvest name: %s", harvest_name)

# ── Part 1: harvest_candidate → harvest (sourced_from) ──────────
log.info("")
log.info("--- Part 1: harvest_candidate → harvest (sourced_from) ---")

# Get candidates for this harvest
rc2, out2 = psql(f"SELECT id, title FROM nebula.harvest_candidates WHERE harvest_id = '{harvest_id}';")
candidates = []
if out2:
    for line in out2.splitlines():
        parts = line.split("|", 1)
        if len(parts) >= 1:
            candidates.append({"id": parts[0].strip(), "title": parts[1].strip() if len(parts) > 1 else ""})
log.info("Found %d candidates for this harvest", len(candidates))

# Check existing sourced_from refs
rc3, out3 = psql(f"""SELECT source_id FROM nebula.cross_references 
                     WHERE target_id = '{harvest_id}' AND rel_type = 'sourced_from' 
                     AND source_type = 'harvest_candidate';""")
existing_source_ids = set(out3.splitlines()) if out3 else set()
log.info("Existing sourced_from refs for this harvest: %d", len(existing_source_ids))

created_p1 = 0
skipped_p1 = 0
for c in candidates:
    if c["id"] in existing_source_ids:
        skipped_p1 += 1
        continue
    
    if args.dry_run:
        created_p1 += 1
        log.info("  Would create: %s → harvest", c["title"][:60])
        continue
    
    body = {
        "sourceType": "harvest_candidate",
        "sourceId": c["id"],
        "targetType": "harvest",
        "targetId": harvest_id,
        "relType": "sourced_from",
        "metadata": {
            "candidateTitle": c["title"][:200],
            "harvestFilename": harvest_name,
        }
    }
    result = nebula_post("/cross-references", body)
    if result.get("error"):
        log.warning("  Error: %s", c["title"][:40])
    else:
        created_p1 += 1

log.info("Part 1: %d created, %d skipped", created_p1, skipped_p1)

# ── Part 2: harvest → harvest (informs) ───────────────────────────
log.info("")
log.info("--- Part 2: harvest → harvest (informs) ---")

# Get existing informs refs involving this harvest
rc4, out4 = psql(f"""SELECT source_id, target_id FROM nebula.cross_references 
                     WHERE rel_type = 'informs' AND source_type = 'harvest' 
                     AND target_type = 'harvest'
                     AND (source_id = '{harvest_id}' OR target_id = '{harvest_id}');""")
existing_hh = set()
if out4:
    for line in out4.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            existing_hh.add((parts[0].strip(), parts[1].strip()))
            existing_hh.add((parts[1].strip(), parts[0].strip()))
log.info("Existing harvest→harvest informs refs: %d", len(existing_hh))

# Find knowledge entities shared between this harvest's candidates and other harvests
# via cross_schema refs (embedding → knowledge entity)
rc5, out5 = psql(f"""SELECT hce.candidate_title, cr.target_id as kg_id, 
                            cr.metadata->>'knowledge_name' as kg_name,
                            (cr.metadata->>'similarity')::float as sim,
                            other_c.harvest_id as other_harvest_id,
                            other_h.source_filename as other_name
                     FROM nebula.harvest_candidate_embeddings hce
                     JOIN nebula.harvest_candidates hc ON hc.title = hce.candidate_title AND hc.harvest_id = '{harvest_id}'
                     JOIN nebula.cross_references cr ON cr.source_id = hce.id::text AND cr.rel_type = 'cross_schema'
                     LEFT JOIN nebula.harvest_candidates other_c ON other_c.title = hce.candidate_title AND other_c.harvest_id != '{harvest_id}'
                     LEFT JOIN nebula.harvests other_h ON other_h.id = other_c.harvest_id
                     WHERE (cr.metadata->>'similarity')::float >= 0.70
                       AND other_c.harvest_id IS NOT NULL;""")

# Group other harvests by shared KG entities
other_harvests = defaultdict(lambda: {"kg_ids": set(), "kg_names": set()})
if out5:
    for line in out5.splitlines():
        parts = line.split("|", 5)
        if len(parts) >= 5:
            kg_id = parts[1].strip()
            kg_name = parts[2].strip() if len(parts) > 2 else ""
            o_hid = parts[4].strip() if len(parts) > 4 else ""
            o_name = parts[5].strip() if len(parts) > 5 else ""
            if o_hid:
                other_harvests[o_hid]["kg_ids"].add(kg_id)
                other_harvests[o_hid]["kg_names"].add(kg_name)
                other_harvests[o_hid]["name"] = o_name

log.info("Found %d other harvests with shared knowledge entities", len(other_harvests))

links_found = 0
links_created = 0
for o_hid, kg_data in other_harvests.items():
    if o_hid == harvest_id:
        continue
    if (harvest_id, o_hid) in existing_hh or (o_hid, harvest_id) in existing_hh:
        continue
    
    links_found += 1
    o_name = kg_data.get("name", o_hid[:12])
    
    if args.dry_run:
        log.info("  Would link: %s ↔ %s (shared KG: %s)", harvest_name[:40], o_name[:40], 
                 ", ".join(list(kg_data["kg_names"])[:3]))
        continue
    
    body = {
        "sourceType": "harvest",
        "sourceId": harvest_id,
        "targetType": "harvest",
        "targetId": o_hid,
        "relType": "informs",
        "metadata": {
            "sharedKGCount": len(kg_data["kg_ids"]),
            "harvest1Name": harvest_name,
            "harvest2Name": o_name,
            "topKGMatches": list(kg_data["kg_names"])[:5],
        }
    }
    result = nebula_post("/cross-references", body)
    if not result.get("error"):
        links_created += 1

log.info("Part 2: %d found, %d created", links_found, links_created)

# ── Part 3: Backfill block-adjacency harvest_references ──────────
log.info("")
log.info("--- Part 3: Backfill harvest_references (block adjacency) ---")

# Check existing harvest_references for this harvest
rc6, out6 = psql(f"SELECT count(*) FROM nebula.harvest_references WHERE conversation_id = '{harvest_id}';")
existing_refs = int(out6.strip()) if out6 and out6.strip().isdigit() else 0
log.info("Existing harvest_references for this harvest: %d", existing_refs)

# Check if this harvest has conversation_blocks
rc7, out7 = psql(f"SELECT count(*) FROM nebula.conversation_blocks WHERE conversation_id = '{harvest_id}';")
total_blocks = int(out7.strip()) if out7 and out7.strip().isdigit() else 0
log.info("Conversation blocks found: %d", total_blocks)

if total_blocks == 0:
    log.info("No conversation_blocks for this harvest — skipping Part 3.")
    log.info("  (docklang v0.3 stores plain body text, not structured blocks. Run")
    log.info("   the block-extraction pipeline first or backfill via SQL migration.)")
else:
    backfilled = 0
    
    # Use conversation_blocks table for adjacency refs (same approach as migration 004)
    sql = f"""
    WITH adjacent_pairs AS (
        SELECT
            cb1.id AS source_block_id,
            cb2.id AS target_block_id,
            cb1.snapshot_id,
            cb1.block_index AS source_idx,
            cb2.block_index AS target_idx
        FROM nebula.conversation_blocks cb1
        JOIN nebula.conversation_blocks cb2
            ON cb2.snapshot_id = cb1.snapshot_id
            AND cb2.block_index = cb1.block_index + 1
            AND cb2.conversation_id = cb1.conversation_id
        WHERE cb1.conversation_id = '{harvest_id}'
          AND cb2.conversation_id = '{harvest_id}'
    ),
    adjacency_inserts AS (
        INSERT INTO nebula.harvest_references
            (conversation_id, snapshot_id,
             source_block_id, target_block_id,
             edge_type, confidence, state, source,
             reason, evidence_json)
        SELECT
            '{harvest_id}',
            p.snapshot_id,
            p.source_block_id,
            p.target_block_id,
            'adjacency',
            0.95,
            'CONFIRMED',
            'BACKFILL',
            format('Block %%s → %%s (adjacent within snapshot)', p.source_idx, p.target_idx),
            jsonb_build_object(
                'type', 'adjacency',
                'source_index', p.source_idx,
                'target_index', p.target_idx,
                'method', 'block_index_adjacency'
            )
        FROM adjacent_pairs p
        WHERE NOT EXISTS (
            SELECT 1 FROM nebula.harvest_references hr
            WHERE hr.conversation_id = '{harvest_id}'
              AND hr.source_block_id = p.source_block_id
              AND hr.target_block_id = p.target_block_id
              AND hr.edge_type = 'adjacency'
        )
        RETURNING 1
    )
    SELECT count(*) FROM adjacency_inserts;
    """
    
    if args.dry_run:
        # Count how many would be created without executing
        rc8, count_out = psql(f"""
        SELECT count(*)
        FROM nebula.conversation_blocks cb1
        JOIN nebula.conversation_blocks cb2
            ON cb2.snapshot_id = cb1.snapshot_id
            AND cb2.block_index = cb1.block_index + 1
            AND cb2.conversation_id = cb1.conversation_id
        WHERE cb1.conversation_id = '{harvest_id}'
          AND cb2.conversation_id = '{harvest_id}'
          AND NOT EXISTS (
            SELECT 1 FROM nebula.harvest_references hr
            WHERE hr.conversation_id = '{harvest_id}'
              AND hr.source_block_id = cb1.id
              AND hr.target_block_id = cb2.id
              AND hr.edge_type = 'adjacency'
          );
        """)
        backfilled = int(count_out.strip()) if count_out and count_out.strip().isdigit() else 0
        log.info("  Would create %d adjacency refs from conversation_blocks", backfilled)
    else:
        rc9, count_out = psql(sql)
        backfilled = int(count_out.strip()) if count_out and count_out.strip().isdigit() else 0
        log.info("  Created %d adjacency refs", backfilled)

# ── Summary ────────────────────────────────────────────────────────
log.info("")
log.info("=" * 60)
log.info("SUMMARY for harvest %s (%s)", harvest_id, harvest_name)
log.info("  Part 1 (sourced_from):  %d created, %d skipped", created_p1, skipped_p1)
log.info("  Part 2 (informs):       %d found, %d created", links_found, links_created)
log.info("  Part 3 (adjacency):     %d backfilled", backfilled if not args.dry_run else 0)
log.info("=" * 60)
