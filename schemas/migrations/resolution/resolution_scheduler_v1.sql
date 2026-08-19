CREATE OR REPLACE FUNCTION resolution.run_reconciliation_sweep(
    p_stale_after interval DEFAULT '1 hour',
    p_batch_limit integer DEFAULT 50
) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text) AS $$
DECLARE
    r            RECORD;
    v_eval       RECORD;
    v_stale_ids  uuid[];
    v_ext        text;
    v_value_id   uuid;
BEGIN
    -- snapshot: propositions ALREADY Stale before this sweep touches
    -- anything -- phase 2 below may mark NEW ones Stale, but only ids
    -- captured here get reopened this cycle. Otherwise a proposition could
    -- be marked stale and silently reopened in the same breath, defeating
    -- the point of Stale being a visible, inspectable resting state.
    SELECT array_agg(p.id) INTO v_stale_ids
    FROM resolution.proposition p
    JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE cav.value = 'Stale';

    -- phase 1: Pending propositions with at least one linked assertion
    FOR r IN
        SELECT p.id FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE cav.value = 'Pending'
          AND EXISTS (SELECT 1 FROM resolution.proposition_assertion pa WHERE pa.proposition_id = p.id)
        LIMIT p_batch_limit
    LOOP
        SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id);
        RETURN QUERY SELECT r.id, 'mechanical_evaluate'::text, v_eval.disposition;
    END LOOP;

    -- phase 2: Asserted propositions past their freshness window -> Stale.
    -- Deliberately NOT re-verified here -- staleness should be visible,
    -- not silently patched over.
    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Stale';

    FOR r IN
        SELECT p.id FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE cav.value = 'Asserted'
          AND (p.last_evaluated_at IS NULL OR p.last_evaluated_at < now() - p_stale_after)
        LIMIT p_batch_limit
    LOOP
        UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
        RETURN QUERY SELECT r.id, 'marked_stale'::text, 'Stale'::text;
    END LOOP;

    -- phase 3: propositions that were ALREADY Stale (snapshot above, not
    -- anything just marked in phase 2) -> reopen for a fresh mechanical pass
    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Pending';

    IF v_stale_ids IS NOT NULL THEN
        FOR r IN SELECT unnest(v_stale_ids) AS id LOOP
            UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
            SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id);
            RETURN QUERY SELECT r.id, 'reopened_from_stale'::text, v_eval.disposition;
        END LOOP;
    END IF;

    -- phase 4: Disputed propositions -> opportunistic mechanical recheck.
    -- Skips (with an explicit action, not a silent no-op) anything whose
    -- external id can't be derived, rather than letting the exception
    -- abort the whole sweep.
    FOR r IN
        SELECT p.id, c.name AS concept_name, p.subject_entity_id
        FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        JOIN resolution.concept c ON c.id = p.asset_concept_id
        WHERE cav.value = 'Disputed'
          AND EXISTS (SELECT 1 FROM resolution.proposition_comparison pc WHERE pc.proposition_id = p.id)
        LIMIT p_batch_limit
    LOOP
        BEGIN
            v_ext := resolution.derive_external_id(r.concept_name, r.subject_entity_id);
            SELECT * INTO v_eval FROM resolution.reopen_disputed_proposition(r.id, v_ext);
            RETURN QUERY SELECT r.id, 'opportunistic_reopen'::text, v_eval.disposition;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT r.id, 'reopen_skipped_no_external_id'::text, 'Disputed'::text;
        END;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;
