-- Disputed currently has no legal way back except Retracted. Two real
-- resolution paths, matching the two on-ramps this design has had since
-- early on: mechanical (re-check, the disagreement is actually gone) and
-- authority (a human resolves it, even if the underlying disagreement
-- technically persists).
INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, f.value || '_to_' || t.value
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'disposition'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id
WHERE c.name = 'Proposition'
  AND (f.value, t.value) IN (
      ('Disputed','Pending'),    -- mechanical: reopen for full recheck
      ('Disputed','Asserted')    -- authority: explicit override
  );

-- mirrors proposition_assertion, but for comparator checks -- a Proposition
-- can depend on representation agreement, not just rule evaluation.
CREATE TABLE resolution.proposition_comparison (
    proposition_id              uuid NOT NULL REFERENCES resolution.proposition(id),
    representation_comparison_id uuid NOT NULL REFERENCES resolution.representation_comparison(id),
    added_at                    timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (proposition_id, representation_comparison_id)
);

-- retroactively link f1 to the comparison that actually disputed it --
-- this connection didn't exist even though the comparator already used it.
INSERT INTO resolution.proposition_comparison (proposition_id, representation_comparison_id)
VALUES ('f1000000-0000-0000-0000-00000000f001', '4639bfa0-b2ec-49e0-bc02-5727a1e677af');

-- mechanical resolution: re-run every linked comparison AND every linked
-- assertion. Only clears to Asserted if BOTH kinds of check are clean --
-- idempotent and safe to call repeatedly; if the disagreement is still
-- real, the proposition correctly stays Disputed.
CREATE OR REPLACE FUNCTION resolution.reopen_disputed_proposition(p_proposition_id uuid, p_external_id text)
RETURNS TABLE(disposition text, comparators_agree boolean, assertions_passed boolean) AS $$
DECLARE
    v_current_disposition text;
    v_comp                RECORD;
    v_all_agree           boolean := true;
    v_eval                RECORD;
    v_disputed_value      uuid;
    v_target_value_id     uuid;
    v_target_value        text;
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
    -- evaluate_proposition already wrote its own disposition (Asserted/
    -- Rejected) based purely on assertions -- we override below based on
    -- the combined mechanical picture.

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

    UPDATE resolution.proposition SET disposition_value_id = v_target_value_id WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_target_value, v_all_agree, v_eval.all_passed;
END;
$$ LANGUAGE plpgsql;
