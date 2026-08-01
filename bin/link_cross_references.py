#!/usr/bin/env python3
"""
link_cross_references.py — Create cross-references in nebula.cross_references
linking KG↔KG, audit↔audit, and audit↔KG.

Purpose: enable inference that starts with a Nebula question and reaches
into the Knowledge Graph for an answer.

Cross-reference types:
  - KG→KG: rules govern decisions, actors reference types, etc.
  - Audit→Audit: records reference plans, responses reference prompts, etc.
  - Audit→KG: architecture notes reference KG decisions, assessments map to KG gaps, etc.

Usage:
    python link_cross_references.py [--dry-run] [--verbose]
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

DB_CONFIG = {
    "host": os.getenv("PGHOST", "localhost"),
    "port": int(os.getenv("PGPORT", 5432)),
    "database": os.getenv("PGDATABASE", "nexus"),
    "user": os.getenv("PGUSER", "pguser"),
    "password": os.getenv("PGPASSWORD", "pgpass"),
}


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


# ─── KG → KG ────────────────────────────────────────────────────────────────

def link_kg_rules_to_decisions(cur):
    """Rules that govern decisions — via existing governed_by edges."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT
            'knowledge_entity' AS source_type,
            e.source_section || '/' || e.source_id AS source_id,
            'knowledge_entity' AS target_type,
            e.target_section || '/' || e.target_id AS target_id,
            'kg:governs' AS rel_type,
            jsonb_build_object(
                'relation_type', e.relation_type,
                'source_name', src.name,
                'target_name', tgt.name,
                'source_section', e.source_section,
                'target_section', e.target_section
            ) AS metadata
        FROM knowledge.graph_edges e
        LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
        LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
        WHERE e.relation_type = 'governed_by'
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_kg_references(cur):
    """KG entities that reference other KG entities."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT
            'knowledge_entity' AS source_type,
            e.source_section || '/' || e.source_id AS source_id,
            'knowledge_entity' AS target_type,
            e.target_section || '/' || e.target_id AS target_id,
            'kg:references' AS rel_type,
            jsonb_build_object(
                'relation_type', e.relation_type,
                'source_name', src.name,
                'target_name', tgt.name,
                'source_section', e.source_section,
                'target_section', e.target_section
            ) AS metadata
        FROM knowledge.graph_edges e
        LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
        LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
        WHERE e.relation_type = 'references'
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_kg_produces_consumes(cur):
    """KG entities that produce or consume other KG entities."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT
            'knowledge_entity' AS source_type,
            e.source_section || '/' || e.source_id AS source_id,
            'knowledge_entity' AS target_type,
            e.target_section || '/' || e.target_id AS target_id,
            'kg:' || e.relation_type AS rel_type,
            jsonb_build_object(
                'relation_type', e.relation_type,
                'source_name', src.name,
                'target_name', tgt.name,
                'source_section', e.source_section,
                'target_section', e.target_section
            ) AS metadata
        FROM knowledge.graph_edges e
        LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
        LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
        WHERE e.relation_type IN ('produces', 'consumes', 'actors', 'variants')
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


# ─── Audit → Audit ───────────────────────────────────────────────────────────

def link_records_to_plans(cur):
    """Agent records that reference implementation plans."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT
            'agent_record' AS source_type,
            ar.id::text AS source_id,
            'plan' AS target_type,
            ar.plan_ref AS target_id,
            'audit:references_plan' AS rel_type,
            jsonb_build_object(
                'record_type', ar.record_type,
                'role', ar.role,
                'title', ar.title
            ) AS metadata
        FROM nebula.agent_records ar
        WHERE ar.plan_ref IS NOT NULL
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_responses_to_prompts(cur):
    """Response records linked to their originating prompt records via title substring matching."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT DISTINCT
            'agent_record' AS source_type,
            resp.id::text AS source_id,
            'agent_record' AS target_type,
            prompt.id::text AS target_id,
            'audit:response_to' AS rel_type,
            jsonb_build_object(
                'prompt_title', prompt.title,
                'response_title', resp.title,
                'prompt_role', prompt.role,
                'response_role', resp.role
            ) AS metadata
        FROM nebula.agent_records resp
        JOIN nebula.agent_records prompt
            ON prompt.record_type = 'prompt'
            AND resp.id != prompt.id
            AND (
                resp.title ILIKE '%' || prompt.title || '%'
                OR prompt.title ILIKE '%' || resp.title || '%'
                OR resp.title ILIKE '%' || substring(prompt.title from 1 for 30) || '%'
            )
        WHERE resp.record_type = 'response'
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_records_by_role_same_day(cur):
    """Records that reference the same plan — architecturally related via shared plan_ref."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT
            'agent_record' AS source_type,
            a.id::text AS source_id,
            'agent_record' AS target_type,
            b.id::text AS target_id,
            'audit:shared_plan' AS rel_type,
            jsonb_build_object(
                'a_type', a.record_type,
                'b_type', b.record_type,
                'a_role', a.role,
                'b_role', b.role,
                'plan_ref', a.plan_ref
            ) AS metadata
        FROM nebula.agent_records a
        JOIN nebula.agent_records b
            ON a.plan_ref = b.plan_ref
            AND a.id < b.id
        WHERE a.plan_ref IS NOT NULL
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


# ─── Audit → KG ──────────────────────────────────────────────────────────────

def link_architecture_notes_to_kg_decisions(cur):
    """Architecture notes that mention KG decision entity names."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT DISTINCT
            'agent_record' AS source_type,
            ar.id::text AS source_id,
            'knowledge_entity' AS target_type,
            ge.section || '/' || ge.entity_id AS target_id,
            'audit:architecturally_relevant' AS rel_type,
            jsonb_build_object(
                'record_type', ar.record_type,
                'title', ar.title,
                'entity_name', ge.name,
                'entity_section', ge.section,
                'match_method', 'title_similarity'
            ) AS metadata
        FROM nebula.agent_records ar
        JOIN knowledge.graph_entities ge
            ON ge.section = 'decisions'
            AND (
                ar.title ILIKE '%' || ge.name || '%'
                OR ge.name ILIKE '%' || ar.title || '%'
                OR similarity(ar.title, ge.name) > 0.3
            )
        WHERE ar.record_type IN ('architecture_note', 'decision')
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_assessments_to_kg_gaps(cur):
    """Assessment records that map to KG gaps_and_blockers."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT DISTINCT
            'agent_record' AS source_type,
            ar.id::text AS source_id,
            'knowledge_entity' AS target_type,
            ge.section || '/' || ge.entity_id AS target_id,
            'audit:addresses_gap' AS rel_type,
            jsonb_build_object(
                'record_type', ar.record_type,
                'title', ar.title,
                'entity_name', ge.name,
                'entity_section', ge.section,
                'match_method', 'title_similarity'
            ) AS metadata
        FROM nebula.agent_records ar
        JOIN knowledge.graph_entities ge
            ON ge.section = 'gaps_and_blockers'
            AND (
                ar.title ILIKE '%' || ge.name || '%'
                OR ge.name ILIKE '%' || ar.title || '%'
                OR similarity(ar.title, ge.name) > 0.3
            )
        WHERE ar.record_type IN ('assessment', 'analysis', 'inspection')
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_harvests_to_kg_entities(cur):
    """Harvests that inform KG entities (bypassing the harvest_candidate middleman)."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT DISTINCT
            'harvest' AS source_type,
            h.id::text AS source_id,
            'knowledge_entity' AS target_type,
            ge.section || '/' || ge.entity_id AS target_id,
            'audit:informs_kg' AS rel_type,
            jsonb_build_object(
                'harvest_source', h.source_path,
                'entity_name', ge.name,
                'entity_section', ge.section
            ) AS metadata
        FROM nebula.harvests h
        JOIN nebula.harvest_candidates hc ON hc.harvest_id = h.id
        JOIN nebula.cross_references xref
            ON xref.source_type = 'harvest_candidate'
            AND xref.source_id = hc.id::text
            AND xref.target_type = 'knowledge_entity'
        JOIN knowledge.graph_entities ge
            ON ge.section || '/' || ge.entity_id = xref.target_id
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


def link_plans_to_kg_plans(cur):
    """Implementation plans that correspond to KG plan entities."""
    cur.execute("""
        INSERT INTO nebula.cross_references_history (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT DISTINCT
            'plan' AS source_type,
            ip.id::text AS source_id,
            'knowledge_entity' AS target_type,
            ge.section || '/' || ge.entity_id AS target_id,
            'audit:plan_in_kg' AS rel_type,
            jsonb_build_object(
                'plan_title', ip.title,
                'entity_name', ge.name,
                'entity_section', ge.section
            ) AS metadata
        FROM nebula.implementation_plans ip
        JOIN knowledge.graph_entities ge
            ON ge.section = 'plans'
            AND (
                ip.title ILIKE '%' || ge.name || '%'
                OR ge.name ILIKE '%' || ip.title || '%'
                OR similarity(ip.title, ge.name) > 0.3
            )
        ON CONFLICT DO NOTHING
    """)
    return cur.rowcount


# ─── Main ────────────────────────────────────────────────────────────────────

LINKERS = [
    # KG → KG
    ("KG: rules govern decisions",           link_kg_rules_to_decisions),
    ("KG: references",                        link_kg_references),
    ("KG: produces/consumes/actors/variants", link_kg_produces_consumes),
    # Audit → Audit
    ("Audit: records reference plans",        link_records_to_plans),
    ("Audit: responses to prompts",           link_responses_to_prompts),
    ("Audit: records sharing same plan",     link_records_by_role_same_day),
    # Audit → KG
    ("Audit→KG: architecture notes ↔ decisions",  link_architecture_notes_to_kg_decisions),
    ("Audit→KG: assessments ↔ gaps",              link_assessments_to_kg_gaps),
    ("Audit→KG: harvests ↔ KG entities",          link_harvests_to_kg_entities),
    ("Audit→KG: plans ↔ KG plans",                link_plans_to_kg_plans),
]


def main():
    parser = argparse.ArgumentParser(description="Create cross-references linking KG and audit")
    parser.add_argument("--dry-run", action="store_true", help="Count what would be inserted without writing")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print each link batch")
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()

    # Check if pg_trgm extension is available (for similarity())
    cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
    has_trgm = cur.fetchone() is not None
    if not has_trgm:
        print("WARNING: pg_trgm extension not available — title similarity matching will use ILIKE only")

    total = 0
    for name, fn in LINKERS:
        try:
            count = fn(cur)
            total += count
            if args.verbose or count > 0:
                print(f"  {name}: {count} cross-references {'(dry run)' if args.dry_run else ''}")
        except Exception as e:
            print(f"  {name}: ERROR — {e}")
            conn.rollback()
            continue

        if not args.dry_run:
            conn.commit()
        else:
            conn.rollback()

    # Final count
    cur.execute("SELECT COUNT(*)::int FROM nebula.cross_references")
    final_count = cur.fetchone()[0]

    print(f"\nTotal new cross-references: {total}")
    print(f"Final nebula.cross_references count: {final_count}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
