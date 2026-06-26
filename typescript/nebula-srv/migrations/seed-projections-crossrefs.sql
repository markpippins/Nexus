-- Seed cross-reference backlink projections
-- Inserts projection rows that render agent_records and harvests with
-- a "### References" section containing outbound and inbound links.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING

INSERT INTO nebula.projections (name, type, description, source_query, template, target_path, metadata)
VALUES
(
    'agent-record-crossrefs',
    'deterministic',
    'Renders agent records with cross-reference backlinks (outbound + inbound)',
    $q$
SELECT
    ar.id::text AS id,
    ar.title::text AS title,
    ar.record_type::text AS record_type,
    ar.role::text AS role,
    ar.content::text AS content,
    ar.created_at::text AS created_at,
    CASE
        WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE source_type = 'agent_record' AND source_id = ar.id::text)
          OR EXISTS (SELECT 1 FROM nebula.cross_references WHERE target_type = 'agent_record' AND target_id = ar.id::text)
        THEN
            '### References' || E'\n\n' ||
            CASE WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE source_type = 'agent_record' AND source_id = ar.id::text) THEN
                '**Outbound Links:**' || E'\n' ||
                (SELECT string_agg('- [' || target_type || ':' || target_id || '](' || target_type || '/' || target_id || ') (' || rel_type || ')', E'\n')
                 FROM nebula.cross_references WHERE source_type = 'agent_record' AND source_id = ar.id::text) || E'\n\n'
            ELSE '' END ||
            CASE WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE target_type = 'agent_record' AND target_id = ar.id::text) THEN
                '**Inbound Links:**' || E'\n' ||
                (SELECT string_agg('- [' || source_type || ':' || source_id || '](' || source_type || '/' || source_id || ') (' || rel_type || ')', E'\n')
                 FROM nebula.cross_references WHERE target_type = 'agent_record' AND target_id = ar.id::text)
            ELSE '' END
        ELSE '### References' || E'\n\nNo references found.'
    END AS references_section
FROM nebula.agent_records ar
ORDER BY ar.created_at DESC;
    $q$,
    $q$# {{title}}

**Type:** {{record_type}}
**Role:** {{role}}
**Created:** {{created_at}}

---

{{content}}

---

{{references_section}}$q$,
    'crossrefs/agent-records/{{id}}.md',
    '{}'::jsonb
),
(
    'harvest-crossrefs',
    'deterministic',
    'Renders harvests with cross-reference backlinks (outbound + inbound)',
    $q$
SELECT
    h.id::text AS id,
    h.source_filename::text AS title,
    h.model::text AS model,
    h.source_path::text AS source_path,
    h.source_text::text AS content,
    h.created_at::text AS created_at,
    CASE
        WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE source_type = 'harvest' AND source_id = h.id::text)
          OR EXISTS (SELECT 1 FROM nebula.cross_references WHERE target_type = 'harvest' AND target_id = h.id::text)
        THEN
            '### References' || E'\n\n' ||
            CASE WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE source_type = 'harvest' AND source_id = h.id::text) THEN
                '**Outbound Links:**' || E'\n' ||
                (SELECT string_agg('- [' || target_type || ':' || target_id || '](' || target_type || '/' || target_id || ') (' || rel_type || ')', E'\n')
                 FROM nebula.cross_references WHERE source_type = 'harvest' AND source_id = h.id::text) || E'\n\n'
            ELSE '' END ||
            CASE WHEN EXISTS (SELECT 1 FROM nebula.cross_references WHERE target_type = 'harvest' AND target_id = h.id::text) THEN
                '**Inbound Links:**' || E'\n' ||
                (SELECT string_agg('- [' || source_type || ':' || source_id || '](' || source_type || '/' || source_id || ') (' || rel_type || ')', E'\n')
                 FROM nebula.cross_references WHERE target_type = 'harvest' AND target_id = h.id::text)
            ELSE '' END
        ELSE '### References' || E'\n\nNo references found.'
    END AS references_section
FROM nebula.harvests h
ORDER BY h.created_at DESC;
    $q$,
    $q$# {{title}}

**Source:** {{source_path}}
**Model:** {{model}}
**Created:** {{created_at}}

---

{{content}}

---

{{references_section}}$q$,
    'crossrefs/harvests/{{id}}.md',
    '{}'::jsonb
)
ON CONFLICT (name) DO NOTHING;
