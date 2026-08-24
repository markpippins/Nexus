-- Compares a declared column pair across two representations of the same
-- external instance. Narrow on purpose: the "to" side's correlation column
-- (work_request_uuid) is hardcoded here rather than declared generically --
-- fine for this one satellite table, not a general multi-satellite
-- mechanism. A real version would need that declared per representation,
-- same honesty about scope as everywhere else in this build.
CREATE OR REPLACE FUNCTION resolution.detect_disagreement(p_representation_comparison_id uuid, p_external_id text)
RETURNS TABLE(agrees boolean, from_value text, to_value text, from_repr text, to_repr text) AS $$
DECLARE
    v_comp              RECORD;
    v_rr                RECORD;
    v_from_repr         RECORD;
    v_to_repr           RECORD;
    v_from_concept_name text;
    v_from_entity_id    uuid;
    v_from_value        text;
    v_to_value          text;
BEGIN
    SELECT * INTO v_comp FROM resolution.representation_comparison WHERE id = p_representation_comparison_id;
    SELECT * INTO v_rr   FROM resolution.representation_relationship WHERE id = v_comp.representation_relationship_id;
    SELECT * INTO v_from_repr FROM resolution.representation WHERE id = v_rr.from_representation_id;
    SELECT * INTO v_to_repr   FROM resolution.representation WHERE id = v_rr.to_representation_id;

    SELECT c.name INTO v_from_concept_name FROM resolution.concept c WHERE c.id = v_from_repr.concept_id;
    v_from_entity_id := resolution.resolve_entity_uuid(p_external_id, v_from_concept_name);

    EXECUTE format('SELECT %I::text FROM %I.%I WHERE id = $1', v_comp.from_column, v_from_repr.schema_name, v_from_repr.table_name)
        INTO v_from_value USING v_from_entity_id;

    EXECUTE format('SELECT %I::text FROM %I.%I WHERE work_request_uuid = $1', v_comp.to_column, v_to_repr.schema_name, v_to_repr.table_name)
        INTO v_to_value USING p_external_id;

    RETURN QUERY SELECT (v_from_value IS NOT DISTINCT FROM v_to_value), v_from_value, v_to_value, v_from_repr.label, v_to_repr.label;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.check_and_record_disagreement(
    p_representation_comparison_id uuid, p_external_id text, p_proposition_id uuid
) RETURNS boolean AS $$
DECLARE
    v_check           RECORD;
    v_concept_id      uuid;
    v_disputed_value  uuid;
BEGIN
    SELECT * INTO v_check FROM resolution.detect_disagreement(p_representation_comparison_id, p_external_id);

    IF NOT v_check.agrees THEN
        SELECT c.id INTO v_concept_id FROM resolution.concept c WHERE c.name = 'WorkRequest';

        INSERT INTO resolution.observation (trigger_type, asset_concept_id, source_artifact_id, payload, assessed)
        VALUES ('representation_disagreement', v_concept_id,
                resolution.resolve_entity_uuid(p_external_id, 'WorkRequest'),
                jsonb_build_object('from_repr', v_check.from_repr, 'to_repr', v_check.to_repr,
                                    'from_value', v_check.from_value, 'to_value', v_check.to_value),
                true);

        SELECT cav.id INTO v_disputed_value
        FROM resolution.concept_attribute_value cav
        JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
        JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
        WHERE cav.value = 'Disputed';

        UPDATE resolution.proposition SET disposition_value_id = v_disputed_value WHERE id = p_proposition_id;
    END IF;

    RETURN v_check.agrees;
END;
$$ LANGUAGE plpgsql;
