-- V039: Generic linking table for open questions to any entity
--
-- Replaces the per-entity column approach (requirement_id, candidate_id)
-- with a normalized many-to-many link so open questions can be attached to
-- work requests, specifications, agendas, harvests, conversations, intents,
-- assessments, observations, reports, agent records, agents, and any future
-- entity without further schema changes.

CREATE TABLE nebula.open_question_entities (
    open_question_id UUID NOT NULL REFERENCES nebula.open_questions(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    PRIMARY KEY (open_question_id, entity_type, entity_id)
);

CREATE INDEX idx_oq_entities_type_id
    ON nebula.open_question_entities (entity_type, entity_id);

-- Seed the new table with existing requirement/candidate links.
-- Legacy requirement_id and candidate_id columns are left in place so
-- existing views and functions continue to work.
INSERT INTO nebula.open_question_entities (open_question_id, entity_type, entity_id)
SELECT id, 'requirement', requirement_id FROM nebula.open_questions WHERE requirement_id IS NOT NULL;

INSERT INTO nebula.open_question_entities (open_question_id, entity_type, entity_id)
SELECT id, 'candidate', candidate_id FROM nebula.open_questions WHERE candidate_id IS NOT NULL;
