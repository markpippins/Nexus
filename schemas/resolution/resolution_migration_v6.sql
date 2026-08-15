-- =============================================================================
-- MIGRATION: resolution v5 -> v6
-- Adds concept_attribute_binding (same reasoning as concept_relationship_
-- binding: attribute_ref can't correctly resolve to a column without a real
-- mapping, not a name-matching assumption). Governs Answer.confidence as a
-- real concept_attribute_value set — note this is a genuinely NEW governance
-- decision, not a port: nebula.open_question_answers_history.confidence had
-- no CHECK constraint, just a free-text default of 'MEDIUM'.
-- =============================================================================

CREATE TABLE resolution.concept_attribute_binding (
    attribute_id  uuid PRIMARY KEY REFERENCES resolution.concept_attribute(id),
    schema_name   text NOT NULL,
    table_name    text NOT NULL,
    column_name   text NOT NULL
);

INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'confidence', 'enum', false FROM resolution.concept WHERE name = 'Answer';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Answer' AND ca.name = 'confidence',
     (VALUES ('LOW'),('MEDIUM'),('HIGH')) AS v(value);

INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name)
SELECT ca.id, 'resolution', 'open_question_answer', 'confidence'
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Answer' AND ca.name = 'confidence';
