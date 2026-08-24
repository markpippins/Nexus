-- What PEB's admission logic would call. Deliberately fails closed: a
-- registered guard with no expression_id wired up rejects rather than
-- silently passing -- a guard that exists but can't be evaluated is not
-- the same as a guard that passed.
CREATE OR REPLACE FUNCTION resolution.check_transition_guard(p_state_transition_id uuid, p_entity_id uuid)
RETURNS TABLE(admitted boolean, rule_name text, compiled_sql text, reason text) AS $$
DECLARE
    r RECORD;
    v_result   boolean;
    v_sql      text;
BEGIN
    FOR r IN
        SELECT rl.id, rl.name, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'guard' AND rl.state_transition_id = p_state_transition_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, NULL::text,
                'guard has no expression_id wired up -- cannot evaluate, failing closed';
            RETURN;
        END IF;

        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;

        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, v_sql, coalesce(r.notes, 'guard failed');
            RETURN;
        END IF;
    END LOOP;

    RETURN QUERY SELECT true, NULL::text, NULL::text, 'all guards passed (or none registered)';
END;
$$ LANGUAGE plpgsql;

-- The bridge: shows the shape of what PEB's real admission code would do,
-- without touching PEB's actual schema or logic. This is a demonstration
-- of the hand-off, not a replacement for PEB's real implementation.
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
        VALUES (gen_random_uuid(), p_transaction_id, 'GUARD_FAILED', 'hard', p_entity_id,
                jsonb_build_object('rule_name', v_check.rule_name, 'reason', v_check.reason,
                                    'compiled_sql', v_check.compiled_sql),
                'rejected', now());
    END IF;

    RETURN v_admission_result;
END;
$$ LANGUAGE plpgsql;
