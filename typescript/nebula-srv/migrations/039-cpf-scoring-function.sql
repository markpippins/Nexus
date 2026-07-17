-- Migration 039: CPF Scoring Function for Planner
-- Brings CPF computation into PostgreSQL for deterministic backlog grooming.
-- The Planner uses this to evaluate candidates and create open questions for gaps.

CREATE OR REPLACE FUNCTION nebula.assess_cpf(p_candidate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_candidate RECORD;
    v_dep RECORD;
    v_result jsonb;
    v_components jsonb := '{}'::jsonb;
    v_total numeric := 0;
    v_suggested jsonb := '[]'::jsonb;
    v_dep_ids uuid[];
    v_dep_resolved int := 0;
    v_dep_total int := 0;
BEGIN
    -- Get the candidate
    SELECT 
        id, title, intent_description, system_id, subsystem_id, feature_id,
        tags, implementation_notes, code_snippets, completed, status
    INTO v_candidate
    FROM nebula.harvest_candidates
    WHERE id = p_candidate_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'Candidate not found',
            'candidate_id', p_candidate_id
        );
    END IF;

    -- 1. intent_filled (0.20)
    IF v_candidate.intent_description IS NOT NULL 
       AND length(trim(v_candidate.intent_description)) > 0 THEN
        v_components := v_components || jsonb_build_object('intent_filled', 0.20);
        v_total := v_total + 0.20;
    ELSE
        v_components := v_components || jsonb_build_object('intent_filled', 0.0);
        v_suggested := v_suggested || jsonb_build_object(
            'component', 'intent_filled',
            'question', 'What is the goal or intent of "' || v_candidate.title || '"?',
            'category', 'MISSING_INFO',
            'priority', 'HIGH'
        );
    END IF;

    -- 2. hierarchy_mapped (0.20)
    DECLARE
        v_hier_score numeric := 0;
    BEGIN
        IF v_candidate.system_id IS NOT NULL THEN
            v_hier_score := v_hier_score + 0.10;
        ELSE
            v_suggested := v_suggested || jsonb_build_object(
                'component', 'hierarchy_mapped',
                'question', 'Which system does "' || v_candidate.title || '" belong to?',
                'category', 'AMBIGUITY',
                'priority', 'HIGH'
            );
        END IF;
        
        IF v_candidate.subsystem_id IS NOT NULL THEN
            v_hier_score := v_hier_score + 0.07;
        ELSE
            v_suggested := v_suggested || jsonb_build_object(
                'component', 'hierarchy_mapped',
                'question', 'Which subsystem does "' || v_candidate.title || '" belong to?',
                'category', 'AMBIGUITY',
                'priority', 'MEDIUM'
            );
        END IF;
        
        IF v_candidate.feature_id IS NOT NULL THEN
            v_hier_score := v_hier_score + 0.03;
        END IF;
        
        v_components := v_components || jsonb_build_object('hierarchy_mapped', v_hier_score);
        v_total := v_total + v_hier_score;
    END;

    -- 3. tagged (0.10)
    DECLARE
        v_tag_count int := 0;
        v_tag_score numeric := 0;
    BEGIN
        v_tag_count := array_length(v_candidate.tags, 1);
        
        IF v_tag_count >= 2 THEN
            v_tag_score := 0.10;
        ELSIF v_tag_count = 1 THEN
            v_tag_score := 0.03;
            v_suggested := v_suggested || jsonb_build_object(
                'component', 'tagged',
                'question', 'Add one more tag to "' || v_candidate.title || '" for better categorization.',
                'category', 'MISSING_INFO',
                'priority', 'LOW'
            );
        ELSE
            v_suggested := v_suggested || jsonb_build_object(
                'component', 'tagged',
                'question', 'What categories or tags apply to "' || v_candidate.title || '"?',
                'category', 'MISSING_INFO',
                'priority', 'MEDIUM'
            );
        END IF;
        
        v_components := v_components || jsonb_build_object('tagged', v_tag_score);
        v_total := v_total + v_tag_score;
    END;

    -- 4. has_artifacts (0.20)
    DECLARE
        v_art_score numeric := 0;
    BEGIN
        IF v_candidate.implementation_notes IS NOT NULL 
           AND jsonb_array_length(v_candidate.implementation_notes) > 0 THEN
            v_art_score := v_art_score + 0.10;
        ELSE
            v_suggested := v_suggested || jsonb_build_object(
                'component', 'has_artifacts',
                'question', 'Do we have implementation notes for "' || v_candidate.title || '"?',
                'category', 'MISSING_INFO',
                'priority', 'MEDIUM'
            );
        END IF;
        
        IF v_candidate.code_snippets IS NOT NULL 
           AND jsonb_array_length(v_candidate.code_snippets) > 0 THEN
            v_art_score := v_art_score + 0.10;
        END IF;
        
        v_components := v_components || jsonb_build_object('has_artifacts', v_art_score);
        v_total := v_total + v_art_score;
    END;

    -- 5. reconciled (0.10)
    IF v_candidate.completed = true THEN
        v_components := v_components || jsonb_build_object('reconciled', 0.10);
        v_total := v_total + 0.10;
    ELSE
        v_components := v_components || jsonb_build_object('reconciled', 0.0);
        v_suggested := v_suggested || jsonb_build_object(
            'component', 'reconciled',
            'question', 'Is "' || v_candidate.title || '" complete and reconciled across all sources?',
            'category', 'SCOPE',
            'priority', 'MEDIUM'
        );
    END IF;

    -- 6. deps_resolved (0.20)
    SELECT array_agg(depends_on_id) INTO v_dep_ids
    FROM nebula.candidate_dependencies
    WHERE candidate_id = p_candidate_id;

    IF v_dep_ids IS NULL OR array_length(v_dep_ids, 1) = 0 THEN
        -- No dependencies = fully resolved
        v_components := v_components || jsonb_build_object('deps_resolved', 0.20);
        v_total := v_total + 0.20;
    ELSE
        -- Check each dependency
        FOR v_dep IN 
            SELECT hc.id, hc.status, hc.completed
            FROM nebula.harvest_candidates hc
            WHERE hc.id = ANY(v_dep_ids)
        LOOP
            v_dep_total := v_dep_total + 1;
            IF v_dep.status = 'promoted' OR v_dep.completed = true THEN
                v_dep_resolved := v_dep_resolved + 1;
            END IF;
        END LOOP;
        
        DECLARE
            v_dep_score numeric;
        BEGIN
            v_dep_score := (v_dep_resolved::numeric / v_dep_total::numeric) * 0.20;
            v_components := v_components || jsonb_build_object('deps_resolved', round(v_dep_score, 3));
            v_total := v_total + v_dep_score;
            
            IF v_dep_resolved < v_dep_total THEN
                v_suggested := v_suggested || jsonb_build_object(
                    'component', 'deps_resolved',
                    'question', (v_dep_total - v_dep_resolved) || ' of ' || v_dep_total || ' dependencies unresolved for "' || v_candidate.title || '".',
                    'category', 'DEPENDENCY',
                    'priority', 'HIGH'
                );
            END IF;
        END;
    END IF;

    -- Build result
    v_result := jsonb_build_object(
        'candidate_id', p_candidate_id,
        'title', v_candidate.title,
        'status', v_candidate.status,
        'score', round(v_total, 3),
        'promotable', (v_total >= 0.7),
        'components', v_components,
        'suggested_questions', v_suggested,
        'question_count', jsonb_array_length(v_suggested),
        'assessed_at', now()
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION nebula.assess_cpf(uuid) IS 
    'CPF scoring for harvest candidates. Returns score (0.0-1.0), component breakdown, and suggested open questions for gaps. Used by Planner for deterministic backlog grooming.';

-- Batch assessment for multiple candidates
CREATE OR REPLACE FUNCTION nebula.assess_cpf_batch(p_candidate_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_results jsonb := '[]'::jsonb;
    v_id uuid;
    v_ready int := 0;
    v_not_ready int := 0;
BEGIN
    FOREACH v_id IN ARRAY p_candidate_ids
    LOOP
        v_results := v_results || nebula.assess_cpf(v_id);
    END LOOP;

    -- Count ready vs not ready
    SELECT count(*) INTO v_ready
    FROM jsonb_array_elements(v_results) AS elem
    WHERE (elem->>'promotable')::boolean = true;
    
    v_not_ready := jsonb_array_length(v_results) - v_ready;

    RETURN jsonb_build_object(
        'assessments', v_results,
        'count', jsonb_array_length(v_results),
        'ready', v_ready,
        'not_ready', v_not_ready,
        'assessed_at', now()
    );
END;
$$;

COMMENT ON FUNCTION nebula.assess_cpf_batch(uuid[]) IS 
    'Batch CPF scoring for multiple candidates. Returns assessments with ready/not-ready counts.';

-- Function to generate open questions from CPF gaps
CREATE OR REPLACE FUNCTION nebula.create_questions_from_cpf(p_candidate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_assessment jsonb;
    v_question jsonb;
    v_created int := 0;
BEGIN
    -- Get CPF assessment
    v_assessment := nebula.assess_cpf(p_candidate_id);
    
    -- Check if there are suggested questions
    IF v_assessment->'suggested_questions' IS NULL 
       OR jsonb_array_length(v_assessment->'suggested_questions') = 0 THEN
        RETURN jsonb_build_object(
            'message', 'No gaps identified - candidate is ready',
            'candidate_id', p_candidate_id,
            'score', v_assessment->>'score',
            'created', 0
        );
    END IF;
    
    -- Create open questions for each gap
    FOR v_question IN 
        SELECT * FROM jsonb_array_elements(v_assessment->'suggested_questions')
    LOOP
        INSERT INTO nebula.open_questions (
            requirement_id,  -- We'll link to the candidate's requirement if it exists
            title,
            description,
            category,
            status,
            blocking,
            created_by
        ) VALUES (
            NULL,  -- Candidate may not have a requirement yet
            v_question->>'question',
            'Auto-generated from CPF assessment. Component: ' || (v_question->>'component') || 
            '. Current score: ' || (v_assessment->'components'->>(v_question->>'component')),
            v_question->>'category',
            'OPEN',
            true,
            'planner'
        );
        
        v_created := v_created + 1;
    END LOOP;
    
    RETURN jsonb_build_object(
        'candidate_id', p_candidate_id,
        'title', v_assessment->>'title',
        'score', v_assessment->>'score',
        'questions_created', v_created,
        'created_at', now()
    );
END;
$$;

COMMENT ON FUNCTION nebula.create_questions_from_cpf(uuid) IS 
    'Auto-generate open questions from CPF assessment gaps. Used by Planner for automated backlog grooming.';
