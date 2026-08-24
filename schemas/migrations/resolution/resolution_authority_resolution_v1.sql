CREATE OR REPLACE FUNCTION resolution.resolve_disputed_via_verification(p_proposition_id uuid, p_verified_statement_id uuid)
RETURNS text AS $$
DECLARE
    v_current_disposition text;
    v_vs                   RECORD;
    v_proposition_concept   uuid;
    v_asserted_value        uuid;
BEGIN
    SELECT cav.value INTO v_current_disposition
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    IF v_current_disposition IS DISTINCT FROM 'Disputed' THEN
        RAISE EXCEPTION 'proposition % is not Disputed (currently %)', p_proposition_id, v_current_disposition;
    END IF;

    SELECT * INTO v_vs FROM resolution.verified_statement WHERE id = p_verified_statement_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no verified_statement %', p_verified_statement_id;
    END IF;

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

    UPDATE resolution.proposition SET disposition_value_id = v_asserted_value WHERE id = p_proposition_id;

    RETURN 'Asserted';
END;
$$ LANGUAGE plpgsql;
