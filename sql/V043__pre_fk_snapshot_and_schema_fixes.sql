-- V043: Pre-FK migration snapshot + requirements_history PK fix + artifact_provenance
--
-- Step 1: Snapshot rows with FK references into agent_records_history
-- Step 2: Fix requirements_history (add composite PK, indexes)
-- Step 3: Create artifact_provenance table

BEGIN;

-- =====================================================================
-- STEP 1: Snapshot existing FK-referenced rows into agent_records_history
-- =====================================================================
-- These rows will soon have FK constraints. Snapshot them as evidence
-- so the data is preserved in the knowledge graph regardless of what
-- the FK constraints do to the live data.

-- 1a. harvest_candidates with harvest_id
INSERT INTO nebula.agent_records_history
    (record_type, role, title, content, metadata, tags, level, visibility_scope)
SELECT
    'report' as record_type,
    'engineer' as role,
    'pre-fk-snapshot: harvest_candidates -> harvests' as title,
    row_to_json(hc.*) as content,
    jsonb_build_object(
        'source_table', 'harvest_candidates',
        'source_id', hc.id,
        'fk_column', 'harvest_id',
        'fk_value', hc.harvest_id,
        'snapshot_purpose', 'pre-fk-migration-evidence'
    ) as metadata,
    ARRAY['pre-fk-migration-snapshot', 'harvest_candidates', 'harvests'] as tags,
    1 as level,
    'all' as visibility_scope
FROM nebula.harvest_candidates hc
WHERE hc.harvest_id IS NOT NULL;

-- 1b. intent_records with candidate_id
INSERT INTO nebula.agent_records_history
    (record_type, role, title, content, metadata, tags, level, visibility_scope)
SELECT
    'report' as record_type,
    'engineer' as role,
    'pre-fk-snapshot: intent_records -> harvest_candidates' as title,
    row_to_json(ir.*) as content,
    jsonb_build_object(
        'source_table', 'intent_records',
        'source_id', ir.id,
        'fk_column', 'candidate_id',
        'fk_value', ir.candidate_id,
        'snapshot_purpose', 'pre-fk-migration-evidence'
    ) as metadata,
    ARRAY['pre-fk-migration-snapshot', 'intent_records', 'harvest_candidates'] as tags,
    1 as level,
    'all' as visibility_scope
FROM nebula.intent_records ir
WHERE ir.candidate_id IS NOT NULL;

-- 1c. implementation_plans with requirement_id
INSERT INTO nebula.agent_records_history
    (record_type, role, title, content, metadata, tags, level, visibility_scope)
SELECT
    'report' as record_type,
    'engineer' as role,
    'pre-fk-snapshot: implementation_plans -> requirements' as title,
    row_to_json(ip.*) as content,
    jsonb_build_object(
        'source_table', 'implementation_plans',
        'source_id', ip.id,
        'fk_column', 'requirement_id',
        'fk_value', ip.requirement_id,
        'snapshot_purpose', 'pre-fk-migration-evidence'
    ) as metadata,
    ARRAY['pre-fk-migration-snapshot', 'implementation_plans', 'requirements'] as tags,
    1 as level,
    'all' as visibility_scope
FROM nebula.implementation_plans ip
WHERE ip.requirement_id IS NOT NULL;

-- 1d. work_requests with plan_id
INSERT INTO nebula.agent_records_history
    (record_type, role, title, content, metadata, tags, level, visibility_scope)
SELECT
    'report' as record_type,
    'engineer' as role,
    'pre-fk-snapshot: work_requests -> implementation_plans (plan_id)' as title,
    row_to_json(wr.*) as content,
    jsonb_build_object(
        'source_table', 'work_requests',
        'source_id', wr.id,
        'fk_column', 'plan_id',
        'fk_value', wr.plan_id,
        'snapshot_purpose', 'pre-fk-migration-evidence'
    ) as metadata,
    ARRAY['pre-fk-migration-snapshot', 'work_requests', 'implementation_plans'] as tags,
    1 as level,
    'all' as visibility_scope
FROM nebula.work_requests wr
WHERE wr.plan_id IS NOT NULL;


-- =====================================================================
-- STEP 2: Fix requirements_history
-- =====================================================================
-- This table has bitemporal columns but NO primary key and NO indexes.
-- It's not a ledger yet. Fix that.

-- 2a. Add composite PK (id, recorded_on_dt)
ALTER TABLE nebula.requirements_history
    ADD CONSTRAINT requirements_history_pkey
    PRIMARY KEY (id, recorded_on_dt);

-- 2b. Add indexes for common query patterns
CREATE INDEX idx_requirements_history_valid
    ON nebula.requirements_history (valid_from, valid_until);

CREATE INDEX idx_requirements_history_status
    ON nebula.requirements_history (status)
    WHERE valid_until = '9999-12-31 23:59:59+00'::timestamptz;

CREATE INDEX idx_requirements_history_system
    ON nebula.requirements_history (system_id)
    WHERE valid_until = '9999-12-31 23:59:59+00'::timestamptz;


-- =====================================================================
-- STEP 3: Create artifact_provenance table
-- =====================================================================
-- Lightweight provenance tracking: "which exact source artifact did
-- this derived object come from?" Avoids composite temporal FKs while
-- preserving version-level provenance.

CREATE TABLE nebula.artifact_provenance
(
    id              uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    subject_type    text        NOT NULL,  -- e.g. 'harvest_candidate', 'intent_record'
    subject_id      uuid        NOT NULL,  -- the derived object's ID
    source_type     text        NOT NULL,  -- e.g. 'harvest', 'requirement'
    source_id       uuid        NOT NULL,  -- the source object's logical ID
    source_version  text,                  -- e.g. recorded_on_dt, version number, or NULL for current
    relationship    text        NOT NULL DEFAULT 'derived_from',  -- 'derived_from', 'inspired_by', 'extracted_from'
    metadata        jsonb       DEFAULT '{}'::jsonb NOT NULL,
    created_at      timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE nebula.artifact_provenance IS
    'Lightweight version-level provenance: which exact source artifact did a derived object come from? Avoids composite temporal FKs while preserving the "which version" question.';

ALTER TABLE nebula.artifact_provenance OWNER TO pguser;

CREATE INDEX idx_artifact_provenance_subject
    ON nebula.artifact_provenance (subject_type, subject_id);

CREATE INDEX idx_artifact_provenance_source
    ON nebula.artifact_provenance (source_type, source_id);

-- Unique constraint: one provenance link per subject-source pair
ALTER TABLE nebula.artifact_provenance
    ADD CONSTRAINT uq_artifact_provenance_pair
    UNIQUE (subject_type, subject_id, source_type, source_id, relationship);


COMMIT;
