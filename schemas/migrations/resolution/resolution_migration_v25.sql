-- staleness lives on the Assertion, not as a global parameter --
-- different kinds of claims have wildly different volatility even when
-- composed into the same Proposition. NULL = never goes stale on its own
-- (a stable/eternal claim).
ALTER TABLE resolution.rule ADD COLUMN staleness_window interval;

-- provenance: WHY did this evaluation happen, not just what it found.
-- Matches the real branches a production invocation surface would have:
-- a Pending proposition being evaluated for the first time, an upstream
-- change, an explicit repair, or a clock-driven retry after Stale.
ALTER TABLE resolution.assertion_evaluation ADD COLUMN trigger_reason text
    DEFAULT 'manual' CHECK (trigger_reason IN ('pending_created','upstream_changed','explicit_repair','clock_stale_retry','manual'));

-- its own explicit primitive, not buried inside a sweep loop. Derives the
-- freshness window FROM the proposition's own composition rather than
-- being handed one externally.
CREATE OR REPLACE FUNCTION resolution.is_stale(p_proposition_id uuid)
RETURNS boolean AS $$
DECLARE
    v_last_evaluated  timestamptz;
    v_tightest_window interval;
BEGIN
    SELECT last_evaluated_at INTO v_last_evaluated FROM resolution.proposition WHERE id = p_proposition_id;
    IF v_last_evaluated IS NULL THEN
        RETURN false;  -- never evaluated isn't "stale", it's a different concern (Pending)
    END IF;

    SELECT min(rl.staleness_window) INTO v_tightest_window
    FROM resolution.proposition_assertion pa
    JOIN resolution.rule rl ON rl.id = pa.rule_id
    WHERE pa.proposition_id = p_proposition_id AND rl.staleness_window IS NOT NULL;

    IF v_tightest_window IS NULL THEN
        RETURN false;  -- no assertion declares a window -- this proposition doesn't go stale on its own
    END IF;

    RETURN v_last_evaluated < now() - v_tightest_window;
END;
$$ LANGUAGE plpgsql;

-- evaluate_proposition now records WHY it ran
CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(p_proposition_id uuid, p_trigger_reason text DEFAULT 'manual')
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

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql, trigger_reason)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql, p_trigger_reason);

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

-- run_staleness_sweep now checks EACH proposition against its own derived
-- window via is_stale(), rather than one p_stale_after for everything.
CREATE OR REPLACE FUNCTION resolution.run_staleness_sweep(p_batch_limit integer DEFAULT 50)
RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text) AS $$
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
        WHERE cav.value = 'Asserted' AND resolution.is_stale(p.id)
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
            SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id, 'clock_stale_retry');
            RETURN QUERY SELECT r.id, 'reopened_from_stale'::text, v_eval.disposition;
        END LOOP;
    END IF;

    RETURN;
END;
$$ LANGUAGE plpgsql;
