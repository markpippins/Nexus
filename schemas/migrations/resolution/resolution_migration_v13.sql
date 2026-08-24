-- Requirement.compilation_status has been a governed state attribute since
-- v6 but never had real transitions registered -- same gap pattern as
-- OpenQuestion/WorkRequest before their transitions were added.
INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, f.value || '_to_' || t.value
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'compilation_status'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id
WHERE c.name = 'Requirement'
  AND (f.value, t.value) IN (
      ('draft','compiled'), ('draft','rejected'), ('rejected','draft')
  );
