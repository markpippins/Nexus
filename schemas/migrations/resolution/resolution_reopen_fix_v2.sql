CREATE OR REPLACE FUNCTION resolution.reopen_disputed_proposition(p_proposition_id uuid, p_external_id text)
RETURNS TABLE(disposition text, comparators_agree boolean, assertions_passed boolean) AS $$
DECLARE
    v_current_disposition text;
    v_comp                RECORD;
    v_relational_prop_id  uuid;
    v_all_agree           boolean := true;
    v_eval                RECORD;
    v_target_value        text;
    v_target_value_id     uuid;
BEGIN
    SELECT cav.value INTO v_current_disposition
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    IF v_current_disposition IS DISTINCT FROM 'Disputed' THEN
        RAISE EXCEPTION 'proposition % is not Disputed (currently %), nothing to reopen', p_proposition_id, v_current_disposition;
    END IF;

    FOR v_comp IN
        SELECT pc.representation_comparison_id
        FROM resolution.proposition_comparison pc WHERE pc.proposition_id = p_proposition_id
    LOOP
        -- refresh the Relational proposition for this comparison, if one
        -- exists, so evaluate_proposition below sees current data rather
        -- than whatever value was last recorded.
        SELECT p2.id INTO v_relational_prop_id
        FROM resolution.proposition p2
        JOIN resolution.proposition_comparison pc2
            ON pc2.proposition_id = p2.id AND pc2.representation_comparison_id = v_comp.representation_comparison_id
        JOIN resolution.concept_attribute_value gcav ON gcav.id = p2.grounding_status_value_id AND gcav.value = 'Relational'
        LIMIT 1;

        IF v_relational_prop_id IS NOT NULL THEN
            PERFORM resolution.check_and_record_disagreement(v_comp.representation_comparison_id, p_external_id, v_relational_prop_id);
            IF NOT (SELECT p3.value FROM resolution.proposition p3 WHERE p3.id = v_relational_prop_id) THEN
                v_all_agree := false;
            END IF;
        ELSIF NOT (SELECT agrees FROM resolution.detect_disagreement(v_comp.representation_comparison_id, p_external_id)) THEN
            -- no Relational proposition wired for this comparison -- fall
            -- back to a direct check
            v_all_agree := false;
        END IF;
    END LOOP;

    SELECT * INTO v_eval FROM resolution.evaluate_proposition(p_proposition_id);
    -- evaluate_proposition already wrote its own disposition based on the
    -- (now-refreshed) assertions -- nothing further to override here,
    -- since a failing relational assertion already yields Disputed and a
    -- clean pass already yields Asserted.

    SELECT cav.value INTO v_target_value
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    RETURN QUERY SELECT v_target_value, v_all_agree, v_eval.all_passed;
END;
$$ LANGUAGE plpgsql;
