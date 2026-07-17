-- Migration 038: Ripple Assessment Function
-- Provides structured blast radius analysis for requirement transitions.
-- Used by the Planner role for lightweight pre-greenlight evaluation.
--
-- Returns a JSONB assessment with:
--   - blast_radius: direct + transitive affected requirements
--   - systems_impact: affected systems/subsystems
--   - dependency_depth: how deep in the DAG
--   - risk_level: LOW/MEDIUM/HIGH/CRITICAL
--   - blocking_questions: inherited and direct open questions
--   - related_work_requests: work requests linked to this requirement
--   - suggested_questions: prompts for the Planner to ask

CREATE OR REPLACE FUNCTION nebula.assess_ripple(p_requirement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_req RECORD;
    v_result jsonb;
    v_children uuid[];
    v_all_descendants uuid[];
    v_depth int := 0;
    v_direct_open int := 0;
    v_inherited_open int := 0;
    v_affected_systems text[];
    v_affected_subsystems text[];
    v_related_wrs int := 0;
    v_risk text := 'LOW';
    v_suggested jsonb := '[]'::jsonb;
BEGIN
    -- Get the target requirement
    SELECT id, title, status, priority, system_id, subsystem_id, feature_id, parent_id
    INTO v_req
    FROM nebula.requirements
    WHERE id = p_requirement_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'Requirement not found',
            'requirement_id', p_requirement_id
        );
    END IF;

    -- Get direct children
    SELECT array_agg(id) INTO v_children
    FROM nebula.requirements
    WHERE parent_id = p_requirement_id;

    -- Recursively get all descendants (for blast radius)
    WITH RECURSIVE descendants AS (
        SELECT id, 1 as depth
        FROM nebula.requirements
        WHERE parent_id = p_requirement_id
        UNION ALL
        SELECT r.id, d.depth + 1
        FROM nebula.requirements r
        JOIN descendants d ON r.parent_id = d.id
        WHERE d.depth < 10  -- safety limit
    )
    SELECT array_agg(id), max(depth)
    INTO v_all_descendants, v_depth
    FROM descendants;

    -- Count open questions (direct + inherited)
    SELECT count(*) INTO v_direct_open
    FROM nebula.open_questions
    WHERE requirement_id = p_requirement_id
    AND status = 'OPEN'
    AND blocking = true;

    -- Inherited: open questions on descendants
    IF v_all_descendants IS NOT NULL THEN
        SELECT count(*) INTO v_inherited_open
        FROM nebula.open_questions
        WHERE requirement_id = ANY(v_all_descendants)
        AND status = 'OPEN'
        AND blocking = true;
    END IF;

    -- Affected systems/subsystems (using nebula temporal tables)
    SELECT array_agg(DISTINCT sys.name), array_agg(DISTINCT sub.name)
    INTO v_affected_systems, v_affected_subsystems
    FROM nebula.requirements r
    LEFT JOIN nebula.systems_history sys ON sys.id = r.system_id 
        AND now() >= sys.recorded_on_dt AND now() < sys.recorded_until_dt
    LEFT JOIN nebula.subsystems_history sub ON sub.id = r.subsystem_id
        AND now() >= sub.recorded_on_dt AND now() < sub.recorded_until_dt
    WHERE r.id = p_requirement_id
       OR (v_all_descendants IS NOT NULL AND r.id = ANY(v_all_descendants));

    -- Related work requests (by plan_id which stores the requirement reference)
    SELECT count(*) INTO v_related_wrs
    FROM nebula.work_requests
    WHERE plan_id IS NOT NULL AND plan_id::text = p_requirement_id::text;

    -- Risk assessment
    IF v_inherited_open > 0 THEN
        v_risk := 'CRITICAL';
    ELSIF v_direct_open > 2 THEN
        v_risk := 'HIGH';
    ELSIF v_direct_open > 0 OR (v_all_descendants IS NOT NULL AND array_length(v_all_descendants, 1) > 5) THEN
        v_risk := 'MEDIUM';
    ELSE
        v_risk := 'LOW';
    END IF;

    -- Build suggested questions
    IF v_direct_open > 0 THEN
        v_suggested := v_suggested || jsonb_build_object(
            'question', 'This requirement has ' || v_direct_open || ' blocking open questions. Resolve before greenlighting.',
            'priority', 'HIGH'
        );
    END IF;

    IF v_inherited_open > 0 THEN
        v_suggested := v_suggested || jsonb_build_object(
            'question', 'Descendant requirements have ' || v_inherited_open || ' blocking questions that propagate up.',
            'priority', 'CRITICAL'
        );
    END IF;

    IF v_depth > 3 THEN
        v_suggested := v_suggested || jsonb_build_object(
            'question', 'Deep dependency chain (' || v_depth || ' levels). Consider decomposing into smaller requirements.',
            'priority', 'MEDIUM'
        );
    END IF;

    IF v_related_wrs > 0 THEN
        v_suggested := v_suggested || jsonb_build_object(
            'question', v_related_wrs || ' work requests already linked. Verify they are complete or cancelled before new implementation.',
            'priority', 'MEDIUM'
        );
    END IF;

    -- Build result
    v_result := jsonb_build_object(
        'requirement_id', p_requirement_id,
        'title', v_req.title,
        'current_status', v_req.status,
        'blast_radius', jsonb_build_object(
            'direct_children', COALESCE(array_length(v_children, 1), 0),
            'total_descendants', COALESCE(array_length(v_all_descendants, 1), 0),
            'max_depth', COALESCE(v_depth, 0)
        ),
        'questions', jsonb_build_object(
            'direct_open', v_direct_open,
            'inherited_open', v_inherited_open,
            'total_blocking', v_direct_open + v_inherited_open
        ),
        'systems_impact', jsonb_build_object(
            'systems', COALESCE(v_affected_systems, ARRAY[]::text[]),
            'subsystems', COALESCE(v_affected_subsystems, ARRAY[]::text[])
        ),
        'related_work_requests', v_related_wrs,
        'risk_level', v_risk,
        'can_greenlight', (v_direct_open = 0 AND v_inherited_open = 0),
        'suggested_questions', v_suggested,
        'assessed_at', now()
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION nebula.assess_ripple(uuid) IS 
    'Ripple assessment for requirement transitions. Returns structured blast radius, risk level, and suggested questions for Planner evaluation.';

-- Also create a function that assesses multiple requirements at once (for batch planning)
CREATE OR REPLACE FUNCTION nebula.assess_ripple_batch(p_requirement_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_results jsonb := '[]'::jsonb;
    v_id uuid;
BEGIN
    FOREACH v_id IN ARRAY p_requirement_ids
    LOOP
        v_results := v_results || jsonb_build_object(
            'assessment', nebula.assess_ripple(v_id)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'assessments', v_results,
        'count', jsonb_array_length(v_results),
        'assessed_at', now()
    );
END;
$$;

COMMENT ON FUNCTION nebula.assess_ripple_batch(uuid[]) IS 
    'Batch ripple assessment for multiple requirements. Used by Planner for priority evaluation.';
