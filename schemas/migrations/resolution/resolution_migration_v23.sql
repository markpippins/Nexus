-- Grounded/PendingGrounding/Abstract/Relational -- distinguishes WHY a
-- proposition may lack a resolvable single subject, rather than treating
-- every case as an identical failure.
INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'grounding_status', 'enum', true FROM resolution.concept WHERE name = 'Proposition';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition' AND ca.name = 'grounding_status',
     (VALUES ('Grounded'),('PendingGrounding'),('Abstract'),('Relational')) AS v(value);

INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name)
SELECT ca.id, 'resolution', 'proposition', 'grounding_status_value_id'
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition' AND ca.name = 'grounding_status';

-- only PendingGrounding -> Grounded represents genuine change over time.
-- Grounded/Abstract/Relational are structural properties fixed at
-- creation, not states a proposition evolves through.
INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, 'PendingGrounding_to_Grounded'
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'grounding_status'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id AND f.value = 'PendingGrounding'
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id AND t.value = 'Grounded'
WHERE c.name = 'Proposition';

ALTER TABLE resolution.proposition ADD COLUMN grounding_status_value_id uuid REFERENCES resolution.concept_attribute_value(id);
ALTER TABLE resolution.proposition ALTER COLUMN subject_entity_id DROP NOT NULL;

-- disposition is a judgment, not the truth value -- but nothing actually
-- stored the truth value separately until now. Needed so a Relational
-- proposition's mechanically-settled agree/disagree finding can be cited
-- by proposition_ref without abusing disposition to carry it.
ALTER TABLE resolution.proposition ADD COLUMN value boolean;

-- backfill existing propositions as Grounded (they all have a single
-- resolvable subject today)
UPDATE resolution.proposition p
SET grounding_status_value_id = (
    SELECT cav.id FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'grounding_status'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Grounded'
)
WHERE grounding_status_value_id IS NULL;

-- proposition_ref needs to distinguish citing another proposition's
-- disposition (text, e.g. 'Asserted') vs its value (boolean fact).
ALTER TABLE resolution.expression ADD COLUMN proposition_ref_field text
    CHECK (proposition_ref_field IS NULL OR proposition_ref_field IN ('disposition','value'));

CREATE OR REPLACE FUNCTION resolution.compile_proposition_ref(expr_id uuid)
RETURNS text AS $$
DECLARE
    v_prop_id uuid;
    v_field   text;
BEGIN
    SELECT referenced_proposition_id, coalesce(proposition_ref_field, 'disposition')
    INTO v_prop_id, v_field
    FROM resolution.expression WHERE id = expr_id;

    IF v_prop_id IS NULL THEN
        RAISE EXCEPTION 'proposition_ref node % has no referenced_proposition_id', expr_id;
    END IF;

    IF v_field = 'value' THEN
        RETURN format('(SELECT p.value::text FROM resolution.proposition p WHERE p.id = %L)', v_prop_id);
    ELSE
        RETURN format(
            '(SELECT cav.value FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id WHERE p.id = %L)',
            v_prop_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
