-- =============================================================================
-- MIGRATION: resolution v33 - remove overlapping sweep overload defaults
--
-- The integer overloads remain the convenience entry points:
--   run_reconciliation_sweep(integer DEFAULT 50)
--   run_staleness_sweep(integer DEFAULT 50)
--
-- The interval overloads require both arguments. This preserves explicit
-- stale-window control while making zero-argument calls unambiguous.
-- =============================================================================

BEGIN;

-- CREATE OR REPLACE cannot reliably remove defaults from an existing
-- PostgreSQL function, so replace only the two interval overloads.
DROP FUNCTION IF EXISTS resolution.run_reconciliation_sweep(interval, integer);
DROP FUNCTION IF EXISTS resolution.run_staleness_sweep(interval, integer);

CREATE FUNCTION resolution.run_reconciliation_sweep(
    p_stale_after interval,
    p_batch_limit integer
) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text)
LANGUAGE plpgsql
AS $function$
DECLARE
    r            RECORD;
    v_eval       RECORD;
    v_stale_ids  uuid[];
    v_ext        text;
    v_value_id   uuid;
BEGIN
    SELECT array_agg(p.id) INTO v_stale_ids
    FROM resolution.proposition p
    JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE cav.value = 'Stale';

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
$function$;

CREATE FUNCTION resolution.run_staleness_sweep(
    p_stale_after interval,
    p_batch_limit integer
) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text)
LANGUAGE plpgsql
AS $function$
DECLARE
    r           RECORD;
    v_eval      RECORD;
    v_stale_ids uuid[];
    v_value_id  uuid;
BEGIN
    SELECT array_agg(p.id) INTO v_stale_ids
    FROM resolution.proposition p
    JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE cav.value = 'Stale';

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

    RETURN;
END;
$function$;

COMMIT;
