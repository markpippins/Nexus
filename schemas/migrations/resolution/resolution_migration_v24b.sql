INSERT INTO resolution.proposition (id, title, description, asset_concept_id, subject_entity_id, grounding_status_value_id)
SELECT 'f4000000-0000-0000-0000-00000000f004',
       'resolution and vision agree on WorkRequest wr-mongo-wiring''s status',
       'A Relational proposition -- its subject is the comparison itself, not a domain fact about the WorkRequest.',
       wr.id, '90000000-0000-0000-0000-000000000002', gs.id
FROM resolution.concept wr,
     (SELECT cav.id FROM resolution.concept_attribute_value cav
      JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'grounding_status'
      JOIN resolution.concept pc ON pc.id = ca.concept_id AND pc.name = 'Proposition'
      WHERE cav.value = 'Relational') gs
WHERE wr.name = 'WorkRequest';

INSERT INTO resolution.proposition_comparison (proposition_id, representation_comparison_id)
VALUES ('f4000000-0000-0000-0000-00000000f004', '4639bfa0-b2ec-49e0-bc02-5727a1e677af');

INSERT INTO resolution.expression (id, kind, referenced_proposition_id, proposition_ref_field, return_type, label)
VALUES ('a6000000-0000-0000-0000-00000000a006', 'proposition_ref', 'f4000000-0000-0000-0000-00000000f004', 'value', 'text',
        'value of "resolution and vision agree..."');

INSERT INTO resolution.expression (id, kind, literal_value, return_type, label)
VALUES ('a7000000-0000-0000-0000-00000000a007', 'literal', 'true', 'text', '''true''');

INSERT INTO resolution.expression (id, kind, operator, return_type, label)
VALUES ('a8000000-0000-0000-0000-00000000a008', 'operator', '=', 'boolean', 'representations agree');

INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, position) VALUES
    ('a8000000-0000-0000-0000-00000000a008', 'a6000000-0000-0000-0000-00000000a006', 1),
    ('a8000000-0000-0000-0000-00000000a008', 'a7000000-0000-0000-0000-00000000a007', 2);

INSERT INTO resolution.rule (id, name, rule_type, severity, concept_id, expression_id, is_relational_check, notes)
SELECT 'a9000000-0000-0000-0000-00000000a009', 'wr_mongo_wiring_representations_agree', 'invariant', 'hard', c.id,
       'a8000000-0000-0000-0000-00000000a008', true,
       'Fails when resolution and vision disagree on this WorkRequest''s status -- a relational check, not a domain fact.'
FROM resolution.concept c WHERE c.name = 'WorkRequest';

INSERT INTO resolution.proposition_assertion (proposition_id, rule_id)
VALUES ('f1000000-0000-0000-0000-00000000f001', 'a9000000-0000-0000-0000-00000000a009');

CREATE OR REPLACE FUNCTION resolution.check_and_record_disagreement(
    p_representation_comparison_id uuid, p_external_id text, p_relational_proposition_id uuid
) RETURNS boolean AS $$
DECLARE
    v_check      RECORD;
    v_concept_id uuid;
    v_asserted   uuid;
BEGIN
    SELECT * INTO v_check FROM resolution.detect_disagreement(p_representation_comparison_id, p_external_id);

    SELECT c.id INTO v_concept_id FROM resolution.concept c WHERE c.name = 'WorkRequest';
    INSERT INTO resolution.observation (trigger_type, asset_concept_id, source_artifact_id, payload, assessed)
    VALUES ('representation_disagreement', v_concept_id,
            resolution.resolve_entity_uuid(p_external_id, 'WorkRequest'),
            jsonb_build_object('from_repr', v_check.from_repr, 'to_repr', v_check.to_repr,
                                'from_value', v_check.from_value, 'to_value', v_check.to_value, 'agrees', v_check.agrees),
            true);

    SELECT cav.id INTO v_asserted
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Asserted';

    UPDATE resolution.proposition
    SET value = v_check.agrees, disposition_value_id = v_asserted, last_evaluated_at = now()
    WHERE id = p_relational_proposition_id;

    RETURN v_check.agrees;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(p_proposition_id uuid)
RETURNS TABLE(disposition text, all_passed boolean) AS $$
DECLARE
    v_subject_entity_id    uuid;
    r                      RECORD;
    v_result               boolean;
    v_sql                  text;
    v_all_passed           boolean := true;
    v_relational_failed    boolean := false;
    v_disposition_value_id uuid;
    v_disposition          text;
BEGIN
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

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql);

        IF NOT v_result THEN
            v_all_passed := false;
            IF r.is_relational_check THEN v_relational_failed := true; END IF;
        END IF;
    END LOOP;

    v_disposition := CASE
        WHEN v_all_passed THEN 'Asserted'
        WHEN v_relational_failed THEN 'Disputed'
        ELSE 'Rejected'
    END;

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
