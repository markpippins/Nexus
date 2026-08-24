-- =============================================================================
-- MIGRATION: resolution v3 -> v4
-- rule was designed (four turns ago) to attach to a state_transition_id as
-- its 'guard' case, but the actual DDL only ever wired up three of the four
-- attachment points. This adds the fourth.
-- =============================================================================

ALTER TABLE resolution.rule
    ADD COLUMN state_transition_id uuid REFERENCES resolution.concept_state_transition(id);

ALTER TABLE resolution.rule DROP CONSTRAINT rule_check;
ALTER TABLE resolution.rule ADD CONSTRAINT rule_check CHECK (
    (concept_id IS NOT NULL)::int + (concept_relationship_id IS NOT NULL)::int +
    (representation_id IS NOT NULL)::int + (state_transition_id IS NOT NULL)::int = 1
);

-- concrete guard: OpenQuestion cannot move IN_DELIBERATION -> RESOLVED
-- unless a verified_statement exists for one of its answers.
INSERT INTO resolution.rule (name, rule_type, severity, state_transition_id, notes)
SELECT
    'open_question_resolve_requires_verified_statement', 'guard', 'hard', cst.id,
    'EXISTS (SELECT 1 FROM open_question_answer a JOIN verified_statement vs ON vs.answer_id = a.id WHERE a.question_id = <this open_question''s id>)'
FROM resolution.concept_state_transition cst
JOIN resolution.concept c ON c.id = cst.concept_id AND c.name = 'OpenQuestion'
JOIN resolution.concept_attribute_value f ON f.id = cst.from_value_id AND f.value = 'IN_DELIBERATION'
JOIN resolution.concept_attribute_value t ON t.id = cst.to_value_id   AND t.value = 'RESOLVED';
