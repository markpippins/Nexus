-- v1 scope, deliberately: mechanical fast path only. All assertions pass ->
-- Asserted. Any fails -> Rejected. Disputed (conflicting assertions) isn't
-- handled here -- that needs a real policy for what "conflicting" means,
-- which hasn't been designed yet. Fails closed on an unwired assertion,
-- same discipline as check_transition_guard.
CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(p_proposition_id uuid)
RETURNS TABLE(disposition text, all_passed boolean) AS $$
DECLARE
    v_subject_entity_id    uuid;
    r                      RECORD;
    v_result               boolean;
    v_sql                  text;
    v_all_passed           boolean := true;
    v_disposition_value_id uuid;
    v_disposition          text;
BEGIN
    SELECT subject_entity_id INTO v_subject_entity_id FROM resolution.proposition WHERE id = p_proposition_id;
    IF v_subject_entity_id IS NULL THEN
        RAISE EXCEPTION 'no proposition %', p_proposition_id;
    END IF;

    FOR r IN
        SELECT pa.rule_id, rl.expression_id
        FROM resolution.proposition_assertion pa
        JOIN resolution.rule rl ON rl.id = pa.rule_id
        WHERE pa.proposition_id = p_proposition_id
    LOOP
        IF r.expression_id IS NULL THEN
            v_result := false;
            v_sql := NULL;
        ELSE
            SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
            FROM resolution.evaluate_relationship_guard(r.expression_id, v_subject_entity_id) eg;
        END IF;

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql);

        IF NOT v_result THEN
            v_all_passed := false;
        END IF;
    END LOOP;

    v_disposition := CASE WHEN v_all_passed THEN 'Asserted' ELSE 'Rejected' END;

    SELECT cav.id INTO v_disposition_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_disposition;

    UPDATE resolution.proposition SET disposition_value_id = v_disposition_value_id WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_disposition, v_all_passed;
END;
$$ LANGUAGE plpgsql;
