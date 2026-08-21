CREATE OR REPLACE FUNCTION resolution.run_staleness_sweep(p_batch_limit integer DEFAULT 50)
RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text) AS $$
DECLARE
    r           RECORD;
    v_eval      RECORD;
    v_stale_ids uuid[];
    v_value_id  uuid;
BEGIN
    -- snapshot ALREADY-stale propositions, oldest-checked first, so a
    -- proposition that's been waiting longest gets priority for reopening
    SELECT array_agg(p.id ORDER BY p.last_evaluated_at ASC NULLS FIRST) INTO v_stale_ids
    FROM resolution.proposition p
    JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE cav.value = 'Stale';

    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Stale';

    -- oldest-checked-first here too: without this ORDER BY, which N rows
    -- come back under LIMIT is whatever the planner happens to pick --
    -- under real load that means some propositions could go unchecked
    -- indefinitely while others get hit every cycle. Ordering by
    -- last_evaluated_at means each call makes genuine, fair progress
    -- rather than an arbitrary one.
    FOR r IN
        SELECT p.id FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE cav.value = 'Asserted' AND resolution.is_stale(p.id)
        ORDER BY p.last_evaluated_at ASC NULLS FIRST
        LIMIT p_batch_limit
    LOOP
        UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
        RETURN QUERY SELECT r.id, 'marked_stale'::text, 'Stale'::text;
    END LOOP;

    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Pending';

    IF v_stale_ids IS NOT NULL THEN
        FOR r IN SELECT unnest(v_stale_ids[1:p_batch_limit]) AS id LOOP
            UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
            SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id, 'clock_stale_retry');
            RETURN QUERY SELECT r.id, 'reopened_from_stale'::text, v_eval.disposition;
        END LOOP;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;
