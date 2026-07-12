-- 003-agenda-tables.sql
-- Creates the Agenda deliberation surface and migrates specs → view
-- Part of the pipeline: IntentRecord → Agenda (deliberation) → Spec (settled)

BEGIN;

-- 1. Agendas — the deliberation surface
CREATE TABLE IF NOT EXISTS nebula.agendas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    scope           TEXT,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','ready_for_review','in_review','specified','archived')),
    cohesion_score  NUMERIC(4,3),
    overlap_matrix  JSONB,
    source_count    INTEGER,
    planner_analysis  TEXT,
    planner_conflicts JSONB,
    planner_gaps      JSONB,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. Agenda items — raw materials bundled for deliberation
--    Carries columns from the old nebula.specs table
CREATE TABLE IF NOT EXISTS nebula.agenda_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agenda_id       UUID NOT NULL REFERENCES nebula.agendas(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL CHECK (source_type IN (
                        'intent_record','requirement','agent_record',
                        'harvest_candidate','knowledge_graph_entry')),
    source_id       UUID NOT NULL,
    title           TEXT NOT NULL,
    body            TEXT,
    decisions       JSONB DEFAULT '[]',
    open_questions  JSONB DEFAULT '[]',
    supporting_refs JSONB DEFAULT '[]',
    included        BOOLEAN DEFAULT NULL,          -- NULL=undecided TRUE=in spec FALSE=rejected
    planner_note    TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_items_agenda_id ON nebula.agenda_items(agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_items_source ON nebula.agenda_items(source_type, source_id);

-- 3. Drop old specs table (0 rows, no FK dependencies)
DROP TABLE IF EXISTS nebula.specs;

-- 4. Spec = settled output from deliberation: a view over included agenda items
CREATE OR REPLACE VIEW nebula.specs AS
SELECT
    ai.id,
    ai.agenda_id,
    ai.source_type,
    ai.source_id,
    ai.title,
    ai.body,
    ai.decisions,
    ai.open_questions,
    ai.supporting_refs,
    ai.included,
    ai.planner_note,
    ai.created_at AS item_created_at,
    ai.updated_at AS item_updated_at,
    a.title AS agenda_title,
    a.status AS agenda_status
FROM nebula.agenda_items ai
JOIN nebula.agendas a ON a.id = ai.agenda_id
WHERE ai.included = true;

COMMIT;
