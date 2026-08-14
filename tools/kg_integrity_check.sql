-- ═══════════════════════════════════════════════════════════════════════
-- Knowledge Graph Integrity Check — T24 (architect breakdown b6a7d551)
--
-- Read-only regression anchor for the KG edge-integrity reconciliation.
-- Run:  psql -h localhost -U pguser -d nexus -f tools/kg_integrity_check.sql
--
-- Checks:
--   1. Table counts (entities / edges / cross-refs / migrations)
--   2. Dangling edge endpoints (resolution=unresolved, and any NULL-section
--      edges that still carry a target_id)
--   3. Entity description NULL rate (empty descriptions break ILIKE search)
--   4. Duplicate migration versions (the 08-08 double-run bug)
--   5. Duplicate migration checksums (lossless idempotency guard)
--   6. Entities missing asset_id (V083 backfill completeness)
--
-- Exit-code discipline: none of these write; fix actions are printed as SQL
-- comments so they stay a review aid, not a destructive script.
-- ═══════════════════════════════════════════════════════════════════════

\pset footer off

-- ── 1. Counts ───────────────────────────────────────────────────────────
SELECT 'graph_entities'   AS "table", count(*) AS rows FROM knowledge.graph_entities
UNION ALL SELECT 'graph_edges', count(*) FROM knowledge.graph_edges
UNION ALL SELECT 'graph_cross_references', count(*) FROM knowledge.graph_cross_references
UNION ALL SELECT 'graph_migrations', count(*) FROM knowledge.graph_migrations;

-- ── 2. Dangling / unresolved edges ──────────────────────────────────────
-- Unresolved edges are preserved with the dangling side's section = NULL
-- (FK-skipped) and resolution = 'unresolved'. Count them by reason.
SELECT
    COALESCE(resolution, '(legacy: no provenance)') AS resolution,
    count(*) AS edges
FROM knowledge.graph_edges
GROUP BY resolution
ORDER BY edges DESC;

-- Legacy rows (pre-provenance) whose target/source endpoint no longer exists:
SELECT
    e.id,
    e.source_section, e.source_id,
    e.relation_type,
    e.target_section, e.target_id
FROM knowledge.graph_edges e
WHERE e.resolution IS NULL
  AND (
        NOT EXISTS (SELECT 1 FROM knowledge.graph_entities ge
                    WHERE ge.section = e.target_section AND ge.entity_id = e.target_id)
     OR NOT EXISTS (SELECT 1 FROM knowledge.graph_entities ge
                    WHERE ge.section = e.source_section AND ge.entity_id = e.source_id)
      );

-- ── 3. Description NULL rate ────────────────────────────────────────────
SELECT
    (count(*) FILTER (WHERE description IS NULL OR description = '')) AS empty_description,
    count(*) AS total,
    round(100.0 * (count(*) FILTER (WHERE description IS NULL OR description = '')) / NULLIF(count(*),0), 2) AS pct_empty
FROM knowledge.graph_entities;

-- ── 4. Duplicate migration versions ─────────────────────────────────────
SELECT version, count(*) AS runs
FROM knowledge.graph_migrations
GROUP BY version
HAVING count(*) > 1
ORDER BY runs DESC;

-- ── 5. Duplicate migration checksums (same file re-ingested) ────────────
SELECT file_checksum, count(*) AS runs, min(migrated_at) AS first, max(migrated_at) AS last
FROM knowledge.graph_migrations
GROUP BY file_checksum
HAVING count(*) > 1
ORDER BY runs DESC;

-- ── 6. Entities missing asset_id (V083 backfill completeness) ───────────
SELECT count(*) AS missing_asset_id
FROM knowledge.graph_entities
WHERE asset_id IS NULL;
