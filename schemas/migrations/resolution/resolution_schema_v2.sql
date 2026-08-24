-- =============================================================================
-- SCHEMA: resolution — v2
-- Changes from v1:
--   - DROPPED resolution.intent_record, resolution.intent_record_segment_set.
--     Requirements are either promoted candidates or manual plain-English
--     entries; both are gated by the same SOL IR compile check.
--   - ADDED resolution.specification / specification_lineage (ported from
--     nebula.specifications_history) — a deliberation/audit artifact one
--     level of abstraction above ImplementationPlan, NOT a compile step.
--   - ADDED resolution.candidate_segment_set / requirement_segment_set —
--     segment sets are candidate-scoped (a transcript can hold several
--     interleaved candidates), not transcript/asset-scoped.
--   - ADDED resolution.expression / expression_operand / rule — now
--     load-bearing, since rejection reasons against candidates are
--     themselves expressed as SOL IR, not just concept_attribute/
--     concept_relationship references.
--   - requirement.source_type ADDED ('candidate' | 'manual').
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS resolution;
COMMENT ON SCHEMA resolution IS 'SOL sandbox: greenfield redevelopment of semantics + selected nebula domain tables. Zero blast radius to production.';

-- -----------------------------------------------------------------------------
-- SECTION 1 — Meta / semantic layer
-- -----------------------------------------------------------------------------

CREATE TABLE resolution.owning_subsystem (
    id            smallint PRIMARY KEY,
    name          text UNIQUE NOT NULL,
    description   text
);

CREATE TABLE resolution.concept (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text UNIQUE NOT NULL,
    description   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expired_at    timestamptz
);

CREATE TABLE resolution.concept_attribute (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id          uuid NOT NULL REFERENCES resolution.concept(id),
    name                text NOT NULL,
    description         text,
    value_type          text NOT NULL,
    is_state_attribute  boolean NOT NULL DEFAULT false,
    UNIQUE (concept_id, name)
);

CREATE UNIQUE INDEX one_state_attr_per_concept
    ON resolution.concept_attribute (concept_id) WHERE is_state_attribute;

CREATE TABLE resolution.concept_attribute_value (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id   uuid NOT NULL REFERENCES resolution.concept_attribute(id),
    value          text NOT NULL,
    description    text,
    UNIQUE (attribute_id, value)
);

CREATE TABLE resolution.concept_relationship (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_concept_id     uuid NOT NULL REFERENCES resolution.concept(id),
    to_concept_id       uuid NOT NULL REFERENCES resolution.concept(id),
    relationship_type   text NOT NULL,
    path                text,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expired_at          timestamptz
);

CREATE TABLE resolution.representation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id            uuid NOT NULL REFERENCES resolution.concept(id),
    label                 text NOT NULL,
    schema_name           text,
    table_name            text,
    owning_subsystem_id   smallint REFERENCES resolution.owning_subsystem(id),
    owner                 text,
    raw_metadata          jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz
);

CREATE TABLE resolution.representation_relationship (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_representation_id   uuid NOT NULL REFERENCES resolution.representation(id),
    to_representation_id     uuid NOT NULL REFERENCES resolution.representation(id),
    relationship_type        text NOT NULL,
    notes                    text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    expired_at               timestamptz,
    CHECK (from_representation_id <> to_representation_id)
);

CREATE TABLE resolution.consumer_operation (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id   uuid NOT NULL REFERENCES resolution.representation(id),
    consumer_name        text NOT NULL,
    operation             text NOT NULL,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz
);

CREATE TABLE resolution.identity_strategy (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id                  uuid NOT NULL UNIQUE REFERENCES resolution.concept(id),
    canonical_key_description   text NOT NULL,
    notes                       text
);

CREATE TABLE resolution.representation_identity (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id      uuid NOT NULL UNIQUE REFERENCES resolution.representation(id),
    identity_strategy_id    uuid NOT NULL REFERENCES resolution.identity_strategy(id),
    identity_expression      text NOT NULL,
    notes                    text
);

-- -----------------------------------------------------------------------------
-- SECTION 1b — Executable expressions (SOL IR) + rules.
-- Now load-bearing: candidate rejection reasons are themselves expressed
-- as SOL IR, and the rollup invariant below is the first real rule.
-- -----------------------------------------------------------------------------

CREATE TABLE resolution.expression (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            text NOT NULL CHECK (kind IN ('literal','attribute_ref','operator','function_call')),
    operator        text,
    literal_value   text,
    attribute_id    uuid REFERENCES resolution.concept_attribute(id),
    function_name   text,
    return_type     text NOT NULL,
    label           text
);

CREATE TABLE resolution.expression_operand (
    parent_expression_id   uuid NOT NULL REFERENCES resolution.expression(id),
    child_expression_id    uuid NOT NULL REFERENCES resolution.expression(id),
    position                integer NOT NULL,
    PRIMARY KEY (parent_expression_id, position),
    CHECK (parent_expression_id <> child_expression_id)
);

CREATE TABLE resolution.rule (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        text NOT NULL,
    rule_type                   text NOT NULL CHECK (rule_type IN ('invariant','guard','conditional','derivation')),
    expression_id               uuid REFERENCES resolution.expression(id),
    severity                    text NOT NULL DEFAULT 'hard' CHECK (severity IN ('hard','soft')),
    concept_id                  uuid REFERENCES resolution.concept(id),
    concept_relationship_id     uuid REFERENCES resolution.concept_relationship(id),
    representation_id           uuid REFERENCES resolution.representation(id),
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    expired_at                  timestamptz,
    CHECK (
      (concept_id IS NOT NULL)::int + (concept_relationship_id IS NOT NULL)::int +
      (representation_id IS NOT NULL)::int = 1
    )
);

-- -----------------------------------------------------------------------------
-- SECTION 2 — Canonical identity anchor. Unchanged.
-- -----------------------------------------------------------------------------

CREATE TABLE resolution.canonical_asset (
    id                  uuid                     DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    canonical_asset_id  text                     NOT NULL,
    asset_kind          text                     NOT NULL,
    canonical_key       jsonb,
    source_hash         text,
    content_hash        text,
    validity_start      timestamptz,
    validity_end        timestamptz,
    created_at          timestamptz              DEFAULT now() NOT NULL,
    expired_at          timestamptz
);

CREATE UNIQUE INDEX idx_canonical_asset_active_canonical_asset_id
    ON resolution.canonical_asset (canonical_asset_id)
    WHERE (expired_at IS NULL);

-- -----------------------------------------------------------------------------
-- SECTION 3 — Domain / mechanical layer
-- -----------------------------------------------------------------------------

CREATE TABLE resolution.harvest (
    id                 uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id           uuid        REFERENCES resolution.canonical_asset(id),
    source_path        text        NOT NULL,
    source_filename    text        DEFAULT '' NOT NULL,
    model              text        DEFAULT '' NOT NULL,
    total_candidates   integer     DEFAULT 0 NOT NULL,
    source_text        text,
    docklang           jsonb,
    source_hash        text,
    version            integer     DEFAULT 1 NOT NULL,
    run_metadata       jsonb       DEFAULT '{}'::jsonb NOT NULL,
    file_size          bigint,
    tags               text[]      DEFAULT '{}'::text[] NOT NULL,
    metadata           jsonb       DEFAULT '{}'::jsonb NOT NULL,
    level              integer     DEFAULT 1 NOT NULL CHECK (level BETWEEN 1 AND 4),
    visibility_scope   text        DEFAULT 'all' NOT NULL,
    created_at         timestamptz DEFAULT now() NOT NULL,
    valid_from         timestamptz DEFAULT now() NOT NULL,
    valid_until        timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt     timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt  timestamptz DEFAULT 'infinity' NOT NULL
);

CREATE TABLE resolution.candidate (
    id                       uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id                 uuid        REFERENCES resolution.canonical_asset(id),
    harvest_id               uuid        NOT NULL REFERENCES resolution.harvest(id),
    title                    text        NOT NULL,
    intent_description       text,
    implementation_notes     jsonb       DEFAULT '[]'::jsonb NOT NULL,
    code_snippets            jsonb       DEFAULT '[]'::jsonb NOT NULL,
    tags                     text[]      DEFAULT '{}'::text[] NOT NULL,
    status                   text        CHECK (status IS NULL OR status IN
                                ('pending','linked','useful','rejected','promoted','superseded')),
    type                     text        DEFAULT 'requirement' NOT NULL CHECK (type IN
                                ('requirement','principle','rejected_alternative','tension','rationale','mixed')),
    design_rationale         jsonb       DEFAULT '[]'::jsonb NOT NULL,
    compilation_readiness    numeric(4,3),   -- cached summary of latest SOL IR compile attempt (see observation)
    completed                boolean     DEFAULT false NOT NULL,
    needs_new_node           boolean     DEFAULT false NOT NULL,
    proposed_parent          text,
    proposed_name            text,
    placement_reason         text,
    system_id                uuid,
    subsystem_id             uuid,
    feature_id               uuid,
    work_request_id          uuid,
    created_at               timestamptz DEFAULT now() NOT NULL,
    updated_at               timestamptz DEFAULT now() NOT NULL,
    valid_from               timestamptz DEFAULT now() NOT NULL,
    valid_until              timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt           timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt        timestamptz DEFAULT 'infinity' NOT NULL
);

CREATE TABLE resolution.candidate_source_chunk (
    candidate_id   uuid    NOT NULL REFERENCES resolution.candidate(id),
    chunk_id       uuid    NOT NULL,
    position       integer NOT NULL,
    PRIMARY KEY (candidate_id, chunk_id)
);

-- segment sets are candidate-scoped (a transcript can interleave several
-- unrelated candidates), so attachment lives here, not on canonical_asset.
CREATE TABLE resolution.candidate_segment_set (
    candidate_id    uuid NOT NULL REFERENCES resolution.candidate(id),
    segment_set_id  uuid NOT NULL,   -- SegmentSet's own table is outside this pass's scope
    role            text DEFAULT 'primary' NOT NULL CHECK (role IN ('primary','supporting')),
    PRIMARY KEY (candidate_id, segment_set_id)
);

CREATE TABLE resolution.requirement (
    id                    uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id              uuid        REFERENCES resolution.canonical_asset(id),
    candidate_id          uuid        REFERENCES resolution.candidate(id),
    parent_id             uuid        REFERENCES resolution.requirement(id),   -- rollup: parent's validity depends on children (see rule seed below)
    source_type           text        NOT NULL CHECK (source_type IN ('candidate','manual')),
    system_id             uuid,
    subsystem_id          uuid,
    feature_id            uuid,
    title                 text        NOT NULL,
    description           text        DEFAULT '' NOT NULL,
    status                text        DEFAULT 'Backlog' NOT NULL CHECK (status IN
                            ('Backlog','ToDo','InProgress','Active','Blocked','Done','Cancelled','Accepted')),
    priority              text        DEFAULT 'Medium' NOT NULL CHECK (priority IN ('Low','Medium','High')),
    req_type              text        CHECK (req_type IS NULL OR req_type IN ('Epic','Story','Task','Bug')),
    compilation_status    text        DEFAULT 'draft' NOT NULL CHECK (compilation_status IN ('draft','compiled','rejected')),
    sol_ir_expression_id  uuid        REFERENCES resolution.expression(id),
    start_date            text,
    completion_date       text,
    acceptance_criteria   jsonb       DEFAULT '[]'::jsonb,
    conduit_plan_id       varchar(32),
    created_at            timestamptz DEFAULT now() NOT NULL,
    valid_from            timestamptz DEFAULT now() NOT NULL,
    valid_until            timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt          timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt         timestamptz DEFAULT 'infinity' NOT NULL,
    CHECK (source_type = 'candidate' OR candidate_id IS NULL)
);

CREATE TABLE resolution.requirement_segment_set (
    requirement_id  uuid NOT NULL REFERENCES resolution.requirement(id),
    segment_set_id  uuid NOT NULL,
    role            text DEFAULT 'primary' NOT NULL CHECK (role IN ('primary','supporting')),
    PRIMARY KEY (requirement_id, segment_set_id)
);

CREATE INDEX idx_resolution_requirement_valid  ON resolution.requirement (valid_from, valid_until);
CREATE INDEX idx_resolution_requirement_status ON resolution.requirement (status) WHERE (valid_until = 'infinity');
CREATE INDEX idx_resolution_requirement_parent ON resolution.requirement (parent_id) WHERE (valid_until = 'infinity');

-- deliberation/audit artifact, one level of abstraction above ImplementationPlan.
-- NOT a compile step — "relies on a document database", not "connects to
-- mongodb on port X at Y".
CREATE TABLE resolution.specification (
    id                 uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id           uuid        REFERENCES resolution.canonical_asset(id),
    requirement_id     uuid        REFERENCES resolution.requirement(id),
    agenda_id          uuid        NOT NULL,
    revision_number    integer     NOT NULL,
    revision_type      text        NOT NULL CHECK (revision_type IN ('created','revised','merged','split','retired')),
    superseded_by      uuid        REFERENCES resolution.specification(id),
    item_snapshot      jsonb       DEFAULT '[]'::jsonb NOT NULL,
    change_summary     text,
    created_at         timestamptz DEFAULT now() NOT NULL,
    valid_from         timestamptz DEFAULT now() NOT NULL,
    valid_until        timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt     timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt  timestamptz DEFAULT 'infinity' NOT NULL
);
COMMENT ON TABLE resolution.specification IS
    'Ported from nebula.specifications_history. derived_from uuid[] REPLACED by resolution.specification_lineage — merge/split lineage is a DAG and wants to be queried relationally (same reasoning as candidate_source_chunk).';

CREATE TABLE resolution.specification_lineage (
    specification_id  uuid NOT NULL REFERENCES resolution.specification(id),
    derived_from_id    uuid NOT NULL REFERENCES resolution.specification(id),
    PRIMARY KEY (specification_id, derived_from_id),
    CHECK (specification_id <> derived_from_id)
);

CREATE TABLE resolution.implementation_plan (
    id                   uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id             uuid        REFERENCES resolution.canonical_asset(id),
    plan_number          text        UNIQUE,
    specification_id     uuid        REFERENCES resolution.specification(id),
    requirement_id       uuid        REFERENCES resolution.requirement(id),
    title                text        NOT NULL,
    goal                 text,
    content              text,
    files_affected       text[]      DEFAULT '{}'::text[],
    acceptance_criteria  jsonb       DEFAULT '[]'::jsonb,
    dependencies         text[]      DEFAULT '{}'::text[],
    status               text        DEFAULT 'draft' NOT NULL CHECK (status IN
                            ('draft','pending','approved','work_requested','completed','archived')),
    tags                 text[]      DEFAULT '{}'::text[],
    metadata             jsonb       DEFAULT '{}'::jsonb,
    created_at           timestamptz DEFAULT now() NOT NULL,
    updated_at           timestamptz DEFAULT now() NOT NULL,
    valid_from           timestamptz DEFAULT now() NOT NULL,
    valid_until          timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt       timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt    timestamptz DEFAULT 'infinity' NOT NULL
);

CREATE TABLE resolution.work_request (
    id                        uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    asset_id                  uuid        REFERENCES resolution.canonical_asset(id),
    title                     text        NOT NULL,
    description                text,
    source_specification_id      uuid REFERENCES resolution.specification(id),
    source_requirement_id           uuid REFERENCES resolution.requirement(id),
    business_status                    text        DEFAULT 'DRAFT' NOT NULL CHECK (business_status IN
                                ('DRAFT','APPROVED','DISPATCHED','COMPLETED','CANCELLED')),
    intent                               text,
    context                               jsonb       DEFAULT '{}'::jsonb NOT NULL,
    constraints                             jsonb       DEFAULT '{}'::jsonb NOT NULL,
    created_by                                text,
    dco_json                                    text,
    legacy_id                                    text,
    plan_id                                        text REFERENCES resolution.implementation_plan(plan_number),
    step_outputs                                     text        DEFAULT '{}' NOT NULL,
    consumed_at                                        timestamptz,
    created_at                                          timestamptz DEFAULT now() NOT NULL,
    updated_at                                            timestamptz DEFAULT now() NOT NULL,
    valid_from                                              timestamptz DEFAULT now() NOT NULL,
    valid_until                                               timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt                                              timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt                                              timestamptz DEFAULT 'infinity' NOT NULL
);

CREATE INDEX idx_resolution_work_request_legacy_id       ON resolution.work_request (legacy_id) WHERE (legacy_id IS NOT NULL);
CREATE INDEX idx_resolution_work_request_plan_id         ON resolution.work_request (plan_id) WHERE (plan_id IS NOT NULL);
CREATE INDEX idx_resolution_work_request_business_status ON resolution.work_request (business_status);

-- -----------------------------------------------------------------------------
-- SECTION 4 — Observation + Assessment
-- -----------------------------------------------------------------------------

CREATE TABLE resolution.observation (
    id                  uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    trigger_type        text        NOT NULL,
    asset_concept_id    uuid        REFERENCES resolution.concept(id),
    source_artifact_id  uuid,
    predicate_type       text        CHECK (predicate_type IS NULL OR predicate_type IN
                            ('concept_attribute','concept_relationship','expression')),
    predicate_id            uuid,
    payload                    jsonb       DEFAULT '{}'::jsonb NOT NULL,
    assessed                      boolean     DEFAULT false NOT NULL,
    created_at                      timestamptz DEFAULT now() NOT NULL,
    valid_from                        timestamptz DEFAULT now() NOT NULL,
    valid_until                         timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt                        timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt                       timestamptz DEFAULT 'infinity' NOT NULL
);
COMMENT ON TABLE resolution.observation IS
    'predicate_type now includes expression: a candidate rejection reason can point directly at the SOL IR expression node that failed, not just a concept_attribute/concept_relationship.';

CREATE TABLE resolution.observation_source_chunk (
    observation_id  uuid    NOT NULL REFERENCES resolution.observation(id),
    chunk_id        uuid    NOT NULL,
    position        integer NOT NULL,
    PRIMARY KEY (observation_id, chunk_id)
);

CREATE TABLE resolution.assessment (
    id                     uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    observation_id           uuid        NOT NULL REFERENCES resolution.observation(id),
    outcome                     text        NOT NULL CHECK (outcome IN
                                ('informational','recommendation','needs_deliberation','policy_blocked','auto_resolved','rejected')),
    confidence                     numeric(4,3),
    impact_scope                      jsonb       DEFAULT '{}'::jsonb NOT NULL,
    analysis_detail                     text,
    rationale                              jsonb,
    dimensions_used                          integer,
    dimensions_total                            integer,
    agenda_id                                     uuid,
    auto_resolve_plan_id                             uuid,
    forum_post_id                                       uuid,
    resolved_at                                           timestamptz,
    created_at                                              timestamptz DEFAULT now() NOT NULL,
    valid_from                                                timestamptz DEFAULT now() NOT NULL,
    valid_until                                                 timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt                                                timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt                                                timestamptz DEFAULT 'infinity' NOT NULL
);

-- -----------------------------------------------------------------------------
-- SECTION 5 — Seed data
-- -----------------------------------------------------------------------------

INSERT INTO resolution.owning_subsystem (id, name) VALUES
    (1, 'nexus'), (2, 'nebula'), (3, 'tackle'), (4, 'wind'), (5, 'conduit'), (6, 'cascade');

INSERT INTO resolution.concept (name, description) VALUES
    ('Asset',               'Canonical identity anchor for any tracked thing in the system'),
    ('Harvest',             'A processing run over a source transcript, producing docklang and candidates'),
    ('Candidate',           'A harvested unit proposed for promotion toward a requirement'),
    ('Requirement',         'A governed unit of scope, compiled to SOL IR — spawned from a candidate or entered manually'),
    ('Specification',       'A deliberation/audit artifact over a complex requirement, revised via agenda review, not itself compiled'),
    ('ImplementationPlan',  'A concrete plan transforming a requirement/specification into actionable work'),
    ('WorkRequest',         'The dispatchable unit of execution'),
    ('Observation',         'A recorded trigger event that may require assessment'),
    ('Assessment',          'The recorded analysis and outcome of an observation');

INSERT INTO resolution.representation (concept_id, label, schema_name, table_name, owning_subsystem_id)
SELECT id, 'canonical_asset table',      'resolution', 'canonical_asset',     2 FROM resolution.concept WHERE name = 'Asset'
UNION ALL SELECT id, 'harvest table',            'resolution', 'harvest',             2 FROM resolution.concept WHERE name = 'Harvest'
UNION ALL SELECT id, 'candidate table',          'resolution', 'candidate',           2 FROM resolution.concept WHERE name = 'Candidate'
UNION ALL SELECT id, 'requirement table',        'resolution', 'requirement',         2 FROM resolution.concept WHERE name = 'Requirement'
UNION ALL SELECT id, 'specification table',      'resolution', 'specification',       2 FROM resolution.concept WHERE name = 'Specification'
UNION ALL SELECT id, 'implementation_plan table','resolution', 'implementation_plan', 2 FROM resolution.concept WHERE name = 'ImplementationPlan'
UNION ALL SELECT id, 'work_request table',       'resolution', 'work_request',        2 FROM resolution.concept WHERE name = 'WorkRequest'
UNION ALL SELECT id, 'observation table',        'resolution', 'observation',         2 FROM resolution.concept WHERE name = 'Observation'
UNION ALL SELECT id, 'assessment table',         'resolution', 'assessment',          2 FROM resolution.concept WHERE name = 'Assessment';

INSERT INTO resolution.identity_strategy (concept_id, canonical_key_description)
SELECT id, 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)'
FROM resolution.concept WHERE name IN
    ('Asset','Harvest','Candidate','Requirement','Specification','ImplementationPlan','WorkRequest');

INSERT INTO resolution.representation_identity (representation_id, identity_strategy_id, identity_expression)
SELECT r.id, s.id, 'asset_id'
FROM resolution.representation r
JOIN resolution.concept c           ON c.id = r.concept_id
JOIN resolution.identity_strategy s ON s.concept_id = c.id
WHERE c.name IN ('Harvest','Candidate','Requirement','Specification','ImplementationPlan','WorkRequest');

INSERT INTO resolution.concept_relationship (from_concept_id, to_concept_id, relationship_type, path)
SELECT h.id, ca.id, 'produces', NULL           FROM resolution.concept h,  resolution.concept ca WHERE h.name='Harvest'  AND ca.name='Candidate'
UNION ALL
SELECT ca.id, r.id, 'produces', NULL           FROM resolution.concept ca, resolution.concept r  WHERE ca.name='Candidate' AND r.name='Requirement'
UNION ALL
SELECT r.id,  r.id, 'spawns', NULL             FROM resolution.concept r                          WHERE r.name='Requirement'  -- rollup: parent<-children
UNION ALL
SELECT r.id,  sp.id, 'member_of', 'green'      FROM resolution.concept r,  resolution.concept sp  WHERE r.name='Requirement' AND sp.name='Specification'
UNION ALL
SELECT sp.id, p.id, 'transforms_into', 'green' FROM resolution.concept sp, resolution.concept p   WHERE sp.name='Specification' AND p.name='ImplementationPlan'
UNION ALL
SELECT r.id,  p.id, 'transforms_into', 'green' FROM resolution.concept r,  resolution.concept p   WHERE r.name='Requirement' AND p.name='ImplementationPlan'  -- direct path when no specification exists
UNION ALL
SELECT p.id,  w.id, 'transforms_into', 'green' FROM resolution.concept p,  resolution.concept w   WHERE p.name='ImplementationPlan' AND w.name='WorkRequest'
UNION ALL
SELECT w.id,  w.id, 'provenance_of', 'red'     FROM resolution.concept w                          WHERE w.name='WorkRequest'
UNION ALL
SELECT o.id,  a.id, 'basis_of', NULL           FROM resolution.concept o,  resolution.concept a   WHERE o.name='Observation' AND a.name='Assessment';

-- the rollup invariant, stated plainly: a parent requirement with an
-- invalid (non-compiled) child is itself invalid. rule_type='invariant',
-- expression left unattached (NULL) — a placeholder for the actual SOL IR
-- once the interpreter exists; the row registers the RULE now.
INSERT INTO resolution.rule (name, rule_type, severity, concept_id, notes)
SELECT 'requirement_rollup_validity', 'invariant', 'hard', id,
       'A parent requirement cannot be compilation_status=compiled while any child requirement (requirement.parent_id = this.id) is not compiled.'
FROM resolution.concept WHERE name = 'Requirement';
