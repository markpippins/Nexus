-- Previously only checked guard-type rules keyed to the specific
-- state_transition_id. That's blind to invariant-type rules (like
-- requirement_rollup_validity), which are attached to a concept_id and
-- must hold regardless of which transition got there. Now checks both.
CREATE OR REPLACE FUNCTION resolution.check_transition_guard(p_state_transition_id uuid, p_entity_id uuid)
RETURNS TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text) AS $$
DECLARE
    v_concept_id uuid;
    r RECORD;
    v_result boolean;
    v_sql    text;
BEGIN
    SELECT concept_id INTO v_concept_id
    FROM resolution.concept_state_transition WHERE id = p_state_transition_id;
    IF v_concept_id IS NULL THEN
        RAISE EXCEPTION 'no concept_state_transition for id %', p_state_transition_id;
    END IF;

    -- 1. guard-type rules attached specifically to this transition
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'guard' AND rl.state_transition_id = p_state_transition_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'guard has no expression_id wired up -- cannot evaluate, failing closed';
            RETURN;
        END IF;
        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;
        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'guard failed');
            RETURN;
        END IF;
    END LOOP;

    -- 2. invariant-type rules on the CONCEPT this transition belongs to --
    -- these must hold no matter which transition is being attempted.
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'invariant' AND rl.concept_id = v_concept_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'invariant has no expression_id wired up -- cannot evaluate, failing closed';
            RETURN;
        END IF;
        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;
        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'invariant violated');
            RETURN;
        END IF;
    END LOOP;

    -- still narrow, worth stating plainly: concept_relationship-attached
    -- and representation-attached rules are NOT checked here. Those apply
    -- when a relationship instance or a physical write happens, not when
    -- a single entity transitions state -- a different trigger point this
    -- function doesn't cover yet.
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text,
        'all guards and invariants passed (or none registered)';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.admit_and_record(
    p_transaction_id       uuid,
    p_idempotency_key      text,
    p_entity_id            text,
    p_tool_name            text,
    p_input                jsonb,
    p_state_transition_id  uuid,
    p_check_entity_id      uuid
) RETURNS text AS $$
DECLARE
    v_check           RECORD;
    v_admission_result text;
BEGIN
    SELECT * INTO v_check FROM resolution.check_transition_guard(p_state_transition_id, p_check_entity_id);
    v_admission_result := CASE WHEN v_check.admitted THEN 'ADMITTED' ELSE 'REJECTED' END;

    INSERT INTO peb.transactions (id, idempotency_key, entity_id, admission_result, tool_name, input, created_at)
    VALUES (p_transaction_id, p_idempotency_key, p_entity_id, v_admission_result, p_tool_name, p_input, now());

    IF NOT v_check.admitted THEN
        INSERT INTO peb.violations (id, transaction_id, violation_type, severity, entity_id, context, resolution, created_at)
        VALUES (gen_random_uuid(), p_transaction_id,
                CASE v_check.rule_type WHEN 'invariant' THEN 'INVARIANT_VIOLATED' ELSE 'GUARD_FAILED' END,
                'hard', p_entity_id,
                jsonb_build_object('rule_name', v_check.rule_name, 'rule_type', v_check.rule_type,
                                    'reason', v_check.reason, 'compiled_sql', v_check.compiled_sql),
                'rejected', now());
    END IF;

    RETURN v_admission_result;
END;
$$ LANGUAGE plpgsql;
