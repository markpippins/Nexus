#!/usr/bin/env python3
"""Update harvest_references and cross_references with:
1. harvest_candidate → harvest (sourced_from) cross-references
2. harvest → harvest (informs) based on shared knowledge entities
3. Backfill missing block-adjacency harvest_references"""

import json, logging, sys, subprocess, time, uuid
import urllib.request, urllib.error

log = logging.getLogger("update_refs")
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"

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
        return {"error": True, "status": e.code}

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()

log.info("=" * 60)
log.info("Update harvest_references & cross_references")

# ============================================================
# PART 1: harvest_candidate → harvest (sourced_from)
# ============================================================
log.info("--- Part 1: harvest_candidate → harvest (sourced_from) ---")

# Get existing sourced_from pairs for dedup
rc, out = psql("SELECT source_id, target_id FROM nebula.cross_references WHERE rel_type = 'sourced_from' AND source_type = 'harvest_candidate';")
existing = set()
if out:
    for line in out.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            existing.add((parts[0].strip(), parts[1].strip()))
log.info("Existing harvest_candidate sourced_from refs: %d", len(existing))

# Get all candidates with their harvest_ids
rc2, out2 = psql("SELECT id, harvest_id, title FROM nebula.harvest_candidates WHERE harvest_id IS NOT NULL;")
candidates = []
if out2:
    for line in out2.splitlines():
        parts = line.split("|", 2)
        if len(parts) >= 2:
            candidates.append({"id": parts[0].strip(), "harvest_id": parts[1].strip(), "title": parts[2].strip() if len(parts) > 2 else ""})
log.info("Found %d candidates with harvest_id", len(candidates))

# Get harvest filenames for metadata
rc3, out3 = psql("SELECT id, source_filename FROM nebula.harvests;")
harvest_names = {}
if out3:
    for line in out3.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            harvest_names[parts[0].strip()] = parts[1].strip()

created_p1 = 0
skipped_p1 = 0
for c in candidates:
    xref_key = (c["id"], c["harvest_id"])
    if xref_key in existing:
        skipped_p1 += 1
        continue
    
    if args.dry_run:
        created_p1 += 1
        continue
    
    harvest_name = harvest_names.get(c["harvest_id"], c["harvest_id"][:12])
    body = {
        "sourceType": "harvest_candidate",
        "sourceId": c["id"],
        "targetType": "harvest",
        "targetId": c["harvest_id"],
        "relType": "sourced_from",
        "metadata": {
            "candidateTitle": c["title"][:200],
            "harvestFilename": harvest_name,
        }
    }
    result = nebula_post("/cross-references", body)
    if result.get("error"):
        log.warning("  Error: %s → %s", c["title"][:40], harvest_name[:40])
    else:
        created_p1 += 1
        existing.add(xref_key)

log.info("Part 1: %d created, %d skipped", created_p1, skipped_p1)

# ============================================================
# PART 2: harvest → harvest (informs) via shared knowledge entities
# ============================================================
log.info("--- Part 2: harvest → harvest (informs) ---")

# Get existing harvest→harvest informs refs
rc4, out4 = psql("SELECT source_id, target_id FROM nebula.cross_references WHERE rel_type = 'informs' AND source_type = 'harvest' AND target_type = 'harvest';")
existing_hh = set()
if out4:
    for line in out4.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            existing_hh.add((parts[0].strip(), parts[1].strip()))
log.info("Existing harvest→harvest informs refs: %d", len(existing_hh))

# Get all cross_schema refs and map embedding→kg_entity→candidate→harvest
rc5, out5 = psql("""
SELECT cr.source_id as embed_id, hc.harvest_id, hc.title, cr.target_id as kg_id, 
       cr.metadata->>'knowledge_name' as kg_name,
       (cr.metadata->>'similarity')::float as sim
FROM nebula.cross_references cr
JOIN nebula.harvest_candidate_embeddings hce ON hce.id::text = cr.source_id
JOIN nebula.harvest_candidates hc ON hc.title = hce.candidate_title
WHERE cr.rel_type = 'cross_schema'
  AND (cr.metadata->>'similarity')::float >= 0.70
ORDER BY hc.harvest_id, kg_id;
""")

# Build harvest → {kg_entity: [candidates]} map
from collections import defaultdict
harvest_kg = defaultdict(lambda: defaultdict(list))
if out5:
    for line in out5.splitlines():
        parts = line.split("|", 5)
        if len(parts) >= 4:
            hid = parts[1].strip()
            kg_id = parts[3].strip()
            kg_name = parts[4].strip() if len(parts) > 4 else ""
            harvest_kg[hid][kg_id].append(kg_name)

# Find pairs of harvests sharing the same kg_entity
harvests_list = list(harvest_kg.keys())
links_found = 0
links_created = 0
for i in range(len(harvests_list)):
    for j in range(i+1, len(harvests_list)):
        h1, h2 = harvests_list[i], harvests_list[j]
        shared_kg = set(harvest_kg[h1].keys()) & set(harvest_kg[h2].keys())
        if not shared_kg:
            continue
        
        xref_key = (h1, h2)
        if xref_key in existing_hh or (h2, h1) in existing_hh:
            continue
        
        links_found += 1
        if args.dry_run:
            if links_found <= 5:
                kg_sample = list(shared_kg)[:3]
                n1 = harvest_names.get(h1, h1[:12])
                n2 = harvest_names.get(h2, h2[:12])
                log.info("  %s ↔ %s (%d shared KG entities: %s...)", n1[:40], n2[:40], len(shared_kg), ", ".join(k[:20] for k in kg_sample))
            continue
        
        n1 = harvest_names.get(h1, h1[:12])
        n2 = harvest_names.get(h2, h2[:12])
        body = {
            "sourceType": "harvest",
            "sourceId": h1,
            "targetType": "harvest",
            "targetId": h2,
            "relType": "informs",
            "metadata": {
                "sharedKGCount": len(shared_kg),
                "harvest1Name": n1,
                "harvest2Name": n2,
                "topKGMatches": [harvest_kg[h1][kg][0] for kg in list(shared_kg)[:5]],
            }
        }
        result = nebula_post("/cross-references", body)
        if not result.get("error"):
            links_created += 1
            existing_hh.add(xref_key)

    if links_created > 0 and links_created % 100 == 0:
        log.info("  Progress: %d harvest→harvest links...", links_created)

log.info("Part 2: %d found, %d created", links_found, links_created)

# ============================================================
# PART 3: Backfill missing block-adjacency harvest_references
# ============================================================
log.info("--- Part 3: Backfill harvest_references (block adjacency) ---")

# Check which harvests have harvest_references
rc6, out6 = psql("SELECT DISTINCT conversation_id FROM nebula.harvest_references;")
refd_harvests = set()
if out6:
    for line in out6.splitlines():
        refd_harvests.add(line.strip())
log.info("Harvests with block refs: %d", len(refd_harvests))

# Get harvests with docklang that lack harvest_references
rc7, out7 = psql("SELECT id, source_filename FROM nebula.harvests WHERE docklang IS NOT NULL;")
missing = []
if out7:
    for line in out7.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2 and parts[0].strip() not in refd_harvests:
            missing.append((parts[0].strip(), parts[1].strip()))
log.info("Harvests missing block refs: %d", len(missing))

if args.dry_run:
    for hid, fname in missing[:10]:
        log.info("  Would backfill: %s", fname[:60])
    if len(missing) > 10:
        log.info("  ... and %d more", len(missing) - 10)
else:
    backfilled = 0
    for hid, fname in missing:
        rc8, docklang_raw = psql(f"SELECT docklang FROM nebula.harvests WHERE id = '{hid}';")
        if not docklang_raw:
            continue
        try:
            dl = json.loads(docklang_raw)
        except:
            continue
        
        units = dl.get("discourse_units", [])
        for unit_idx, unit in enumerate(units):
            blocks = unit.get("blocks", [])
            snapshot_id = unit.get("id", str(uuid.uuid4()))
            for b_idx in range(len(blocks) - 1):
                src_id = blocks[b_idx].get("id")
                tgt_id = blocks[b_idx + 1].get("id")
                if not src_id or not tgt_id:
                    continue
                
                ref_id = str(uuid.uuid4())
                sql = f"""
                INSERT INTO nebula.harvest_references
                    (id, conversation_id, snapshot_id, source_block_id, target_block_id,
                     edge_type, confidence, state, source, reason, evidence_json, created_by, created_at)
                VALUES
                    ('{ref_id}', '{hid}', '{snapshot_id}', '{src_id}', '{tgt_id}',
                     'adjacency', 0.95, 'CONFIRMED', 'BACKFILL',
                     'Block {b_idx} → {b_idx+1} (adjacent within snapshot)',
                     '{{"type": "adjacency", "method": "block_index_adjacency", "source_index": {b_idx}, "target_index": {b_idx+1}}}',
                     'SYSTEM', NOW())
                ON CONFLICT DO NOTHING;
                """
                psql(sql)
        backfilled += 1
        if backfilled % 20 == 0:
            log.info("  Backfilled %d/%d harvests...", backfilled, len(missing))
    log.info("Part 3: %d harvests backfilled", backfilled)

log.info("=" * 60)
log.info("DONE - Part1: %d, Part2: %d, Part3: %d", created_p1, links_created, backfilled if not args.dry_run else len(missing))
