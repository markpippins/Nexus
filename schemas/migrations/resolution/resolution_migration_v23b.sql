-- A concept can legitimately have more than one orthogonal state
-- attribute -- Proposition now has both disposition and grounding_status,
-- tracking genuinely independent lifecycles. The old constraint assumed
-- at most one, which was an untested assumption, not a real invariant.
DROP INDEX resolution.one_state_attr_per_concept;

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

INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, 'PendingGrounding_to_Grounded'
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'grounding_status'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id AND f.value = 'PendingGrounding'
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id AND t.value = 'Grounded'
WHERE c.name = 'Proposition';

-- redo the backfill now that the Grounded value actually exists
UPDATE resolution.proposition p
SET grounding_status_value_id = (
    SELECT cav.id FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'grounding_status'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Grounded'
);
