-- Per-kind required fields: kind='attribute_ref' with a NULL attribute_id
-- was structurally legal before this, same for every other kind.
ALTER TABLE resolution.expression ADD CONSTRAINT expression_kind_fields_check CHECK (
       (kind = 'literal'          AND literal_value IS NOT NULL AND attribute_id IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND operator IS NULL)
    OR (kind = 'attribute_ref'    AND attribute_id IS NOT NULL AND literal_value IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND operator IS NULL)
    OR (kind = 'operator'         AND operator IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL)
    OR (kind = 'function_call'    AND function_name IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND concept_relationship_id IS NULL AND operator IS NULL)
    OR (kind = 'relationship_ref' AND concept_relationship_id IS NOT NULL AND quantifier IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND function_name IS NULL AND operator IS NULL)
);

-- operator was free text, interpolated raw into compiled SQL via format().
-- Whitelisting closes off anything beyond deliberate comparison/boolean
-- operators from ever being stored, regardless of how it got inserted.
ALTER TABLE resolution.expression ADD CONSTRAINT expression_operator_whitelist_check
    CHECK (operator IS NULL OR operator IN ('=', '<>', '>', '<', '>=', '<=', 'AND', 'OR'));
