-- =============================================================================
-- MIGRATION: resolution schema v2 -> v3
-- Adds OpenQuestion (its own concept — multi-entity, not 1:1 like Observation),
-- Answer (a genuine deliberation thread, never SOL IR itself), and
-- verified_statement (the Verifier's compile step: a VERIFIED answer becomes
-- an asserted SOL IR expression about the target asset — this is the only
-- place an answer touches SOL IR).
-- Also adds concept_state_transition, promised in the meta layer three
-- turns ago but never actually built until OpenQuestion.status needed it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- concept_state_transition — finally load-bearing.
-- -----------------------------------------------------------------------------
CREATE TABLE resolution.concept_state_transition (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id      uuid NOT NULL REFERENCES resolution.concept(id),
    from_value_id   uuid REFERENCES resolution.concept_attribute_value(id),  -- null = entry/creation
    to_value_id     uuid NOT NULL REFERENCES resolution.concept_attribute_value(id),
    name            text NOT NULL,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expired_at      timestamptz
);

-- -----------------------------------------------------------------------------
-- OpenQuestion: its own concept. Unlike Observation (one asset per row),
-- a question can implicate several assets (a CONFLICT or DUPLICATE_CANDIDATE
-- inherently needs two), so entity linkage is a real join table, not a
-- single asset_concept_id/source_artifact_id pair.
-- -----------------------------------------------------------------------------
CREATE TABLE resolution.open_question (
    id                 uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title              text        NOT NULL,
    description        text,
    blocking           boolean     DEFAULT true NOT NULL,   -- instance-level triage, not a class-level rule
    created_by         text        NOT NULL,
    created_at         timestamptz DEFAULT now() NOT NULL,
    updated_at         timestamptz DEFAULT now() NOT NULL,
    valid_from         timestamptz DEFAULT now() NOT NULL,
    valid_until        timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt     timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt  timestamptz DEFAULT 'infinity' NOT NULL
);
COMMENT ON TABLE resolution.open_question IS
    'Ported from nebula.open_questions_history. category/status REPLACED by governed concept_attribute_value + concept_state_transition (real lifecycle: OPEN -> IN_DELIBERATION -> RESOLVED/WONT_FIX/DEFERRED, instead of a flat CHECK). requirement_id/candidate_id direct columns DROPPED — that was drift, duplicating open_question_entities; all linkage now goes through open_question_entity, the same predicate-reference pattern used on observation.';

-- category and status as governed attribute values, not inline CHECK constraints
INSERT INTO resolution.concept (name, description) VALUES
    ('OpenQuestion', 'A question raised during analysis, potentially implicating several assets, resolved through deliberation'),
    ('Answer',       'One role''s response within an open question''s deliberation thread');

INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'category', 'enum', false FROM resolution.concept WHERE name = 'OpenQuestion'
UNION ALL
SELECT id, 'status', 'enum', true FROM resolution.concept WHERE name = 'OpenQuestion';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca, resolution.concept c,
     (VALUES ('AMBIGUITY'),('MISSING_INFO'),('CONFLICT'),('SCOPE'),('DEPENDENCY'),
             ('DUPLICATE_CANDIDATE'),('WORK_COMPLETED'),('NEEDS_SPEC')) AS v(value)
WHERE c.name = 'OpenQuestion' AND ca.concept_id = c.id AND ca.name = 'category';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca, resolution.concept c,
     (VALUES ('OPEN'),('IN_DELIBERATION'),('RESOLVED'),('WONT_FIX'),('DEFERRED')) AS v(value)
WHERE c.name = 'OpenQuestion' AND ca.concept_id = c.id AND ca.name = 'status';

-- add category/status columns pointing at the governed values
ALTER TABLE resolution.open_question
    ADD COLUMN category_value_id uuid REFERENCES resolution.concept_attribute_value(id),
    ADD COLUMN status_value_id   uuid REFERENCES resolution.concept_attribute_value(id);

-- legal transitions for OpenQuestion.status
INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, f.value || '_to_' || t.value
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'status'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id
WHERE c.name = 'OpenQuestion'
  AND (f.value, t.value) IN (
      ('OPEN','IN_DELIBERATION'), ('IN_DELIBERATION','RESOLVED'),
      ('IN_DELIBERATION','WONT_FIX'), ('IN_DELIBERATION','DEFERRED'),
      ('DEFERRED','IN_DELIBERATION'), ('OPEN','WONT_FIX')
  );

-- entity linkage: predicate-reference pattern, not a weak text entity_type
CREATE TABLE resolution.open_question_entity (
    open_question_id  uuid        NOT NULL REFERENCES resolution.open_question(id) ON DELETE CASCADE,
    asset_concept_id  uuid        NOT NULL REFERENCES resolution.concept(id),
    entity_id         uuid        NOT NULL,
    valid_from        timestamptz DEFAULT now() NOT NULL,
    valid_until       timestamptz DEFAULT 'infinity' NOT NULL,
    PRIMARY KEY (open_question_id, asset_concept_id, entity_id)
);
CREATE INDEX idx_oq_entity_concept_id ON resolution.open_question_entity (asset_concept_id, entity_id);

-- the deliberation thread. Renamed as_of_dt/expiration_dt -> valid_from/
-- valid_until to match house bitemporal convention (was drift, flagged
-- last turn, fixed here since we're already redesigning this table).
CREATE TABLE resolution.open_question_answer (
    id           uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    question_id  uuid        NOT NULL REFERENCES resolution.open_question(id) ON DELETE CASCADE,
    role         text        NOT NULL,
    answer       text        NOT NULL,
    confidence   text        DEFAULT 'MEDIUM',
    reasoning    text,
    answered_at  timestamptz DEFAULT now() NOT NULL,
    version      integer     DEFAULT 1 NOT NULL,
    valid_from   timestamptz DEFAULT now() NOT NULL,
    valid_until  timestamptz DEFAULT 'infinity' NOT NULL
);
CREATE INDEX idx_oqa_question      ON resolution.open_question_answer (question_id);
CREATE INDEX idx_oqa_question_role ON resolution.open_question_answer (question_id, role);

-- the ONLY place an answer touches SOL IR: the Verifier compiles a VERIFIED
-- answer into an asserted expression about the target asset. Everything
-- upstream (question, entities, raw answers) stays plain language.
CREATE TABLE resolution.verified_statement (
    id                uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    answer_id         uuid        NOT NULL REFERENCES resolution.open_question_answer(id),
    expression_id     uuid        NOT NULL REFERENCES resolution.expression(id),
    asset_concept_id  uuid        NOT NULL REFERENCES resolution.concept(id),
    target_asset_id   uuid        NOT NULL,
    verified_by       text        NOT NULL,   -- the Verifier role/agent
    verified_at       timestamptz DEFAULT now() NOT NULL,
    notes             text
);
COMMENT ON TABLE resolution.verified_statement IS
    'The compile step. A verified answer becomes an asserted SOL IR fact about target_asset_id — this is what closes the loop back to expression/predicate_type=''expression'' on observation.';

-- representations + relationships for the two new concepts
INSERT INTO resolution.representation (concept_id, label, schema_name, table_name, owning_subsystem_id)
SELECT id, 'open_question table',        'resolution', 'open_question',        2 FROM resolution.concept WHERE name = 'OpenQuestion'
UNION ALL
SELECT id, 'open_question_answer table', 'resolution', 'open_question_answer', 2 FROM resolution.concept WHERE name = 'Answer';

INSERT INTO resolution.concept_relationship (from_concept_id, to_concept_id, relationship_type, path)
SELECT a.id, oq.id, 'basis_of', NULL FROM resolution.concept a, resolution.concept oq
    WHERE a.name = 'Assessment' AND oq.name = 'OpenQuestion'
UNION ALL
SELECT oq.id, an.id, 'produces', NULL FROM resolution.concept oq, resolution.concept an
    WHERE oq.name = 'OpenQuestion' AND an.name = 'Answer';
