ALTER TABLE resolution.proposition ADD COLUMN last_evaluated_at timestamptz;

-- reverse of resolve_entity_uuid: given a resolution-internal entity, find
-- its external (peb/vision-style) identifier via canonical_asset. Needed
-- because a Proposition only stores subject_entity_id (internal), not an
-- external id -- the scheduler can't call reopen_disputed_proposition
-- (which needs an external id) without deriving one first.
CREATE OR REPLACE FUNCTION resolution.derive_external_id(p_concept_name text, p_entity_id uuid)
RETURNS text AS $$
DECLARE
    v_schema      text;
    v_table       text;
    v_asset_id    uuid;
    v_external_id text;
BEGIN
    SELECT r.schema_name, r.table_name INTO v_schema, v_table
    FROM resolution.representation r
    JOIN resolution.concept c ON c.id = r.concept_id AND c.name = p_concept_name
    JOIN resolution.representation_identity ri ON ri.representation_id = r.id;
    IF v_table IS NULL THEN
        RAISE EXCEPTION 'no identity-bearing representation for concept %', p_concept_name;
    END IF;

    EXECUTE format('SELECT asset_id FROM %I.%I WHERE id = $1', v_schema, v_table)
        INTO v_asset_id USING p_entity_id;
    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION 'entity % (concept %) has no asset_id, cannot derive an external id', p_entity_id, p_concept_name;
    END IF;

    SELECT canonical_asset_id INTO v_external_id
    FROM resolution.canonical_asset WHERE id = v_asset_id AND expired_at IS NULL;
    RETURN v_external_id;
END;
$$ LANGUAGE plpgsql;

-- stamp last_evaluated_at wherever a real evaluation happens
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
            v_result := false; v_sql := NULL;
        ELSE
            SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
            FROM resolution.evaluate_relationship_guard(r.expression_id, v_subject_entity_id) eg;
        END IF;

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql);

        IF NOT v_result THEN v_all_passed := false; END IF;
    END LOOP;

    v_disposition := CASE WHEN v_all_passed THEN 'Asserted' ELSE 'Rejected' END;

    SELECT cav.id INTO v_disposition_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_disposition;

    UPDATE resolution.proposition
    SET disposition_value_id = v_disposition_value_id, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_disposition, v_all_passed;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.reopen_disputed_proposition(p_proposition_id uuid, p_external_id text)
RETURNS TABLE(disposition text, comparators_agree boolean, assertions_passed boolean) AS $$
DECLARE
    v_current_disposition text;
    v_comp                RECORD;
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
        IF NOT (SELECT agrees FROM resolution.detect_disagreement(v_comp.representation_comparison_id, p_external_id)) THEN
            v_all_agree := false;
        END IF;
    END LOOP;

    SELECT * INTO v_eval FROM resolution.evaluate_proposition(p_proposition_id);

    IF v_all_agree AND v_eval.all_passed THEN
        v_target_value := 'Asserted';
    ELSE
        v_target_value := 'Disputed';
    END IF;

    SELECT cav.id INTO v_target_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_target_value;

    UPDATE resolution.proposition
    SET disposition_value_id = v_target_value_id, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_target_value, v_all_agree, v_eval.all_passed;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.resolve_disputed_via_verification(p_proposition_id uuid, p_verified_statement_id uuid)
RETURNS text AS $$
DECLARE
    v_current_disposition text;
    v_vs                  RECORD;
    v_proposition_concept uuid;
    v_asserted_value      uuid;
BEGIN
    SELECT cav.value INTO v_current_disposition
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    IF v_current_disposition IS DISTINCT FROM 'Disputed' THEN
        RAISE EXCEPTION 'proposition % is not Disputed (currently %)', p_proposition_id, v_current_disposition;
    END IF;

    SELECT * INTO v_vs FROM resolution.verified_statement WHERE id = p_verified_statement_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no verified_statement %', p_verified_statement_id; END IF;

    SELECT id INTO v_proposition_concept FROM resolution.concept WHERE name = 'Proposition';

    IF v_vs.asset_concept_id IS DISTINCT FROM v_proposition_concept OR v_vs.target_asset_id IS DISTINCT FROM p_proposition_id THEN
        RAISE EXCEPTION 'verified_statement % does not target proposition % -- refusing to resolve on an unrelated verification',
            p_verified_statement_id, p_proposition_id;
    END IF;

    SELECT cav.id INTO v_asserted_value
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Asserted';

    UPDATE resolution.proposition
    SET disposition_value_id = v_asserted_value, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN 'Asserted';
END;
$$ LANGUAGE plpgsql;
