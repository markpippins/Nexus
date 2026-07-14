#!/usr/bin/env python3
"""
Knowledge Graph Migration — File → PostgreSQL (JSONB + pgvector)

Reads nexus/graph/nexus-knowledge-graph.json and inserts its contents
into the knowledge.graph_entities, knowledge.graph_edges, and knowledge.graph_cross_references tables.

The Knowledge Steward role has exclusive write access to these tables.
All other agents read-only.

Usage:
    python3 migrate_graph.py --file ../../graph/nexus-knowledge-graph.json
    python3 migrate_graph.py --file ../../graph/nexus-knowledge-graph.json --dry-run
    python3 migrate_graph.py --list  # show migration history
"""

import argparse
import hashlib
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("knowledge_steward")

# ── Connection (configurable via env vars) ────────────────────────────
DB_DSN = os.getenv(
    "NEXUS_DB_DSN",
    "postgresql://nexus:nexus@localhost:5432/graph",
)


def connect_db(dsn: str = DB_DSN):
    """Connect to PostgreSQL. Returns None if unavailable (dry-run safe)."""
    try:
        import psycopg2

        conn = psycopg2.connect(dsn)
        conn.autocommit = False
        return conn
    except Exception as e:
        log.warning("Database unavailable: %s — running in dry-run mode", e)
        return None


def compute_checksum(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def extract_description(item: dict) -> str:
    """Best-effort extraction of descriptive text for embedding."""
    for key in ("description", "statement", "rationale", "goal"):
        val = item.get(key)
        if val and isinstance(val, str) and len(val) > 10:
            return val
    # For decisions, combine description + rationale
    desc = item.get("description", "")
    rationale = item.get("rationale", "")
    if desc and rationale:
        return f"{desc} {rationale}"
    return desc or ""


def extract_entity_type(item: dict) -> str:
    """Map the section-specific category/type/severity to a generic type."""
    for key in ("category", "severity", "type", "role"):
        val = item.get(key)
        if val and isinstance(val, str):
            return val
    return ""


def extract_relations(item: dict) -> list[tuple[str, str, str, str | None]]:
    """
    Extract (relation_type, target_section, target_id, target_name) tuples.
    Handles list fields like 'produces', 'consumes', 'governed_by', 'references'.
    """
    relation_fields = {
        "produces": ("actors", "runtime"),
        "consumes": ("actors", "work_product"),
        "governed_by": ("rules", "rule"),
        "references": ("types", "entity"),
        "depends_on": ("types", "entity"),
        "variants": ("types", "variant"),
        "actors": ("actors", "runtime"),  # types reference actors
    }

    relations: list[tuple[str, str, str, str | None]] = []
    for field, (target_section, _) in relation_fields.items():
        values = item.get(field)
        if isinstance(values, list):
            for v in values:
                if isinstance(v, str):
                    relations.append((field, target_section, v, None))
        elif isinstance(values, str):
            relations.append((field, target_section, values, None))

    # Handle source_transcripts → harvest section
    transcripts = item.get("source_transcripts")
    if isinstance(transcripts, list):
        for t in transcripts:
            if isinstance(t, str):
                relations.append(("sourced_from", "harvests", t, None))

    return relations


def parse_cross_references(cross_refs: dict) -> list[dict]:
    """Parse the cross_references section into uniform records.
    
    Handles three formats found in the JSON:
    - Flat string: {"map_name": "target_id"} — most common
    - List of strings: {"map_name": ["id1", "id2"]}
    - List of dicts: {"map_name": [{"from": "x", "to": "y"}]}
    """
    records: list[dict] = []
    for map_name, entries in cross_refs.items():
        if isinstance(entries, str):
            # Flat string cross-ref: "map_name" → "target_id"
            records.append({
                "map_name": map_name,
                "source_section": None,
                "source_id": None,
                "target_section": None,
                "target_id": entries,
            })
        elif isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, str):
                    # Simple string cross-ref: "CIRS-001"
                    records.append({
                        "map_name": map_name,
                        "source_section": None,
                        "source_id": None,
                        "target_section": None,
                        "target_id": entry,
                    })
                elif isinstance(entry, dict):
                    records.append({
                        "map_name": map_name,
                        "source_section": entry.get("from_section") or entry.get("source_section"),
                        "source_id": entry.get("from") or entry.get("source_id"),
                        "target_section": entry.get("to_section") or entry.get("target_section"),
                        "target_id": entry.get("to") or entry.get("target_id"),
                    })
    return records


def migrate(kg_path: str, dry_run: bool = False) -> int:
    """Run the migration. Returns exit code."""
    # ── Read file ────────────────────────────────────────────────
    log.info("Reading %s ...", kg_path)
    with open(kg_path) as f:
        kg = json.load(f)

    file_checksum = hashlib.sha256(
        json.dumps(kg, sort_keys=True).encode()
    ).hexdigest()

    version = kg.get("version", "unknown")
    log.info(
        "Loaded: %s (%s, %d sources)",
        kg.get("title", "unknown"), version, len(kg.get("sources", [])),
    )

    # ── Prepare data ─────────────────────────────────────────────
    # Sections that contain arrays of entity-like items
    ENTITY_SECTIONS = [
        "types", "actors", "epistemic_types", "state_machines",
        "architectural_observations", "decisions", "gaps_and_blockers",
        "work_requests", "plans",
    ]

    entities: list[dict] = []
    edges: list[dict] = []
    cross_refs: list[dict] = []

    for section in ENTITY_SECTIONS:
        items = kg.get(section, [])
        for item in items:
            # Plans use plan_number as their ID
            entity_id = item.get("id", "") or item.get("plan_number", "")
            if not entity_id:
                log.warning("  %s entry missing 'id' or 'plan_number', skipped", section)
                continue

            desc = extract_description(item)
            entities.append({
                "section": section,
                "entity_id": entity_id,
                "name": item.get("name", entity_id),
                "entity_type": extract_entity_type(item),
                "status": item.get("status"),
                "description": desc,
                "properties": item,
                "embedding": None,  # generated separately
                "source_file": os.path.basename(kg_path),
                "checksum": compute_checksum(item),
            })

            # Extract edges from relationship fields
            for rel_type, target_section, target_id, _ in extract_relations(item):
                edges.append({
                    "source_section": section,
                    "source_id": entity_id,
                    "relation_type": rel_type,
                    "target_section": target_section,
                    "target_id": target_id,
                })

    # ── Rules section (nested dict, not array) ───────────────────
    rules = kg.get("rules", {})
    for rule_category, rule_items in rules.items():
        if isinstance(rule_items, dict):
            # rule_families is a dict of dicts
            for family_name, family_data in rule_items.items():
                if isinstance(family_data, dict):
                    family_id = f"{rule_category}.{family_name}"
                    entities.append({
                        "section": "rules",
                        "entity_id": family_id,
                        "name": family_data.get("name", family_name),
                        "entity_type": rule_category,
                        "status": None,
                        "description": family_data.get("description", ""),
                        "properties": family_data,
                        "embedding": None,
                        "source_file": os.path.basename(kg_path),
                        "checksum": compute_checksum(family_data),
                    })
        elif isinstance(rule_items, list):
            for rule_item in rule_items:
                rule_id = rule_item.get("id", "")
                if not rule_id:
                    continue
                entities.append({
                    "section": "rules",
                    "entity_id": f"{rule_category}.{rule_id}",
                    "name": rule_item.get("name", rule_id),
                    "entity_type": rule_category,
                    "status": None,
                    "description": rule_item.get("statement", ""),
                    "properties": rule_item,
                    "embedding": None,
                    "source_file": os.path.basename(kg_path),
                    "checksum": compute_checksum(rule_item),
                })

    # ── Topology sections ────────────────────────────────────────
    topology = kg.get("topology", {})
    for topo_key, topo_value in topology.items():
        if isinstance(topo_value, list):
            for i, entry in enumerate(topo_value):
                entry_id = entry.get("name", f"{topo_key}[{i}]")
                entities.append({
                    "section": "topology",
                    "entity_id": f"{topo_key}.{entry_id}",
                    "name": entry_id,
                    "entity_type": topo_key,
                    "status": None,
                    "description": entry.get("description", ""),
                    "properties": entry,
                    "embedding": None,
                    "source_file": os.path.basename(kg_path),
                    "checksum": compute_checksum(entry),
                })

    # ── Three hard boundaries ───────────────────────────────────
    for boundary in kg.get("three_hard_boundaries", []):
        bid = boundary.get("id", "")
        if bid:
            entities.append({
                "section": "boundaries",
                "entity_id": bid,
                "name": boundary.get("name", bid),
                "entity_type": "boundary",
                "status": None,
                "description": boundary.get("description", ""),
                "properties": boundary,
                "embedding": None,
                "source_file": os.path.basename(kg_path),
                "checksum": compute_checksum(boundary),
            })

    # ── Cross-references ────────────────────────────────────────
    cross_refs = parse_cross_references(kg.get("cross_references", {}))

    # ── Summary ──────────────────────────────────────────────────
    log.info(
        "Prepared: %d entities, %d edges, %d cross-refs",
        len(entities), len(edges), len(cross_refs),
    )

    if dry_run:
        log.info("Dry-run mode — no database changes")
        return 0

    # ── Insert into PostgreSQL ───────────────────────────────────
    conn = connect_db()
    if not conn:
        log.info("No database — data prepared but not inserted")
        return 1

    try:
        cur = conn.cursor()

        # Disable FKs temporarily for clean migration
        cur.execute("SET session_replication_role = 'replica';")

        # Clear existing data for this source file
        cur.execute("DELETE FROM knowledge.graph_cross_references")
        cur.execute("DELETE FROM knowledge.graph_edges")
        cur.execute("DELETE FROM knowledge.graph_entities")

        # Insert entities
        INSERT_ENTITY = """
            INSERT INTO knowledge.graph_entities
                (section, entity_id, name, entity_type, status, description, properties, source_file, checksum)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (section, entity_id) DO UPDATE SET
                name = EXCLUDED.name,
                entity_type = EXCLUDED.entity_type,
                status = EXCLUDED.status,
                description = EXCLUDED.description,
                properties = EXCLUDED.properties,
                source_file = EXCLUDED.source_file,
                checksum = EXCLUDED.checksum,
                updated_at = now()
        """
        for e in entities:
            cur.execute(INSERT_ENTITY, (
                e["section"], e["entity_id"], e["name"],
                e["entity_type"], e["status"], e["description"],
                json.dumps(e["properties"]), e["source_file"], e["checksum"],
            ))

        # Insert edges
        INSERT_EDGE = """
            INSERT INTO knowledge.graph_edges
                (source_section, source_id, relation_type, target_section, target_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """
        for edge in edges:
            cur.execute(INSERT_EDGE, (
                edge["source_section"], edge["source_id"],
                edge["relation_type"],
                edge["target_section"], edge["target_id"],
            ))

        # Insert cross-references
        INSERT_XREF = """
            INSERT INTO knowledge.graph_cross_references
                (map_name, source_section, source_id, target_section, target_id)
            VALUES (%s, %s, %s, %s, %s)
        """
        for xr in cross_refs:
            cur.execute(INSERT_XREF, (
                xr["map_name"],
                xr["source_section"], xr["source_id"],
                xr["target_section"], xr["target_id"],
            ))

        # Record migration
        cur.execute("""
            INSERT INTO knowledge.graph_migrations
                (source_file, file_checksum, entity_count, edge_count, cross_ref_count, version)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            os.path.basename(kg_path), file_checksum,
            len(entities), len(edges), len(cross_refs), version,
        ))

        # Re-enable FKs
        cur.execute("SET session_replication_role = 'origin';")

        conn.commit()
        log.info(
            "Migration complete: %d entities, %d edges, %d cross-refs (version %s)",
            len(entities), len(edges), len(cross_refs), version,
        )
        return 0

    except Exception as e:
        conn.rollback()
        log.error("Migration failed: %s", e)
        return 1
    finally:
        conn.close()


def list_migrations(dsn: str = DB_DSN):
    """Show migration history."""
    conn = connect_db(dsn)
    if not conn:
        log.warning("Cannot list migrations — no database")
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT migrated_at, source_file, version, entity_count, edge_count, cross_ref_count
            FROM knowledge.graph_migrations
            ORDER BY migrated_at DESC
            LIMIT 20
        """)
        rows = cur.fetchall()
        if not rows:
            log.info("No migrations recorded")
            return
        log.info("Migration history:")
        for row in rows:
            log.info("  %s | %s v%s | %d entities %d edges %d xrefs", *row)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Knowledge Graph Migration: File → PostgreSQL"
    )
    parser.add_argument("--file", help="Path to nexus-knowledge-graph.json")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB write")
    parser.add_argument("--list", action="store_true", help="Show migration history")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stderr,
    )

    if args.list:
        list_migrations()
        return

    if not args.file:
        parser.error("--file is required (or use --list)")

    sys.exit(migrate(args.file, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
