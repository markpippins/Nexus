#!/usr/bin/env python3
"""
Source Provenance Bridge: Knowledge Entities ⟷ Harvest Sources

Links knowledge graph entities to the harvests that informed them using:
1. Existing knowledge.graph_edges with relation_type='sourced_from'
2. Top-level sources array from nexus-knowledge-graph.json
3. Fuzzy filename matching between source references and nebula.harvests_history

Creates bidirectional cross-references in nebula.cross_references:
  - knowledge_entity → harvest (relType: sourced_from)
  - harvest → knowledge_entity (relType: informs)

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 provenance_linker.py
    python3 provenance_linker.py --dry-run
"""

import argparse
import json
import logging
import re
import subprocess
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("provenance")

# ── Config ─────────────────────────────────────────────────────
NEBULA_API = "http://localhost:3101"
KG_JSON_PATH = "/home/codex/dev/nexus/graph/nexus-knowledge-graph.json"
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
    "-t", "-A", "-q",
]


def sql_query(sql: str) -> str:
    """Run a query and return stdout."""
    result = subprocess.run(
        DOCKER_PSQL + ["-c", sql],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        log.error("Query failed: %s", result.stderr[:200])
        return ""
    return result.stdout


def normalize_filename(name: str) -> str:
    """Normalize a filename for fuzzy matching."""
    if not name:
        return ""
    # Strip paths, extensions, and normalize
    name = name.split("/")[-1]  # basename
    name = re.sub(r'\.(html|md|txt)$', '', name, flags=re.IGNORECASE)
    name = name.replace('_', ' ').replace('-', ' ')
    name = re.sub(r'nexus\s+', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s+', ' ', name).strip().lower()
    return name


def fetch_sourced_from_edges():
    """Fetch all sourced_from edges from knowledge.graph_edges."""
    sql = """
    SELECT e.source_section, e.source_id, e.target_id AS source_doc,
           ent.name AS entity_name
    FROM knowledge.graph_edges e
    JOIN knowledge.graph_entities ent
        ON ent.section = e.source_section AND ent.entity_id = e.source_id
    WHERE e.relation_type = 'sourced_from'
    ORDER BY e.source_section, e.source_id
    """
    stdout = sql_query(sql)
    edges = []
    for line in stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            edges.append({
                "section": parts[0],
                "entity_id": parts[1],
                "source_doc": parts[2],
                "entity_name": parts[3],
            })
    log.info("Fetched %d sourced_from edges", len(edges))
    return edges


def fetch_harvest_index():
    """Fetch all harvest IDs and filenames from nebula.harvests_history."""
    sql = """
    SELECT id, source_filename
    FROM nebula.harvests_history
    WHERE total_candidates > 0
    ORDER BY source_filename
    """
    stdout = sql_query(sql)
    harvests = {}
    for line in stdout.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 2:
            hid = parts[0]
            fname = parts[1]
            harvests[hid] = fname
    log.info("Fetched %d harvests with candidates", len(harvests))
    return harvests


def match_source_to_harvest(source_doc: str, harvests: dict) -> list[str]:
    """Fuzzy-match a source document name to harvest IDs."""
    if not source_doc:
        return []

    source_norm = normalize_filename(source_doc)
    if not source_norm:
        return []

    matched = []
    for hid, fname in harvests.items():
        fname_norm = normalize_filename(fname)
        if not fname_norm:
            continue

        # Exact normalized match
        if source_norm == fname_norm:
            matched.append(hid)
            continue

        # Substring match (either direction)
        if source_norm in fname_norm or fname_norm in source_norm:
            matched.append(hid)

    return matched


def parse_top_level_sources():
    """Parse the top-level sources array from nexus-knowledge-graph.json."""
    try:
        with open(KG_JSON_PATH) as f:
            kg = json.load(f)
    except Exception as e:
        log.warning("Failed to read knowledge graph JSON: %s", e)
        return {}

    sources = kg.get("sources", [])
    log.info("Parsed %d top-level sources from knowledge graph JSON", len(sources))

    # Build a source_name → list of filenames map
    source_map = {}
    for s in sources:
        if isinstance(s, str):
            source_map[s] = s
        elif isinstance(s, dict):
            name = s.get("name", s.get("file", str(s)))
            source_map[name] = s.get("file", name)
    return source_map


def create_cross_reference(source_type, source_id, target_type, target_id,
                           rel_type, metadata=None, dry_run=False):
    """Create a cross-reference via the nebula REST API."""
    if dry_run:
        return True

    import subprocess as sp

    payload = {
        "sourceType": source_type,
        "sourceId": source_id,
        "targetType": target_type,
        "targetId": target_id,
        "relType": rel_type,
        "metadata": metadata or {},
    }

    try:
        r = sp.run(
            ["curl", "-s", "-w", "\n%{http_code}", "-X", "POST",
             f"{NEBULA_API}/api/cross-references",
             "-H", "Content-Type: application/json",
             "-d", json.dumps(payload)],
            capture_output=True, text=True, timeout=15,
        )
        output = r.stdout
        return "201" in output or "200" in output
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Provenance bridge: knowledge entities → harvest sources")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without creating cross-references")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Source Provenance Bridge: Knowledge Entities ⟷ Harvest Sources")
    log.info("=" * 60)

    # Step 1: Fetch data
    edges = fetch_sourced_from_edges()
    harvests = fetch_harvest_index()
    top_sources = parse_top_level_sources()

    # Step 2: Match sourced_from edges to harvests
    log.info("Matching sourced_from edges to harvests...")
    entity_to_harvests = {}  # (section, entity_id) → [harvest_ids]
    matched_edges = 0

    for edge in edges:
        key = (edge["section"], edge["entity_id"])
        matched_hids = match_source_to_harvest(edge["source_doc"], harvests)
        if matched_hids:
            if key not in entity_to_harvests:
                entity_to_harvests[key] = []
            entity_to_harvests[key].extend(matched_hids)
            matched_edges += 1

    log.info("Matched %d/%d sourced_from edges to harvests", matched_edges, len(edges))
    log.info("Unique entity→harvest pairs: %d", sum(len(v) for v in entity_to_harvests.values()))

    # Step 3: Match top-level sources to harvests
    log.info("Matching top-level sources to harvests...")
    source_to_harvests = {}
    for source_name, source_file in top_sources.items():
        matched_hids = match_source_to_harvest(source_file, harvests)
        if matched_hids:
            source_to_harvests[source_name] = matched_hids

    log.info("Matched %d/%d top-level sources to harvests",
             len(source_to_harvests), len(top_sources))

    # Step 4: Create cross-references
    total_xrefs = 0
    errors = 0

    # 4a: knowledge_entity → harvest (sourced_from)
    for (section, entity_id), hids in entity_to_harvests.items():
        for hid in set(hids):  # deduplicate
            success = create_cross_reference(
                "knowledge_entity", f"{section}:{entity_id}",
                "harvest", hid,
                "sourced_from",
                metadata={"source": "knowledge.graph_edges", "section": section},
                dry_run=args.dry_run,
            )
            if success:
                total_xrefs += 1
            else:
                errors += 1

    # 4b: harvest → knowledge_entity (informs) - reverse direction
    for (section, entity_id), hids in entity_to_harvests.items():
        for hid in set(hids):
            success = create_cross_reference(
                "harvest", hid,
                "knowledge_entity", f"{section}:{entity_id}",
                "informs",
                metadata={"source": "knowledge.graph_edges", "section": section},
                dry_run=args.dry_run,
            )
            if success:
                total_xrefs += 1
            else:
                errors += 1

    # 4c: top-level source → harvest links
    for source_name, hids in source_to_harvests.items():
        for hid in set(hids):
            success = create_cross_reference(
                "knowledge_source", source_name[:200],
                "harvest", hid,
                "sourced_from",
                metadata={"source": "knowledge_graph.top_level"},
                dry_run=args.dry_run,
            )
            if success:
                total_xrefs += 1
            else:
                errors += 1

    log.info("=" * 60)
    log.info("PROVENANCE BRIDGE SUMMARY")
    log.info("=" * 60)
    log.info("Sourced-from edges: %d total, %d matched", len(edges), matched_edges)
    log.info("Top-level sources: %d total, %d matched", len(top_sources), len(source_to_harvests))
    log.info("Unique entities linked: %d", len(entity_to_harvests))
    log.info("Cross-references created: %d (%d errors)", total_xrefs, errors)

    if args.dry_run:
        log.info("DRY RUN — no changes made")
        # Show sample matches
        for (section, eid), hids in list(entity_to_harvests.items())[:5]:
            log.info("  [%s] %s → %d harvest(s)", section, eid, len(hids))

    return 0


if __name__ == "__main__":
    sys.exit(main())
