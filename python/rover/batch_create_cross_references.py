#!/usr/bin/env python3
"""
Batch Create Cross-References — Stage 2.5

Creates classified_as cross-references linking harvest candidates to their
mapped systems/subsystems in the Nebula hierarchy.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_create_cross_references.py [--dry-run]
"""

import json
import logging
import sys
import time
import urllib.request
import urllib.error

log = logging.getLogger("batch_cross_refs")

NEBULA_API = "http://localhost:3101/api"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def nebula_get(path: str) -> dict | list:
    url = f"{NEBULA_API}{path}"
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())


def nebula_post(path: str, body: dict) -> dict:
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else "(no body)"
        log.warning("  API %s: %s", e.code, body_text[:200])
        return {"error": True, "status": e.code, "body": body_text[:200]}


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Create cross-references")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    log.info("=" * 60)
    log.info("Batch Create Cross-References")
    
    # Step 1: Fetch all candidates with status pending
    log.info("Fetching pending candidates...")
    candidates_data = nebula_get("/harvest-candidates?limit=500&status=pending")
    candidates = candidates_data.get("candidates", [])
    log.info("Found %d pending candidates", len(candidates))
    
    # Step 2: Fetch existing classified_as cross-references to avoid duplicates
    log.info("Fetching existing cross-references...")
    existing = nebula_get("/cross-references?limit=1000")
    existing_pairs = set()
    for r in existing:
        if r.get("rel_type") == "classified_as" and r.get("source_type") == "harvest_candidate":
            existing_pairs.add((r["source_id"], r["target_id"]))
    log.info("Existing classified_as cross-refs: %d", len(existing_pairs))
    
    # Step 3: Fetch hierarchy for metadata context
    systems_data = nebula_get("/systems")
    sys_by_id = {}
    for s in systems_data:
        sys_by_id[s["id"]] = s["name"]
        for sub in s.get("subsystems", []):
            sys_by_id[sub["id"]] = f"{s['name']}/{sub['name']}"
            for f in sub.get("features", []):
                sys_by_id[f["id"]] = f"{s['name']}/{sub['name']}/{f['name']}"
    
    if args.dry_run:
        log.info("DRY RUN — would create cross-references for:")
        for c in candidates:
            sys_id = c.get("system_id")
            sub_id = c.get("subsystem_id")
            feat_id = c.get("feature_id")
            if sys_id and (c["id"], sys_id) not in existing_pairs:
                name = sys_by_id.get(sys_id, sys_id[:12])
                log.info("  %s → %s (system)", c["title"][:50], name)
            if sub_id and (c["id"], sub_id) not in existing_pairs:
                name = sys_by_id.get(sub_id, sub_id[:12])
                log.info("  %s → %s (subsystem)", c["title"][:50], name)
        return 0
    
    # Step 4: Create cross-references
    created = 0
    skipped = 0
    errors = 0
    
    for c in candidates:
        cid = c["id"]
        title = c.get("title", "")[:80]
        harvest_id = c.get("harvest_id", "")
        
        # Create system cross-reference
        sys_id = c.get("system_id")
        if sys_id and (cid, sys_id) not in existing_pairs:
            sys_name = sys_by_id.get(sys_id, sys_id[:12])
            body = {
                "sourceType": "harvest_candidate",
                "sourceId": cid,
                "targetType": "system",
                "targetId": sys_id,
                "relType": "classified_as",
                "metadata": {
                    "candidateTitle": title,
                    "targetName": sys_name,
                    "harvestId": harvest_id,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            }
            result = nebula_post("/cross-references", body)
            if result.get("error"):
                errors += 1
            else:
                created += 1
                existing_pairs.add((cid, sys_id))
        
        # Create subsystem cross-reference
        sub_id = c.get("subsystem_id")
        if sub_id and (cid, sub_id) not in existing_pairs:
            sub_name = sys_by_id.get(sub_id, sub_id[:12])
            body = {
                "sourceType": "harvest_candidate",
                "sourceId": cid,
                "targetType": "subsystem",
                "targetId": sub_id,
                "relType": "classified_as",
                "metadata": {
                    "candidateTitle": title,
                    "targetName": sub_name,
                    "harvestId": harvest_id,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            }
            result = nebula_post("/cross-references", body)
            if result.get("error"):
                errors += 1
            else:
                created += 1
                existing_pairs.add((cid, sub_id))
        
        # Create feature cross-reference
        feat_id = c.get("feature_id")
        if feat_id and (cid, feat_id) not in existing_pairs:
            feat_name = sys_by_id.get(feat_id, feat_id[:12])
            body = {
                "sourceType": "harvest_candidate",
                "sourceId": cid,
                "targetType": "feature",
                "targetId": feat_id,
                "relType": "classified_as",
                "metadata": {
                    "candidateTitle": title,
                    "targetName": feat_name,
                    "harvestId": harvest_id,
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
            }
            result = nebula_post("/cross-references", body)
            if result.get("error"):
                errors += 1
            else:
                created += 1
                existing_pairs.add((cid, feat_id))
        
        if not (sys_id or sub_id or feat_id):
            skipped += 1
    
    log.info("=" * 60)
    log.info(f"RESULTS: {created} created, {skipped} skipped (no hierarchy), {errors} errors")
    log.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
