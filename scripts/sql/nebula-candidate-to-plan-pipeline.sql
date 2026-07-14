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
-- GAP B: Candidate → Agenda Pipeline
-- ============================================================================

-- Drop old plan pipeline function
DROP FUNCTION IF EXISTS nebula.candidates_to_plan(uuid[], text, text);

CREATE OR REPLACE FUNCTION nebula.candidates_to_agenda(
    p_candidate_ids uuid[],
    p_project       text DEFAULT 'nexus',
    p_goal          text DEFAULT NULL
)
RETURNS TABLE(
    agenda_id      uuid,
    agenda_title   text,
    candidates_used integer,
    status_results text[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_agenda_id      uuid;
    v_title          text;
    v_planner_analysis text;
    v_candidate_count integer;
    v_results        text[] := '{}';
    v_status_result  text;
    v_candidate_row  record;
BEGIN
    -- Count candidates
    SELECT count(*) INTO v_candidate_count
    FROM nebula.harvest_candidates
    WHERE id = ANY(p_candidate_ids);

    IF v_candidate_count = 0 THEN
        RAISE EXCEPTION 'No candidates found for the given IDs';
    END IF;

    -- Use user-supplied project as title when explicitly provided (non-null, non-empty)
    IF p_project IS NOT NULL AND p_project <> '' THEN
        v_title := p_project;
    ELSE
        -- Auto-generate title from candidate titles
        SELECT string_agg(DISTINCT c.title, ' + ' ORDER BY c.title) INTO v_title
        FROM nebula.harvest_candidates c
        WHERE c.id = ANY(p_candidate_ids);
    END IF;

    IF length(v_title) > 200 THEN
        v_title := left(v_title, 197) || '...';
    END IF;

    -- Build planner_analysis from candidate intents (full text, no truncation)
    SELECT string_agg(
        format('- **%s**: %s',
            COALESCE(c.title, 'Untitled'),
            COALESCE(c.intent_description, 'No intent description')
        ),
        E'\n'
    ) INTO v_planner_analysis
    FROM nebula.harvest_candidates c
    WHERE c.id = ANY(p_candidate_ids);

    -- Create the agenda
    INSERT INTO nebula.agendas (title, scope, status, source_count, planner_analysis, metadata)
    VALUES (
        v_title,
        'harvest',
        'draft',
        v_candidate_count,
        v_planner_analysis,
        jsonb_build_object(
            'source', 'harvest_pipeline',
            'project', COALESCE(p_project, 'nexus'),
            'goal', p_goal,
            'candidate_ids', p_candidate_ids
        )
    )
    RETURNING id INTO v_agenda_id;

    -- Link each candidate as an agenda item + cross-reference
    FOR v_candidate_row IN
        SELECT c.id, c.title, c.intent_description, c.open_questions
        FROM nebula.harvest_candidates c
        WHERE c.id = ANY(p_candidate_ids)
    LOOP
        INSERT INTO nebula.agenda_items (
            agenda_id, source_type, source_id, title, body,
            open_questions, included
        ) VALUES (
            v_agenda_id,
            'harvest_candidate',
            v_candidate_row.id,
            v_candidate_row.title,
            v_candidate_row.intent_description,
            v_candidate_row.open_questions,
            true
        );

        -- Create cross-reference: harvest_candidate → agenda
        INSERT INTO nebula.cross_references (source_type, source_id, target_type, target_id, rel_type, metadata)
        SELECT 'harvest_candidate', v_candidate_row.id::text, 'agenda', v_agenda_id::text, 'promotes_to', '{}'::jsonb
        WHERE NOT EXISTS (
            SELECT 1 FROM nebula.cross_references
            WHERE source_type = 'harvest_candidate'
              AND source_id = v_candidate_row.id::text
              AND target_type = 'agenda'
              AND target_id = v_agenda_id::text
              AND rel_type = 'promotes_to'
        );
    END LOOP;

    -- Mark candidates as promoted
    FOR v_status_result IN
        SELECT result FROM nebula.set_candidate_status_batch(p_candidate_ids, 'promoted')
    LOOP
        v_results := array_append(v_results, v_status_result);
    END LOOP;

    -- Return
    agenda_id := v_agenda_id;
    agenda_title := v_title;
    candidates_used := v_candidate_count;
    status_results := v_results;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION nebula.candidates_to_agenda(uuid[], text, text) IS
    'Collate harvest candidates into an agenda.
     Args:
       p_candidate_ids: array of harvest_candidate UUIDs to collate
       p_project:       project name (stored in metadata)
       p_goal:          optional custom goal (stored in metadata)
     Returns: agenda_id, agenda_title, candidates_used, per-candidate status results
     Side effects: creates agenda + agenda_items + cross_references, marks candidates as ''promoted''';

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
