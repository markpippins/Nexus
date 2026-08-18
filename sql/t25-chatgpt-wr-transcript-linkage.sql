-- =============================================================================
-- AC6 — Work Request → transcript linkage query (plan 1308)
--
-- Operational in the knowledge graph: traces a knowledge-graph work_request
-- entity down to the source transcript(s) it implements.
--
-- Chain (all joins verified live 2026-08-18):
--   knowledge.graph_entities (section='work_requests')
--     └─ knowledge.graph_edges implements/derived_from → plans (entity_id = plan #)
--          └─ nebula.cross_references (source_type='requirement',
--             rel_type IN ('compiles_to','req:spawns_plan'), target_id = plan #)
--               └─ nebula.requirements (id = source_id) → candidate_id
--                    └─ nebula.harvest_candidates → harvest_id
--                         └─ nebula.harvests → source_path (the transcript)
--
-- Run:  psql ... -f t25-chatgpt-wr-transcript-linkage.sql
-- =============================================================================

WITH wr_plans AS (
    -- KG work_requests → KG plans (a WR implements/derives from a plan)
    SELECT wr.entity_id   AS wr_entity_id,
           wr.name        AS wr_name,
           e.relation_type,
           p.entity_id    AS plan_number
    FROM knowledge.graph_entities wr
    JOIN knowledge.graph_edges e
      ON e.source_section = 'work_requests' AND e.source_id = wr.entity_id
    JOIN knowledge.graph_entities p
      ON p.section = 'plans' AND p.entity_id = e.target_id
    WHERE wr.section = 'work_requests'
      AND e.target_section = 'plans'
),
plan_requirements AS (
    -- plan # → requirement (cross-references)
    SELECT cr.target_id AS plan_number,
           cr.source_id AS requirement_id
    FROM nebula.cross_references cr
    WHERE cr.source_type = 'requirement'
      AND cr.rel_type IN ('compiles_to', 'req:spawns_plan')
)
SELECT wp.wr_entity_id,
       wp.wr_name,
       wp.plan_number,
       wp.relation_type,
       r.id          AS requirement_id,
       hc.id         AS candidate_id,
       h.id          AS harvest_id,
       h.source_path AS transcript_path
FROM wr_plans wp
LEFT JOIN plan_requirements pr ON pr.plan_number = wp.plan_number
LEFT JOIN nebula.requirements r ON r.id = pr.requirement_id::uuid
LEFT JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
ORDER BY wp.wr_entity_id, wp.plan_number
LIMIT 50;

-- ── Summary (honest coverage: each stage of the chain, then the full join) ──
SELECT 'kg_work_requests'                       AS entity, count(DISTINCT entity_id)::text FROM knowledge.graph_entities WHERE section='work_requests'
UNION ALL SELECT 'kg_plans_linked_to_wr',        count(*)::text FROM knowledge.graph_edges WHERE source_section='work_requests' AND target_section='plans'
UNION ALL SELECT 'plans_with_requirements',      count(DISTINCT cr.target_id)::text FROM nebula.cross_references cr WHERE cr.source_type='requirement' AND cr.rel_type IN ('compiles_to','req:spawns_plan')
UNION ALL SELECT 'requirements_with_candidate',  count(*)::text FROM nebula.requirements WHERE candidate_id IS NOT NULL
UNION ALL SELECT 'full_chain_wr_to_transcript', count(*)::text
  FROM knowledge.graph_entities wr
  JOIN knowledge.graph_edges e ON e.source_section='work_requests' AND e.source_id=wr.entity_id AND e.target_section='plans'
  JOIN nebula.cross_references cr ON cr.source_type='requirement' AND cr.rel_type IN ('compiles_to','req:spawns_plan') AND cr.target_id=e.target_id
  JOIN nebula.requirements r ON r.id = cr.source_id::uuid
  JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
  JOIN nebula.harvests h ON h.id = hc.harvest_id
  WHERE wr.section='work_requests';

-- NOTE: as of 2026-08-18 the full chain resolves 0 rows — the 3
-- plan→requirement cross-refs and the 1 requirement→candidate link do not
-- yet intersect. The query is the operational surface; the re-ingest spec
-- (4fb72533) populates candidate/requirement links from the pristine
-- markdown harvests, at which point the same query returns the chain.
-- The requirement→candidate→harvest leg is proven live:
--   SELECT r.title, hc.id, h.source_path FROM nebula.requirements r
--   JOIN nebula.harvest_candidates hc ON hc.id = r.candidate_id
--   JOIN nebula.harvests h ON h.id = hc.harvest_id;  -- 1 row → chats/*.html
