-- ============================================================
-- SQL Function: Execute invoke from SOLScript
-- ============================================================

CREATE OR REPLACE FUNCTION sol_script.sol_execute_script(
    p_script TEXT,
    p_context JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
    v_invoke_match TEXT[];
    v_target_name TEXT;
    v_parameters JSONB;
    v_entity_id UUID;
    v_work_request_id UUID;
BEGIN
    -- Initialize result
    v_result := '{}'::jsonb;
    
    -- Parse script for invoke statements
    FOR v_invoke_match IN 
        SELECT regexp_matches(p_script, 'invoke\s+(\w+)\s*\(([^)]*)\)', 'g')
    LOOP
        v_target_name := v_invoke_match[1];
        v_parameters := sol_script.sol_parse_parameters(v_invoke_match[2]);
        
        -- Get entity_id from context or parameters
        v_entity_id := (p_context->>'entity_id')::UUID;
        IF v_entity_id IS NULL AND v_parameters ? 'entity_id' THEN
            v_entity_id := (v_parameters->>'entity_id')::UUID;
        END IF;
        
        -- Get work_request_id from context
        v_work_request_id := (p_context->>'work_request_id')::UUID;
        
        -- Execute invoke
        BEGIN
            v_result := v_result || jsonb_build_object(
                v_target_name,
                sol_script.sol_invoke(
                    v_target_name,
                    v_parameters,
                    v_work_request_id,
                    v_entity_id
                )
            );
        EXCEPTION WHEN OTHERS THEN
            v_result := v_result || jsonb_build_object(
                v_target_name,
                jsonb_build_object(
                    'status', 'error',
                    'message', SQLERRM
                )
            );
        END;
    END LOOP;
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION sol_script.sol_execute_script(TEXT, JSONB) IS 'Execute a SOLScript with invoke statements';

-- ============================================================
-- Helper: Parse parameters from text
-- ============================================================

CREATE OR REPLACE FUNCTION sol_script.sol_parse_parameters(
    p_params_text TEXT
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
    v_pair TEXT[];
    v_key TEXT;
    v_value TEXT;
BEGIN
    v_result := '{}'::jsonb;
    
    IF p_params_text IS NULL OR p_params_text = '' THEN
        RETURN v_result;
    END IF;
    
    FOR v_pair IN 
        SELECT regexp_split_to_table(p_params_text, '\s*,\s*')
    LOOP
        -- Parse key=value
        IF v_pair LIKE '%=%' THEN
            v_key := split_part(v_pair, '=', 1);
            v_value := split_part(v_pair, '=', 2);
            
            -- Try to parse value as JSON
            BEGIN
                v_result := v_result || jsonb_build_object(
                    v_key, 
                    v_value::jsonb
                );
            EXCEPTION WHEN OTHERS THEN
                -- Value is a string
                v_result := v_result || jsonb_build_object(
                    v_key,
                    to_jsonb(v_value)
                );
            END;
        END IF;
    END LOOP;
    
    RETURN v_result;
END;
$$;

-- ============================================================
-- Usage Example
-- ============================================================

DO $$
DECLARE
    v_script TEXT;
    v_context JSONB;
    v_result JSONB;
BEGIN
    -- Example SOLScript
    v_script := '
        invoke approve_work_request(entity_id: "123e4567-e89b-12d3-a456-426614174000", reviewer: "alice", comments: "Approved")
        invoke dispatch_work_request(entity_id: "123e4567-e89b-12d3-a456-426614174000", assigned_to: "bob")
    ';
    
    v_context := jsonb_build_object(
        'work_request_id', 'wr-123',
        'entity_id', '123e4567-e89b-12d3-a456-426614174000'
    );
    
    v_result := sol_script.sol_execute_script(v_script, v_context);
    RAISE NOTICE 'Script execution result: %', v_result;
END;
$$;