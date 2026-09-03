#!/usr/bin/env python3
"""
================================================================================
SUPERSEDED / RETIRED (2026-09-02) — File → PostgreSQL graph ingest

This script (and bin/import-knowledge-graph.sh) are RETIRED as the canonical
path for populating the knowledge graph. Effective 2026-09-02 (Option B),
the knowledge graph is written directly via the knowledge-srv REST API
(typescript/knowledge-srv) / knowledge-mcp wrapper — not from a hand-edited
JSON file. nexus/graph/nexus-knowledge-graph.json is frozen as a historical
generation and is no longer pipeline input. The WR/plan evidence it held has
been staged into the Mongo `legacy-audit` database.

This file is retained only for historical reference / recovery review. Do NOT
use it as the canonical ingest path.
================================================================================

Knowledge Graph Migration — File → PostgreSQL (JSONB + pgvector)

Reads nexus/graph/nexus-knowledge-graph.json and upserts its contents into
knowledge.graph_entities, knowledge.graph_edges, and
knowledge.graph_cross_references.

The Knowledge Steward role has exclusive write access to these tables.
All other agents read-only.

T24 hardening (architect breakdown b6a7d551):
  * Lossless idempotent backfill — upsert, never DELETE; skip a run when the
    file_checksum is unchanged (stops the 08-08 duplicate-version bug).
  * Per-edge provenance — source_migration_id, resolution, unresolved_reason.
  * Preserve unresolved edges (target_section NULL → FK-skipped) instead of
    deleting them (issue #33 regression).
  * extract_relations rewritten for the v2.4.1 work_requests/plans structure.
  * No session_replication_role='replica' FK bypass — real FKs guard the write.

Usage:
    python3 migrate_graph.py --file ../../graph/nexus-knowledge-graph.json
    python3 migrate_graph.py --file ../../graph/nexus-knowledge-graph.json --dry-run
    python3 migrate_graph.py --file ../../graph/nexus-knowledge-graph.json --force  # re-run past the checksum skip
    python3 migrate_graph.py --list  # show migration history
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("knowledge_steward")

# ── Connection (configurable via env vars) ────────────────────────────
# Default points at the LIVE nexus database (the old default `.../graph` DB
# did not exist — a silent dry-run trap). Override with NEXUS_DB_DSN.
DB_DSN = os.getenv(
    "NEXUS_DB_DSN",
    "postgresql://pguser:pgpass@localhost:5432/nexus",
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
    for key in ("description", "statement", "rationale", "goal",
                "problem_statement", "desired_outcome"):
        val = item.get(key)
        if val and isinstance(val, str) and len(val) > 10:
            return val
    # For decisions, combine description + rationale
    desc = item.get("description", "")
    rationale = item.get("rationale", "")
    if desc and rationale:
        return f"{desc} {rationale}"
    # For work requests, combine problem statement + desired outcome
    ps = item.get("problem_statement", "")
    do = item.get("desired_outcome", "")
    if ps and do:
        return f"{ps} {do}"
    return ps or desc or ""


def extract_entity_type(item: dict) -> str:
    """Map the section-specific category/type/severity to a generic type."""
    for key in ("category", "severity", "type", "role"):
        val = item.get(key)
        if val and isinstance(val, str):
            return val
    return ""


def _extract_plan_numbers(text: str) -> list[str]:
    """Pull plan-number tokens (4-digit, e.g. 0164 / 1023) out of a dependency
    string. Handles both plain numbers and JSON-encoded lists like
    `"[\"0164\"]"`; free-text notes yield no tokens and are ignored."""
    nums = re.findall(r"\b\d{4}\b", text)
    seen: set[str] = set()
    out: list[str] = []
    for n in nums:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


def extract_relations(section: str, item: dict) -> list[tuple[str, str, str]]:
    """Extract (relation_type, target_section, target_id) triples.

    v2.4.1 structure (work_requests / plans):
      work_requests: 'plan'        → implements   plans
                     'derived_from'→ derived_from plans
      plans:         'dependencies'→ depends_on   plans (plan-number tokens)
    Legacy v2.4.0 fields (types/actors) are kept for .bak recovery.
    """
    rels: list[tuple[str, str, str]] = []

    if section == "work_requests":
        plan = item.get("plan")
        if plan:
            rels.append(("implements", "plans", str(plan)))
        for p in (item.get("derived_from") or []):
            if isinstance(p, str) and p:
                rels.append(("derived_from", "plans", p))
        return rels

    if section == "plans":
        for dep in (item.get("dependencies") or []):
            if not isinstance(dep, str):
                continue
            dep = dep.strip()
            if not dep or dep == "[]":
                continue
            for tok in _extract_plan_numbers(dep):
                rels.append(("depends_on", "plans", tok))
        return rels

    # ── Legacy sections (types/actors/…) — .bak recovery path ────────
    relation_fields = {
        "produces": ("actors", "runtime"),
        "consumes": ("actors", "work_product"),
        "governed_by": ("rules", "rule"),
        "references": ("types", "entity"),
        "depends_on": ("types", "entity"),
        "variants": ("types", "variant"),
        "actors": ("actors", "runtime"),  # types reference actors
    }
    for field, (target_section, _) in relation_fields.items():
        values = item.get(field)
        if isinstance(values, list):
            for v in values:
                if isinstance(v, str):
                    rels.append((field, target_section, v))
        elif isinstance(values, str):
            rels.append((field, target_section, values))

    transcripts = item.get("source_transcripts")
    if isinstance(transcripts, list):
        for t in transcripts:
            if isinstance(t, str):
                rels.append(("sourced_from", "harvests", t))

    return rels


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


def resolve_edges(raw_edges: list[dict], entity_keys: set[tuple]) -> list[dict]:
    """Dedupe + resolve edge endpoints against the entity key set.

    Resolved edges keep their target section. Unresolved edges are preserved
    losslessly (issue #33 regression): the dangling target_id is retained, the
    target_section is NULLed so the composite FK is skipped (MATCH SIMPLE), and
    resolution='unresolved' + unresolved_reason record why. Never deletes.
    """
    seen: set[tuple] = set()
    out: list[dict] = []
    for raw in raw_edges:
        key = (
            raw["source_section"], raw["source_id"], raw["relation_type"],
            raw["target_section"], raw["target_id"],
        )
        if key in seen:
            continue
        seen.add(key)
        e = dict(raw)
        if (e["target_section"], e["target_id"]) in entity_keys:
            e["resolution"] = "resolved"
        else:
            e["resolution"] = "unresolved"
            e["unresolved_reason"] = "target_not_found"
            e["target_section"] = None  # FK-skip escape hatch
        out.append(e)
    return out


def migrate(kg_path: str, dry_run: bool = False, force: bool = False) -> int:
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
    raw_edges: list[dict] = []
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
                "name": item.get("name") or item.get("title") or entity_id,
                "entity_type": extract_entity_type(item),
                "status": item.get("status"),
                "description": desc,
                "properties": item,
                "embedding": None,  # generated separately
                "source_file": os.path.basename(kg_path),
                "checksum": compute_checksum(item),
            })

            for rel_type, target_section, target_id in extract_relations(section, item):
                raw_edges.append({
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

    # ── Resolve edge endpoints (preserve unresolved, never delete) ──
    entity_keys = {(e["section"], e["entity_id"]) for e in entities}
    edges = resolve_edges(raw_edges, entity_keys)

    # ── Cross-references ────────────────────────────────────────
    cross_refs = parse_cross_references(kg.get("cross_references", {}))

    resolved = sum(1 for e in edges if e["resolution"] == "resolved")
    unresolved = len(edges) - resolved

    # ── Summary ──────────────────────────────────────────────────
    log.info(
        "Prepared: %d entities, %d edges (%d resolved, %d unresolved), %d cross-refs",
        len(entities), len(edges), resolved, unresolved, len(cross_refs),
    )

    if dry_run:
        log.info("Dry-run mode — no database changes")
        return 0

    # ── Upsert into PostgreSQL (lossless: never DELETE) ──────────
    conn = connect_db()
    if not conn:
        log.info("No database — data prepared but not inserted")
        return 1

    try:
        cur = conn.cursor()

        # Idempotency: skip a re-run of the exact same file (stops the
        # duplicate-version 08-08 bug). `--force` bypasses this so a recovery
        # backfill (e.g. edges zeroed by the 08-08 rebuild) can re-run.
        if not force:
            cur.execute(
                "SELECT id FROM knowledge.graph_migrations "
                "WHERE file_checksum = %s ORDER BY migrated_at DESC LIMIT 1",
                (file_checksum,),
            )
            if cur.fetchone():
                log.info(
                    "File checksum unchanged since last migration — skipping "
                    "(idempotent); use --force to re-run"
                )
                conn.rollback()
                return 0

        # Record the migration first (rolled back if the data insert fails).
        cur.execute(
            """INSERT INTO knowledge.graph_migrations
                   (source_file, file_checksum, entity_count, edge_count, cross_ref_count, version)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING id""",
            (os.path.basename(kg_path), file_checksum,
             len(entities), len(edges), len(cross_refs), version),
        )
        migration_id = cur.fetchone()[0]

        # Upsert entities (no FK bypass)
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

        # Insert edges with provenance
        INSERT_EDGE = """
            INSERT INTO knowledge.graph_edges
                (source_section, source_id, relation_type, target_section, target_id,
                 source_migration_id, resolution, unresolved_reason)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_section, source_id, relation_type, target_section, target_id)
            DO NOTHING
        """
        for edge in edges:
            cur.execute(INSERT_EDGE, (
                edge["source_section"], edge["source_id"],
                edge["relation_type"],
                edge["target_section"], edge["target_id"],
                migration_id, edge["resolution"], edge.get("unresolved_reason"),
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

        conn.commit()
        log.info(
            "Migration complete: %d entities, %d edges (%d resolved, %d unresolved), "
            "%d cross-refs (version %s, migration %s)",
            len(entities), len(edges), resolved, unresolved,
            len(cross_refs), version, migration_id,
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
    parser.add_argument("--force", action="store_true", help="Re-run even if the file checksum is unchanged")
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

    sys.exit(migrate(args.file, dry_run=args.dry_run, force=args.force))


if __name__ == "__main__":
    main()
