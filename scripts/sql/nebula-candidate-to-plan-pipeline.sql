-- nebula-candidate-to-plan-pipeline.sql
-- Three gaps for harvesting candidates → plan proposals:
--
-- Gap C: Status workflow — validate & track candidate lifecycle
--   status values: pending → linked → useful → promoted | rejected
--
-- Gap A: Surrounding discourse — find the conversation context for a candidate
--   nebula.candidate_surrounding_discourse(candidate_id, context_units)
--
-- Gap B: Candidate → Plan pipeline — collate candidates into a conduit plan
--   nebula.candidates_to_plan(candidate_ids, project_name)
--
-- ============================================================================
-- GAP C: Status Workflow
-- ============================================================================

-- Add a CHECK constraint for valid status transitions
ALTER TABLE nebula.harvest_candidates
  DROP CONSTRAINT IF EXISTS harvest_candidates_status_check;

ALTER TABLE nebula.harvest_candidates
  ADD CONSTRAINT harvest_candidates_status_check
  CHECK (status IS NULL OR status IN ('pending', 'linked', 'useful', 'rejected', 'promoted'));

-- Backfill NULL statuses to 'pending'
UPDATE nebula.harvest_candidates SET status = 'pending' WHERE status IS NULL;

COMMENT ON COLUMN nebula.harvest_candidates.status IS
    'Candidate lifecycle: pending → linked (to system) → useful (reviewed) → promoted (→ plan) | rejected (discarded)';

-- Set candidate status with validation
CREATE OR REPLACE FUNCTION nebula.set_candidate_status(
    p_candidate_id uuid,
    p_new_status text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_status text;
    v_harvest_id uuid;
BEGIN
    -- Get current state
    SELECT status, harvest_id INTO v_current_status, v_harvest_id
    FROM nebula.harvest_candidates
    WHERE id = p_candidate_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Candidate % not found', p_candidate_id;
    END IF;

    -- Validate transitions
    IF v_current_status = 'pending' AND p_new_status NOT IN ('linked', 'useful', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: pending → % (expected linked, useful, or rejected)', p_new_status;
    END IF;
    IF v_current_status = 'linked' AND p_new_status NOT IN ('useful', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: linked → % (expected useful or rejected)', p_new_status;
    END IF;
    IF v_current_status = 'useful' AND p_new_status NOT IN ('promoted', 'rejected') THEN
        RAISE EXCEPTION 'Invalid transition: useful → % (expected promoted or rejected)', p_new_status;
    END IF;
    IF v_current_status IN ('promoted', 'rejected') THEN
        RAISE EXCEPTION 'Candidate already in terminal state: %', v_current_status;
    END IF;

    -- Apply
    UPDATE nebula.harvest_candidates
    SET status = p_new_status, updated_at = now()
    WHERE id = p_candidate_id;

    RETURN format('Candidate %s: %s → %s', p_candidate_id, v_current_status, p_new_status);
END;
$$;

COMMENT ON FUNCTION nebula.set_candidate_status(uuid, text) IS
    'Set candidate status with transition validation.
     Valid: pending → linked|useful|rejected, linked → useful|rejected,
            useful → promoted|rejected. promoted and rejected are terminal.';

-- Batch set status
CREATE OR REPLACE FUNCTION nebula.set_candidate_status_batch(
    p_candidate_ids uuid[],
    p_new_status text
)
RETURNS TABLE(candidate_id uuid, result text)
LANGUAGE plpgsql
AS $$
DECLARE
    v_id uuid;
BEGIN
    FOREACH v_id IN ARRAY p_candidate_ids
    LOOP
        BEGIN
            candidate_id := v_id;
            result := nebula.set_candidate_status(v_id, p_new_status);
            RETURN NEXT;
        EXCEPTION WHEN OTHERS THEN
            candidate_id := v_id;
            result := format('ERROR: %s', SQLERRM);
            RETURN NEXT;
        END;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION nebula.set_candidate_status_batch(uuid[], text) IS
    'Batch version of set_candidate_status. Processes all IDs and returns per-ID results.';

-- ============================================================================
-- GAP A: Surrounding Discourse
-- ============================================================================

CREATE OR REPLACE FUNCTION nebula.candidate_surrounding_discourse(
    p_candidate_id uuid,
    p_context_units integer DEFAULT 2
)
RETURNS TABLE(
    harvest_title      text,
    conversation_id    uuid,
    turn_index         integer,
    heading            text,
    role               text,
    block_index        integer,
    block_type         text,
    content            text,
    items              text[],
    is_match           boolean,
    proximity_group    integer
)
LANGUAGE sql STABLE
AS $$
    WITH candidate AS (
        SELECT hc.harvest_id, hc.title AS candidate_title,
               COALESCE(hc.intent_description, '') AS candidate_intent
        FROM nebula.harvest_candidates hc
        WHERE hc.id = p_candidate_id
    ),
    -- Score every discourse unit for relevance to this candidate
    scored_units AS (
        SELECT
            du.turn_index,
            du.heading,
            du.role,
            du.body,
            -- Simple relevance score: count of candidate title words that appear in the body
            (
                SELECT count(*)
                FROM regexp_split_to_table(lower(c.candidate_title), E'\\s+') AS word
                WHERE lower(du.body) LIKE '%' || word || '%'
            ) AS relevance_score
        FROM candidate c,
             nebula.harvests h,
             LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du_elem,
             LATERAL (SELECT
                        (du_elem #>> '{provenance,turn_index}')::int AS turn_index,
                        du_elem #>> '{heading}' AS heading,
                        du_elem #>> '{provenance,role}' AS role,
                        du_elem #>> '{body}' AS body
             ) du
        WHERE h.id = c.harvest_id
          AND h.docklang IS NOT NULL
    ),
    -- Mark which units are "matches" (relevance > 0)
    matched_units AS (
        SELECT turn_index, heading, role, body,
               (relevance_score > 0) AS is_match
        FROM scored_units
    ),
    -- Group: assign a proximity_group to each contiguous block of matches + context
    -- Each match gets its own group; context units are assigned to the nearest match group
    with_groups AS (
        SELECT turn_index, heading, role, body, is_match,
            CASE
                WHEN is_match THEN turn_index
                ELSE (
                    SELECT min(m.turn_index)
                    FROM matched_units m
                    WHERE m.is_match AND m.turn_index BETWEEN mu.turn_index - p_context_units AND mu.turn_index + p_context_units
                )
            END AS proximity_group
        FROM matched_units mu
    ),
    -- Final: return only units that belong to a proximity group (matched or nearby)
    filtered_units AS (
        SELECT * FROM with_groups
        WHERE proximity_group IS NOT NULL
    )
    -- Now get the actual blocks for context units + matches
    SELECT
        h.docklang #>> '{meta,title}'              AS harvest_title,
        NULLIF(h.docklang #>> '{meta,provenance,conversation_id}', '')::uuid AS conversation_id,
        fu.turn_index,
        fu.heading,
        fu.role,
        (b #>> '{provenance,block_index}')::int    AS block_index,
        b #>> '{type}'                              AS block_type,
        CASE WHEN b ? 'content' THEN b #>> '{content}' ELSE NULL END AS content,
        CASE WHEN b ? 'items' THEN ARRAY(SELECT elem FROM jsonb_array_elements_text(b -> 'items') AS elem) ELSE NULL END AS items,
        fu.is_match,
        fu.proximity_group
    FROM candidate c
    JOIN nebula.harvests h ON h.id = c.harvest_id
    JOIN filtered_units fu ON true
    CROSS JOIN LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du_elem
    CROSS JOIN LATERAL jsonb_array_elements(du_elem -> 'blocks') AS b
    WHERE (du_elem #>> '{provenance,turn_index}')::int = fu.turn_index
    ORDER BY fu.proximity_group, fu.turn_index, (b #>> '{provenance,block_index}')::int;
$$;

COMMENT ON FUNCTION nebula.candidate_surrounding_discourse(uuid, integer) IS
    'Returns the discourse context around a candidate.
     Scans all discourse units in the candidate''s harvest for mentions of
     the candidate title, then returns those units plus p_context_units (default 2)
     of adjacent discourse for context. Each result row is one block.
     p_context_units: how many discourse units before/after each match to include.';

-- ============================================================================
-- GAP B: Candidate → Plan Pipeline
-- ============================================================================

CREATE OR REPLACE FUNCTION nebula.candidates_to_plan(
    p_candidate_ids uuid[],
    p_project       text DEFAULT 'nexus',
    p_goal          text DEFAULT NULL
)
RETURNS TABLE(
    plan_id      integer,
    plan_title   text,
    plan_goal    text,
    candidates_used integer,
    status_results text[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_id        integer;
    v_title          text;
    v_goal           text;
    v_content        text;
    v_files_affected text;
    v_acceptance     text;
    v_candidate_row  record;
    v_discourse_row  record;
    v_candidate_count integer;
    v_system_name    text;
    v_subsystem_name text;
    v_results        text[] := '{}';
    v_status_result  text;
BEGIN
    -- Count candidates
    SELECT count(*) INTO v_candidate_count
    FROM nebula.harvest_candidates
    WHERE id = ANY(p_candidate_ids);

    IF v_candidate_count = 0 THEN
        RAISE EXCEPTION 'No candidates found for the given IDs';
    END IF;

    -- Build title: use first candidate title, or a summary
    SELECT string_agg(DISTINCT c.title, ' + ' ORDER BY c.title) INTO v_title
    FROM nebula.harvest_candidates c
    WHERE c.id = ANY(p_candidate_ids);

    IF length(v_title) > 200 THEN
        v_title := left(v_title, 197) || '...';
    END IF;

    -- Goal: use provided goal, or generate one from candidate intents
    IF p_goal IS NOT NULL THEN
        v_goal := p_goal;
    ELSE
        SELECT string_agg(DISTINCT c.intent_description, E'\n- ') INTO v_goal
        FROM nebula.harvest_candidates c
        WHERE c.id = ANY(p_candidate_ids) AND c.intent_description IS NOT NULL;

        IF v_goal IS NULL OR v_goal = '' THEN
            v_goal := 'Implementation derived from harvest candidates: ' || v_title;
        ELSE
            v_goal := '- ' || v_goal;
        END IF;
    END IF;

    -- Build content from candidate data + discourse context
    WITH candidates_data AS (
        SELECT
            c.id,
            c.title,
            c.intent_description,
            c.implementation_notes,
            c.code_snippets,
            c.open_questions,
            c.tags,
            s.name AS system_name,
            ss.name AS subsystem_name,
            (SELECT string_agg(du.heading, E'\n' ORDER BY du.turn_index)
             FROM nebula.harvests h,
                  LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du_elem,
                  LATERAL (SELECT (du_elem #>> '{provenance,turn_index}')::int AS turn_index, du_elem #>> '{heading}' AS heading) du
             WHERE h.id = c.harvest_id AND h.docklang IS NOT NULL
               AND (SELECT count(*) FROM regexp_split_to_table(lower(c.title), E'\\s+') AS w
                    WHERE lower(du_elem #>> '{body}') LIKE '%' || w || '%') > 0
            ) AS relevant_headings,
            (SELECT string_agg(b #>> '{content}', E'\n---\n' ORDER BY du.turn_index, (b #>> '{provenance,block_index}')::int)
             FROM nebula.harvests h,
                  LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du_elem,
                  LATERAL jsonb_array_elements(du_elem -> 'blocks') AS b
             WHERE h.id = c.harvest_id AND h.docklang IS NOT NULL
               AND (du_elem #>> '{provenance,turn_index}')::int IN (
                    SELECT DISTINCT fu.turn_index
                    FROM LATERAL (VALUES (du_elem #>> '{provenance,turn_index}')::int) AS du_ti(turn_index)
                    CROSS JOIN LATERAL (
                        SELECT du2.turn_index
                        FROM LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du2_elem,
                             LATERAL (SELECT (du2_elem #>> '{provenance,turn_index}')::int AS turn_index) du2
                        WHERE (SELECT count(*) FROM regexp_split_to_table(lower(c.title), E'\\s+') AS w
                               WHERE lower(du2_elem #>> '{body}') LIKE '%' || w || '%') > 0
                    ) AS matched
                    WHERE du_ti.turn_index BETWEEN matched.turn_index - 2 AND matched.turn_index + 2
               )
               AND b #>> '{type}' IN ('paragraph', 'code', 'quote', 'list')
            ) AS discourse_context
        FROM nebula.harvest_candidates c
        LEFT JOIN nebula.systems s ON s.id = c.system_id
        LEFT JOIN nebula.subsystems ss ON ss.id = c.subsystem_id
        WHERE c.id = ANY(p_candidate_ids)
    )
    SELECT
        format(E'# Plan: %s\n\n## Source Candidates\n\n%s\n\n## Intent\n\n%s\n\n## Implementation Notes\n\n%s\n\n## Code Snippets\n\n%s\n\n## Open Questions\n\n%s\n\n## Discourse Context\n\n%s',
            v_title,
            string_agg(format(E'- **%s** (System: %s, Subsystem: %s)\n  Intent: %s',
                COALESCE(cd.title, '?'),
                COALESCE(cd.system_name, '—'),
                COALESCE(cd.subsystem_name, '—'),
                COALESCE(left(cd.intent_description, 500), '—')
            ), E'\n'),
            COALESCE(string_agg(DISTINCT cd.intent_description, E'\n\n'), '—'),
            COALESCE(string_agg(DISTINCT cd.implementation_notes::text, E'\n'), '[]'),
            COALESCE(string_agg(DISTINCT cd.code_snippets::text, E'\n'), '[]'),
            COALESCE(string_agg(DISTINCT cd.open_questions::text, E'\n'), '[]'),
            COALESCE(string_agg(DISTINCT cd.discourse_context, E'\n\n---\n\n'), '—')
        ) INTO v_content
    FROM candidates_data cd;

    -- Build files_affected (from linked systems)
    SELECT json_agg(DISTINCT val)::text INTO v_files_affected
    FROM (
        SELECT COALESCE(s.name, c.title) AS val
        FROM nebula.harvest_candidates c
        LEFT JOIN nebula.systems s ON s.id = c.system_id
        WHERE c.id = ANY(p_candidate_ids)
    ) sub
    WHERE val IS NOT NULL;

    IF v_files_affected IS NULL THEN
        v_files_affected := '[]';
    END IF;

    -- Build acceptance criteria from open questions
    SELECT json_agg(DISTINCT val)::text INTO v_acceptance
    FROM (
        SELECT trim(both '\"' FROM jsonb_array_elements_text(c.open_questions)) AS val
        FROM nebula.harvest_candidates c
        WHERE c.id = ANY(p_candidate_ids) AND jsonb_typeof(c.open_questions) = 'array'
    ) sub
    WHERE val IS NOT NULL AND val != '';

    IF v_acceptance IS NULL OR v_acceptance = '[]' THEN
        v_acceptance := format('["Implement %s successfully"]', v_title);
    END IF;

    -- Insert into conduit.plans
    INSERT INTO conduit.plans (title, project, goal, content, files_affected, acceptance_criteria)
    VALUES (v_title, p_project, v_goal, v_content, v_files_affected, v_acceptance)
    RETURNING id INTO v_plan_id;

    -- Mark candidates as promoted
    FOR v_status_result IN
        SELECT result FROM nebula.set_candidate_status_batch(p_candidate_ids, 'promoted')
    LOOP
        v_results := array_append(v_results, v_status_result);
    END LOOP;

    -- Return
    plan_id := v_plan_id;
    plan_title := v_title;
    plan_goal := v_goal;
    candidates_used := v_candidate_count;
    status_results := v_results;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION nebula.candidates_to_plan(uuid[], text, text) IS
    'Collate harvest candidates into a conduit plan proposal.
     Args:
       p_candidate_ids: array of harvest_candidate UUIDs to collate
       p_project:       project name for the plan (default: nexus)
       p_goal:          optional custom goal; auto-generated from candidate intents if NULL
     Returns: plan_id, plan_title, plan_goal, candidate count, per-candidate status results
     Side effects: marks all candidates as ''promoted''';

-- ============================================================================
-- Quick status check: show candidate status distribution
-- ============================================================================

CREATE OR REPLACE VIEW nebula.candidate_status_summary AS
SELECT
    status,
    count(*)                                                         AS count,
    count(*) FILTER (WHERE system_id IS NOT NULL)                    AS linked_to_system,
    min(created_at)::date                                            AS earliest,
    max(created_at)::date                                            AS latest
FROM nebula.harvest_candidates
GROUP BY status
ORDER BY status;

COMMENT ON VIEW nebula.candidate_status_summary IS
    'Quick overview of candidate status distribution.
     Shows count per status, how many are linked to systems, and date range.';
