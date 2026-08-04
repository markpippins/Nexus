CREATE TABLE semantics.owning_subsystem (
    id      smallint PRIMARY KEY,
    name    text UNIQUE NOT NULL,
    description text
);

CREATE TABLE semantics.concept (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  text UNIQUE NOT NULL,   -- 'WorkRequest', 'ImplementationPlan'
    description           text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz
);

CREATE TABLE semantics.representation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id            uuid NOT NULL REFERENCES semantics.concept(id),
    label                 text NOT NULL,   -- 'WRP DAG node', 'work_request table', 'CER event', 'Wind projection'
    schema_name           text,             -- nullable: a DAG node isn't a table
    table_name            text,
    owning_subsystem_id   smallint NOT NULL REFERENCES semantics.owning_subsystem(id),
    owner                 text,
    raw_metadata          jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz
);


CREATE TABLE semantics.representation_relationship (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_representation_id  uuid NOT NULL REFERENCES semantics.representation(id),
    to_representation_id    uuid NOT NULL REFERENCES semantics.representation(id),
    relationship_type       text NOT NULL,  -- 'equivalent','derived','partial','legacy','supersedes','projects'
    notes                   text,
    effective_at            timestamptz NOT NULL DEFAULT now(),
    expired_at              timestamptz,
    CHECK (from_representation_id <> to_representation_id)
);

CREATE TABLE semantics.consumer_operation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id     uuid NOT NULL REFERENCES semantics.representation(id),
    consumer_name          text NOT NULL,   -- 'Wind','Orb','Drift', a UI, a report
    operation              text NOT NULL,   -- 'reads','writes','observes','emits','projects','owns'
    notes                  text,
    effective_at            timestamptz NOT NULL DEFAULT now(),
    expired_at              timestamptz
);

CREATE TABLE semantics.identity_strategy (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id                  uuid NOT NULL UNIQUE REFERENCES semantics.concept(id),
    canonical_key_description   text NOT NULL,  -- prose/spec of what identity means for this concept
    notes                       text
);

CREATE TABLE semantics.representation_identity (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    representation_id       uuid NOT NULL UNIQUE REFERENCES semantics.representation(id),
    identity_strategy_id     uuid NOT NULL REFERENCES semantics.identity_strategy(id),
    identity_expression      text NOT NULL,  -- 'entity_key', 'canonical_asset_id', a JSONPath, a formula
    notes                    text
);

CREATE TABLE semantics.snapshot (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text NOT NULL,
    version     integer NOT NULL,
    parent_id   uuid REFERENCES semantics.snapshot(id),
    status      text NOT NULL DEFAULT 'draft',
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    notes       text
);

CREATE TABLE semantics.snapshot_observation (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id          uuid NOT NULL REFERENCES semantics.snapshot(id),
    representation_id     uuid NOT NULL REFERENCES semantics.representation(id),
    lifecycle_state       text NOT NULL,   -- 'active','deprecated','migrating','legacy-frozen','expired'
    is_completed_fix      boolean NOT NULL DEFAULT false,
    completed_fix_ref     text,
    audit_reason          text,
    safe_to_retire         boolean,
    UNIQUE (snapshot_id, representation_id)
);

CREATE TABLE semantics.drift_finding (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id   uuid NOT NULL REFERENCES semantics.snapshot_observation(id),
    description      text NOT NULL,
    severity         text NOT NULL,
    detected_at       timestamptz NOT NULL DEFAULT now(),
    resolved_at       timestamptz
);


CREATE TABLE semantics.concept_relationship (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_concept_id      uuid NOT NULL REFERENCES semantics.concept(id),
    to_concept_id        uuid NOT NULL REFERENCES semantics.concept(id),
    relationship_type     text NOT NULL,  -- 'produces','spawns','member_of','transforms_into',
                                            -- 'basis_of','provenance_of','parent_of'
    path                  text,            -- 'green' | 'red' | null, for branch-tagging
    notes                 text,
    effective_at           timestamptz NOT NULL DEFAULT now(),
    expired_at             timestamptz
);


