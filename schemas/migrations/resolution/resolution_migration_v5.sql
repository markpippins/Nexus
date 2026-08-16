-- =============================================================================
-- MIGRATION: resolution v4 -> v5
-- Adds relationship_ref as a real expression node kind (traverse a
-- concept_relationship edge, optionally quantified), and
-- concept_relationship_binding, which tells a compiler what physical
-- join a given concept_relationship actually means.
--
-- Promotes VerifiedStatement to a real concept: the guard needs a second
-- hop (Answer -> VerifiedStatement) and relationship_ref can only traverse
-- edges between registered concepts. Keeping the traversal mechanism
-- uniform beats carving out a special case for one table.
-- =============================================================================

ALTER TABLE resolution.expression DROP CONSTRAINT expression_kind_check;
ALTER TABLE resolution.expression ADD CONSTRAINT expression_kind_check
    CHECK (kind IN ('literal','attribute_ref','operator','function_call','relationship_ref'));

ALTER TABLE resolution.expression
    ADD COLUMN concept_relationship_id uuid REFERENCES resolution.concept_relationship(id),
    ADD COLUMN quantifier text CHECK (quantifier IS NULL OR quantifier IN ('EXISTS','ALL','COUNT'));

-- what a concept_relationship actually means as a physical join.
-- Populated by hand, not inferred — inferring join paths from naming
-- conventions is exactly the kind of implicit magic that causes silent
-- bugs later.
CREATE TABLE resolution.concept_relationship_binding (
    concept_relationship_id  uuid PRIMARY KEY REFERENCES resolution.concept_relationship(id),
    from_schema              text NOT NULL,
    from_table               text NOT NULL,
    from_column              text NOT NULL,
    to_schema                text NOT NULL,
    to_table                 text NOT NULL,
    to_column                text NOT NULL,
    notes                    text
);

-- promote VerifiedStatement to a concept
INSERT INTO resolution.concept (name, description)
VALUES ('VerifiedStatement', 'A Verifier-compiled SOL IR fact, derived from one verified Answer');

INSERT INTO resolution.representation (concept_id, label, schema_name, table_name, owning_subsystem_id)
SELECT id, 'verified_statement table', 'resolution', 'verified_statement', 2
FROM resolution.concept WHERE name = 'VerifiedStatement';

INSERT INTO resolution.concept_relationship (from_concept_id, to_concept_id, relationship_type, path)
SELECT a.id, vs.id, 'produces', NULL
FROM resolution.concept a, resolution.concept vs
WHERE a.name = 'Answer' AND vs.name = 'VerifiedStatement';

-- bind both hops the guard needs to real columns
INSERT INTO resolution.concept_relationship_binding
    (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes)
SELECT cr.id, 'resolution', 'open_question', 'id', 'resolution', 'open_question_answer', 'question_id',
       'OpenQuestion produces Answer'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'OpenQuestion'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'Answer'
UNION ALL
SELECT cr.id, 'resolution', 'open_question_answer', 'id', 'resolution', 'verified_statement', 'answer_id',
       'Answer produces VerifiedStatement'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'Answer'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'VerifiedStatement';

-- rebuild the guard as a real two-level AST, replacing the prose in `notes`
-- root: EXISTS(OpenQuestion -> Answer WHERE <child>)
-- child: EXISTS(Answer -> VerifiedStatement)  -- bare existence, no further condition
INSERT INTO resolution.expression (id, kind, concept_relationship_id, quantifier, return_type, label)
SELECT 'e1000000-0000-0000-0000-000000000001', 'relationship_ref', cr.id, 'EXISTS', 'boolean',
       'exists related Answer'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'OpenQuestion'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'Answer';

INSERT INTO resolution.expression (id, kind, concept_relationship_id, quantifier, return_type, label)
SELECT 'e2000000-0000-0000-0000-000000000002', 'relationship_ref', cr.id, 'EXISTS', 'boolean',
       'exists related VerifiedStatement'
FROM resolution.concept_relationship cr
JOIN resolution.concept f ON f.id = cr.from_concept_id AND f.name = 'Answer'
JOIN resolution.concept t ON t.id = cr.to_concept_id   AND t.name = 'VerifiedStatement';

INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, position)
VALUES ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 1);

-- point the existing guard rule at the real AST instead of prose
UPDATE resolution.rule
SET expression_id = 'e1000000-0000-0000-0000-000000000001'
WHERE name = 'open_question_resolve_requires_verified_statement';
