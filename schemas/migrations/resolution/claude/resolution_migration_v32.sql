-- Compares supplied context against a proposition's declared frame values.
-- Only dimensions the proposition actually declares are checked -- extra
-- keys in the caller's context are ignored, not treated as mismatches.
CREATE OR REPLACE FUNCTION resolution.check_context_match(p_proposition_id uuid, p_context jsonb)
RETURNS text AS $$
DECLARE
    v_declared_count  integer;
    v_mismatch_name   text;
    v_uncovered_count integer;
BEGIN
    SELECT count(*) INTO v_declared_count
    FROM resolution.proposition_frame_value WHERE proposition_id = p_proposition_id;

    IF v_declared_count = 0 THEN
        RETURN 'not_scoped';
    END IF;

    IF p_context IS NULL THEN
        RETURN 'context_required';
    END IF;

    SELECT fd.name INTO v_mismatch_name
    FROM resolution.proposition_frame_value pfv
    JOIN resolution.frame_dimension fd ON fd.id = pfv.dimension_id
    LEFT JOIN resolution.frame_dimension_value fdv ON fdv.id = pfv.reference_value_id
    WHERE pfv.proposition_id = p_proposition_id
      AND p_context ? fd.name
      AND (p_context ->> fd.name) IS DISTINCT FROM coalesce(fdv.value, pfv.scalar_value)
    LIMIT 1;

    IF v_mismatch_name IS NOT NULL THEN
        RETURN 'context_mismatch';
    END IF;

    SELECT count(*) INTO v_uncovered_count
    FROM resolution.proposition_frame_value pfv
    JOIN resolution.frame_dimension fd ON fd.id = pfv.dimension_id
    WHERE pfv.proposition_id = p_proposition_id AND NOT (p_context ? fd.name);

    IF v_uncovered_count > 0 THEN
        RETURN 'context_required';  -- caller's context doesn't cover every declared dimension
    END IF;

    RETURN 'matched';
END;
$$ LANGUAGE plpgsql;

-- Unscoped propositions (no frame values) behave EXACTLY as before,
-- regardless of what context is passed -- every existing caller
-- (on_change, run_staleness_sweep, reopen_disputed_proposition) calls this
-- without a context argument and must keep working unchanged.
CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(
    p_proposition_id uuid, p_trigger_reason text DEFAULT 'manual', p_context jsonb DEFAULT NULL
) RETURNS TABLE(disposition text, all_passed boolean, context_status text) AS $$
DECLARE
    v_context_status       text;
    v_current_disposition  text;
    v_subject_entity_id    uuid;
    r                      RECORD;
    v_result               boolean;
    v_sql                  text;
    v_all_passed           boolean := true;
    v_relational_failed    boolean := false;
    v_disposition_value_id uuid;
    v_new_disposition      text;
BEGIN
    v_context_status := resolution.check_context_match(p_proposition_id, p_context);

    IF v_context_status NOT IN ('not_scoped', 'matched') THEN
        -- refuse to evaluate: no assertion_evaluation rows, no disposition
        -- change, no last_evaluated_at change. Nothing was actually checked.
        SELECT cav.value INTO v_current_disposition
        FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE p.id = p_proposition_id;
        RETURN QUERY SELECT v_current_disposition, NULL::boolean, v_context_status;
        RETURN;
    END IF;

    SELECT subject_entity_id INTO v_subject_entity_id FROM resolution.proposition WHERE id = p_proposition_id;

    FOR r IN
        SELECT pa.rule_id, rl.expression_id, rl.is_relational_check
        FROM resolution.proposition_assertion pa
        JOIN resolution.rule rl ON rl.id = pa.rule_id
        WHERE pa.proposition_id = p_proposition_id
    LOOP
        IF r.expression_id IS NULL THEN
            v_result := false; v_sql := NULL;
        ELSE
            SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
            FROM resolution.evaluate_relationship_guard(r.expression_id, v_subject_entity_id) eg;
        END IF;

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql, trigger_reason)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql, p_trigger_reason);

        IF NOT v_result THEN
            v_all_passed := false;
            IF r.is_relational_check THEN v_relational_failed := true; END IF;
        END IF;
    END LOOP;

    v_new_disposition := CASE
        WHEN v_all_passed THEN 'Asserted'
        WHEN v_relational_failed THEN 'Disputed'
        ELSE 'Rejected'
    END;

    SELECT cav.id INTO v_disposition_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_new_disposition;

    UPDATE resolution.proposition
    SET disposition_value_id = v_disposition_value_id, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_new_disposition, v_all_passed, v_context_status;
END;
$$ LANGUAGE plpgsql;
