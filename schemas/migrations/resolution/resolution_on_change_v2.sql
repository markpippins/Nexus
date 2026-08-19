CREATE OR REPLACE FUNCTION resolution.on_change(p_concept_name text, p_entity_id uuid)
RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text) AS $$
DECLARE
    r      RECORD;
    v_eval RECORD;
    v_ext  text;
BEGIN
    -- Pending, Asserted, Rejected, and Stale all get a real re-evaluation
    -- on a change event -- "something changed" is reason enough to
    -- re-check regardless of current disposition. Retracted is left alone
    -- (explicitly terminal); Disputed is handled separately below since
    -- it needs the comparator-refresh logic reopen_disputed_proposition
    -- has and plain evaluate_proposition doesn't.
    FOR r IN
        SELECT p.id FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        JOIN resolution.concept c ON c.id = p.asset_concept_id
        WHERE cav.value IN ('Pending', 'Asserted', 'Rejected', 'Stale')
          AND c.name = p_concept_name AND p.subject_entity_id = p_entity_id
          AND EXISTS (SELECT 1 FROM resolution.proposition_assertion pa WHERE pa.proposition_id = p.id)
    LOOP
        SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id);
        RETURN QUERY SELECT r.id, 'event_evaluate'::text, v_eval.disposition;
    END LOOP;

    BEGIN
        v_ext := resolution.derive_external_id(p_concept_name, p_entity_id);
    EXCEPTION WHEN OTHERS THEN
        v_ext := NULL;
    END;

    IF v_ext IS NOT NULL THEN
        FOR r IN
            SELECT p.id FROM resolution.proposition p
            JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
            JOIN resolution.concept c ON c.id = p.asset_concept_id
            WHERE cav.value = 'Disputed' AND c.name = p_concept_name AND p.subject_entity_id = p_entity_id
              AND EXISTS (SELECT 1 FROM resolution.proposition_comparison pc WHERE pc.proposition_id = p.id)
        LOOP
            SELECT * INTO v_eval FROM resolution.reopen_disputed_proposition(r.id, v_ext);
            RETURN QUERY SELECT r.id, 'event_reopen'::text, v_eval.disposition;
        END LOOP;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;
