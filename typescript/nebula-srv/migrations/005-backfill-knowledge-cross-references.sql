-- ═══════════════════════════════════════════════════════════════════════
--  Migration 005 — Backfill Knowledge Graph Cross-References
--
--  Problem:
--    knowledge.graph_cross_references had 12 garbage rows where
--    source_section, source_id, target_section were all NULL and
--    target_id contained raw text descriptions. The Nebula UI Graph
--    view's "X-Refs" overlay depends on this table, so nothing rendered.
--
--  Solution:
--    1. DELETE the 12 garbage rows
--    2. Generate cross-references from entities that share significant
--       keywords in their names across different sections (map_name='name_overlap')
--    3. Generate cross-references from description-based keyword overlap
--       (map_name='description_overlap')
--    4. Import knowledge_entity → sourced_from from nebula.cross_references
--
--  Safe to re-run: uses DELETE + INSERT with existence checks
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. DELETE ALL garbage rows — rows where source_section IS NULL
-- ═══════════════════════════════════════════════════════════════════════

DELETE FROM knowledge.graph_cross_references
WHERE source_section IS NULL OR source_section = '';


-- ═══════════════════════════════════════════════════════════════════════
--  2. Generate cross-references from entity name keyword overlap
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION knowledge._extract_keywords(p_name TEXT)
RETURNS TEXT[] AS $$
DECLARE
    normalized TEXT;
    result TEXT[];
    stop_words TEXT[] := ARRAY[
        'the', 'a', 'an', 'in', 'of', 'to', 'for', 'and', 'or', 'as', 'by',
        'on', 'at', 'is', 'it', 'be', 'with', 'from', 'that', 'this', 'are',
        'was', 'were', 'been', 'not', 'no', 'but', 'has', 'have', 'had',
        'its', 'all', 'each', 'every', 'some', 'any', 'can', 'will', 'may',
        'layer', 'mode', 'type', 'model', 'rule', 'entity', 'value', 'state',
        'system', 'process', 'operator', 'function', 'class', 'interface',
        'component', 'module', 'engine', 'manager', 'adapter', 'provider',
        'worker', 'agent', 'service', 'server', 'client', 'gap'
    ];
    w TEXT;
BEGIN
    normalized := regexp_replace(p_name, '([a-z])([A-Z])', '\1 \2', 'g');
    normalized := regexp_replace(normalized, '[_\\-\\./\\\\]', ' ', 'g');
    normalized := lower(normalized);
    result := ARRAY(
        SELECT DISTINCT t.word
        FROM unnest(string_to_array(normalized, ' ')) AS t(word)
        WHERE length(t.word) >= 3
          AND t.word NOT IN (SELECT unnest(stop_words))
          AND t.word ~ '^[a-z][a-z0-9]*$'
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


WITH entity_keywords AS (
    SELECT
        section,
        entity_id,
        name,
        knowledge._extract_keywords(name) AS keywords
    FROM knowledge.graph_entities
    WHERE name IS NOT NULL AND name != ''
),
keyword_pairs AS (
    SELECT
        e1.section AS source_section,
        e1.entity_id AS source_id,
        e1.name AS source_name,
        e2.section AS target_section,
        e2.entity_id AS target_id,
        e2.name AS target_name,
        array_agg(DISTINCT kw) AS shared_keywords
    FROM entity_keywords e1
    CROSS JOIN LATERAL unnest(e1.keywords) AS kw
    JOIN entity_keywords e2
        ON e2.section != e1.section
        AND kw = ANY(e2.keywords)
        AND (e1.section, e1.entity_id) < (e2.section, e2.entity_id)
    GROUP BY e1.section, e1.entity_id, e1.name, e2.section, e2.entity_id, e2.name
    HAVING count(DISTINCT kw) >= 1
),
name_overlap_inserts AS (
    INSERT INTO knowledge.graph_cross_references
        (map_name, source_section, source_id, target_section, target_id, weight, properties)
    SELECT
        'name_overlap' AS map_name,
        kp.source_section,
        kp.source_id,
        kp.target_section,
        kp.target_id,
        LEAST(array_length(kp.shared_keywords, 1)::real / 3.0, 1.0) AS weight,
        jsonb_build_object(
            'type', 'name_overlap',
            'shared_keywords', kp.shared_keywords,
            'source_name', kp.source_name,
            'target_name', kp.target_name,
            'keyword_count', array_length(kp.shared_keywords, 1)
        )
    FROM keyword_pairs kp
    WHERE NOT EXISTS (
        SELECT 1 FROM knowledge.graph_cross_references x
        WHERE x.source_section = kp.source_section
          AND x.source_id = kp.source_id
          AND x.target_section = kp.target_section
          AND x.target_id = kp.target_id
          AND x.map_name = 'name_overlap'
    )
    RETURNING id
)
SELECT count(*) AS name_overlap_crossrefs_created FROM name_overlap_inserts;


-- ═══════════════════════════════════════════════════════════════════════
--  3. Generate cross-references from description-based keyword overlap
-- ═══════════════════════════════════════════════════════════════════════

WITH entity_desc_keywords AS (
    SELECT
        section,
        entity_id,
        name,
        knowledge._extract_keywords(COALESCE(description, '')) AS keywords
    FROM knowledge.graph_entities
    WHERE description IS NOT NULL AND description != ''
),
desc_pairs AS (
    SELECT
        e1.section AS source_section,
        e1.entity_id AS source_id,
        e1.name AS source_name,
        e2.section AS target_section,
        e2.entity_id AS target_id,
        e2.name AS target_name,
        array_agg(DISTINCT kw) AS shared_keywords
    FROM entity_desc_keywords e1
    CROSS JOIN LATERAL unnest(e1.keywords) AS kw
    JOIN entity_desc_keywords e2
        ON e2.section != e1.section
        AND kw = ANY(e2.keywords)
        AND (e1.section, e1.entity_id) < (e2.section, e2.entity_id)
    GROUP BY e1.section, e1.entity_id, e1.name, e2.section, e2.entity_id, e2.name
    HAVING count(DISTINCT kw) >= 2
),
desc_overlap_inserts AS (
    INSERT INTO knowledge.graph_cross_references
        (map_name, source_section, source_id, target_section, target_id, weight, properties)
    SELECT
        'description_overlap' AS map_name,
        dp.source_section,
        dp.source_id,
        dp.target_section,
        dp.target_id,
        LEAST(array_length(dp.shared_keywords, 1)::real / 5.0, 1.0) AS weight,
        jsonb_build_object(
            'type', 'description_overlap',
            'shared_keywords', dp.shared_keywords,
            'source_name', dp.source_name,
            'target_name', dp.target_name,
            'keyword_count', array_length(dp.shared_keywords, 1)
        )
    FROM desc_pairs dp
    WHERE NOT EXISTS (
        SELECT 1 FROM knowledge.graph_cross_references x
        WHERE x.source_section = dp.source_section
          AND x.source_id = dp.source_id
          AND x.target_section = dp.target_section
          AND x.target_id = dp.target_id
    )
    RETURNING id
)
SELECT count(*) AS desc_overlap_crossrefs_created FROM desc_overlap_inserts;


-- ═══════════════════════════════════════════════════════════════════════
--  4. Import knowledge_entity → sourced_from from nebula.cross_references
-- ═══════════════════════════════════════════════════════════════════════

WITH sourced_from_inserts AS (
    INSERT INTO knowledge.graph_cross_references
        (map_name, source_section, source_id, target_section, target_id, weight, properties)
    SELECT
        'sourced_from' AS map_name,
        'knowledge_entity' AS source_section,
        cr.source_id,
        cr.target_type AS target_section,
        cr.target_id,
        0.8 AS weight,
        COALESCE(cr.metadata, '{}'::jsonb) || jsonb_build_object(
            'type', 'sourced_from',
            'rel_type', cr.rel_type
        ) AS properties
    FROM nebula.cross_references cr
    WHERE cr.source_type = 'knowledge_entity'
      AND cr.rel_type = 'sourced_from'
      AND NOT EXISTS (
        SELECT 1 FROM knowledge.graph_cross_references x
        WHERE x.source_section = 'knowledge_entity'
          AND x.source_id = cr.source_id
          AND x.target_section = cr.target_type
          AND x.target_id = cr.target_id
          AND x.map_name = 'sourced_from'
    )
    RETURNING id
)
SELECT count(*) AS sourced_from_crossrefs_created FROM sourced_from_inserts;


-- ═══════════════════════════════════════════════════════════════════════
--  CLEANUP: drop the helper function
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS knowledge._extract_keywords(TEXT);


-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_total INTEGER;
    v_map_counts RECORD;
    v_sample RECORD;
BEGIN
    SELECT COUNT(*) INTO v_total FROM knowledge.graph_cross_references;
    RAISE NOTICE '=== Migration 005 Complete ===';
    RAISE NOTICE 'Total cross-references: %', v_total;

    RAISE NOTICE '--- Breakdown by map_name ---';
    FOR v_map_counts IN
        SELECT map_name, count(*) AS cnt
        FROM knowledge.graph_cross_references
        GROUP BY map_name
        ORDER BY cnt DESC
    LOOP
        RAISE NOTICE '  %: %', v_map_counts.map_name, v_map_counts.cnt;
    END LOOP;

    RAISE NOTICE '--- Sample cross-references ---';
    FOR v_sample IN
        SELECT source_section, source_id, target_section, target_id, weight
        FROM knowledge.graph_cross_references
        ORDER BY weight DESC
        LIMIT 10
    LOOP
        RAISE NOTICE '  %: %  →  %: %  (weight=%)',
            v_sample.source_section, v_sample.source_id,
            v_sample.target_section, v_sample.target_id,
            v_sample.weight;
    END LOOP;
END $$;

COMMIT;
