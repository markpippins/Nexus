--
-- SOLScript invoke keyword - Minimal extension
-- Leverages existing state machine registry and shrapnel types
--

-- ============================================================
-- EXTEND EXPRESSION KIND FOR invoke
-- ============================================================

-- Add 'invoke' to expression kind check in resolution schema
-- Note: This extends the existing resolution.expression table

COMMENT ON COLUMN resolution.expression.kind IS 'Extends kinds: literal, attribute_ref, operator, function_call, relationship_ref, proposition_ref, invoke';

-- ============================================================
-- INVOKE TARGETS (Links to State Machine Registry)
-- ============================================================

CREATE TABLE sol_script.invoke_target (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    name VARCHAR(255) NOT NULL,              -- The verb/action name
    registry_id UUID NOT NULL,                -- State machine registry ID
    transition_id UUID,                      -- Optional specific transition
    description TEXT,
    parameter_schema JSONB NOT NULL,          -- From shrapnel types
    return_schema JSONB,                     -- What the invoke returns
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    
    CONSTRAINT sol_invoke_target_pkey PRIMARY KEY (id),
    CONSTRAINT sol_invoke_target_name_unique UNIQUE (name) WHERE (is_active = true),
    CONSTRAINT sol_invoke_target_registry_fkey FOREIGN KEY (registry_id) 
        REFERENCES state_machine.sm_registry(id) ON DELETE CASCADE,
    CONSTRAINT sol_invoke_target_transition_fkey FOREIGN KEY (transition_id) 
        REFERENCES state_machine.sm_transition(id) ON DELETE SET NULL
);

COMMENT ON TABLE sol_script.invoke_target IS 'Actions that can be invoked via SOLScript invoke keyword';

CREATE INDEX idx_sol_invoke_target_name ON sol_script.invoke_target USING btree (name);
CREATE INDEX idx_sol_invoke_target_registry ON sol_script.invoke_target USING btree (registry_id);

-- ============================================================
-- INVOKE LOG (Execution Records)
-- ============================================================

CREATE TABLE sol_script.invoke_log (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    invoke_target_id UUID NOT NULL,
    work_request_id UUID,
    entity_id UUID,
    parameters JSONB NOT NULL,
    result JSONB,
    status VARCHAR(50) NOT NULL,  -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    duration_ms INTEGER,
    
    CONSTRAINT sol_invoke_log_pkey PRIMARY KEY (id),
    CONSTRAINT sol_invoke_log_target_fkey FOREIGN KEY (invoke_target_id) 
        REFERENCES sol_script.invoke_target(id) ON DELETE CASCADE,
    CONSTRAINT sol_invoke_log_work_request_fkey FOREIGN KEY (work_request_id) 
        REFERENCES resolution.work_request(id) ON DELETE SET NULL,
    CONSTRAINT sol_invoke_log_entity_fkey FOREIGN KEY (entity_id) 
        REFERENCES resolution.canonical_asset(id) ON DELETE SET NULL
);

COMMENT ON TABLE sol_script.invoke_log IS 'Log of all invoke executions';

CREATE INDEX idx_sol_invoke_log_target ON sol_script.invoke_log USING btree (invoke_target_id);
CREATE INDEX idx_sol_invoke_log_work_request ON sol_script.invoke_log USING btree (work_request_id);
CREATE INDEX idx_sol_invoke_log_entity ON sol_script.invoke_log USING btree (entity_id);
CREATE INDEX idx_sol_invoke_log_status ON sol_script.invoke_log USING btree (status);
CREATE INDEX idx_sol_invoke_log_started ON sol_script.invoke_log USING btree (started_at DESC);

-- ============================================================
-- INVOKE EXPRESSION - SOL Extension
-- ============================================================

-- We extend the expression table's kind to include 'invoke'
-- This is done via the existing resolution.expression table

-- Example: An invoke expression in SOL
-- expression: {
--   "kind": "invoke",
--   "target": "approve_work_request",
--   "parameters": {
--     "entity_id": "...",
--     "reviewer": "alice"
--   },
--   "return_type": "jsonb"
-- }

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW sol_script.vw_invoke_targets AS
SELECT 
    it.id,
    it.name,
    it.description,
    r.name AS registry_name,
    t.name AS transition_name,
    it.parameter_schema,
    it.return_schema,
    it.is_active,
    COUNT(il.id) AS invocation_count,
    AVG(il.duration_ms) AS avg_duration_ms,
    SUM(CASE WHEN il.status = 'completed' THEN 1 ELSE 0 END) AS success_count,
    SUM(CASE WHEN il.status = 'failed' THEN 1 ELSE 0 END) AS failure_count
FROM sol_script.invoke_target it
LEFT JOIN state_machine.sm_registry r ON r.id = it.registry_id
LEFT JOIN state_machine.sm_transition t ON t.id = it.transition_id
LEFT JOIN sol_script.invoke_log il ON il.invoke_target_id = it.id
WHERE it.is_active = true
GROUP BY it.id, r.name, t.name;

-- ============================================================
-- FUNCTION: sol_invoke
-- ============================================================

CREATE OR REPLACE FUNCTION sol_script.sol_invoke(
    p_target_name TEXT,
    p_parameters JSONB,
    p_work_request_id UUID DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_target sol_script.invoke_target%ROWTYPE;
    v_log_id UUID;
    v_result JSONB;
    v_start_time TIMESTAMP;
    v_duration INTEGER;
    v_error TEXT;
BEGIN
    -- Get invoke target
    SELECT * INTO v_target 
    FROM sol_script.invoke_target 
    WHERE name = p_target_name AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoke target % not found or inactive', p_target_name;
    END IF;
    
    -- Validate parameters against schema
    IF NOT sol_script.sol_validate_parameters(p_parameters, v_target.parameter_schema) THEN
        RAISE EXCEPTION 'Invalid parameters for %: %', p_target_name, p_parameters;
    END IF;
    
    -- Start log
    v_start_time := clock_timestamp();
    v_log_id := gen_random_uuid();
    
    INSERT INTO sol_script.invoke_log (
        id, invoke_target_id, work_request_id, entity_id, 
        parameters, status, started_at
    ) VALUES (
        v_log_id, v_target.id, p_work_request_id, p_entity_id,
        p_parameters, 'running', v_start_time
    );
    
    -- Execute the invoke
    BEGIN
        -- This is where the actual execution happens
        -- For now, simple placeholder
        v_result := jsonb_build_object(
            'status', 'success',
            'target', p_target_name,
            'executed_at', to_char(v_start_time, 'YYYY-MM-DD HH24:MI:SS')
        );
        
        -- If this is a state transition, apply it
        IF v_target.transition_id IS NOT NULL AND p_entity_id IS NOT NULL THEN
            -- Apply the transition
            -- In practice, this would call resolution.transition_entity
            v_result := v_result || jsonb_build_object(
                'transition_applied', true,
                'transition_id', v_target.transition_id
            );
        END IF;
        
        -- Update log
        v_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
        UPDATE sol_script.invoke_log
        SET status = 'completed',
            result = v_result,
            completed_at = clock_timestamp(),
            duration_ms = v_duration
        WHERE id = v_log_id;
        
        RETURN v_result;
        
    EXCEPTION WHEN OTHERS THEN
        -- Log failure
        v_error := SQLERRM;
        v_duration := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
        UPDATE sol_script.invoke_log
        SET status = 'failed',
            error_message = v_error,
            completed_at = clock_timestamp(),
            duration_ms = v_duration
        WHERE id = v_log_id;
        
        RAISE;
    END;
END;
$$;

COMMENT ON FUNCTION sol_script.sol_invoke(TEXT, JSONB, UUID, UUID) IS 'Execute an invoke target with parameters';

-- ============================================================
-- FUNCTION: sol_validate_parameters
-- ============================================================

CREATE OR REPLACE FUNCTION sol_script.sol_validate_parameters(
    p_parameters JSONB,
    p_schema JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_required TEXT[];
    v_param_key TEXT;
    v_param_value JSONB;
BEGIN
    -- Check required parameters
    IF p_schema ? 'required' THEN
        v_required := (SELECT array_agg(value::text) 
                       FROM jsonb_array_elements_text(p_schema->'required'));
        
        FOR v_param_key IN SELECT unnest(v_required)
        LOOP
            IF NOT p_parameters ? v_param_key THEN
                RAISE WARNING 'Required parameter % missing', v_param_key;
                RETURN false;
            END IF;
        END LOOP;
    END IF;
    
    -- Check parameter types (simplified)
    IF p_schema ? 'properties' THEN
        FOR v_param_key IN SELECT jsonb_object_keys(p_schema->'properties')
        LOOP
            IF p_parameters ? v_param_key THEN
                v_param_value := p_parameters->v_param_key;
                -- Type checking would go here
            END IF;
        END LOOP;
    END IF;
    
    RETURN true;
END;
$$;

-- ============================================================
-- SAMPLE DATA
-- ============================================================

DO $$
DECLARE
    v_registry_id UUID;
    v_transition_id UUID;
    v_target_id UUID;
BEGIN
    -- Get or create registry
    SELECT id INTO v_registry_id 
    FROM state_machine.sm_registry 
    WHERE name = 'WorkRequestLifecycle' LIMIT 1;
    
    IF v_registry_id IS NULL THEN
        INSERT INTO state_machine.sm_registry (name, description) 
        VALUES ('WorkRequestLifecycle', 'Work request state machine')
        RETURNING id INTO v_registry_id;
    END IF;
    
    -- Get transition
    SELECT id INTO v_transition_id 
    FROM state_machine.sm_transition 
    WHERE registry_id = v_registry_id AND name = 'Approve' LIMIT 1;
    
    -- Create invoke targets
    INSERT INTO sol_script.invoke_target (name, registry_id, transition_id, description, parameter_schema, return_schema)
    VALUES 
    (
        'approve_work_request',
        v_registry_id,
        v_transition_id,
        'Approve a work request - transitions from DRAFT to APPROVED',
        '{
            "type": "object",
            "properties": {
                "entity_id": {"type": "string", "format": "uuid"},
                "reviewer": {"type": "string"},
                "comments": {"type": "string"}
            },
            "required": ["entity_id"]
        }',
        '{
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "new_state": {"type": "string"},
                "transition_applied": {"type": "boolean"}
            }
        }'
    ),
    (
        'dispatch_work_request',
        v_registry_id,
        NULL,
        'Dispatch a work request for execution',
        '{
            "type": "object",
            "properties": {
                "entity_id": {"type": "string", "format": "uuid"},
                "assigned_to": {"type": "string"}
            },
            "required": ["entity_id", "assigned_to"]
        }',
        '{
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "assigned_to": {"type": "string"}
            }
        }'
    )
    RETURNING id INTO v_target_id;
    
    RAISE NOTICE 'Created invoke targets with IDs: %', v_target_id;
END;
$$;