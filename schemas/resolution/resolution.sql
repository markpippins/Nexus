create table nebula.assessments_history
(
    id                   uuid                     default gen_random_uuid()                                  not null
        constraint assessments_pkey
            primary key,
    observation_id       uuid                                                                                not null,
    outcome              text                                                                                not null
        constraint assessments_outcome_check
            check (outcome = ANY
                   (ARRAY ['informational'::text, 'recommendation'::text, 'needs_deliberation'::text, 'policy_blocked'::text, 'auto_resolved'::text, 'rejected'::text])),
    confidence           numeric(4, 3),
    impact_scope         jsonb                    default '{}'::jsonb                                        not null,
    open_questions       jsonb                    default '[]'::jsonb                                        not null,
    agenda_id            uuid,
    auto_resolve_plan_id uuid,
    analysis_detail      text,
    created_at           timestamp with time zone default now()                                              not null,
    forum_post_id        uuid,
    valid_from           timestamp with time zone default now()                                              not null,
    valid_until          timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt       timestamp with time zone default now()                                              not null,
    recorded_until_dt    timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

comment on table nebula.assessments_history is 'Captures automated analysis of an observation.';

comment on column nebula.assessments_history.outcome is 'auto_resolved: system handled it, auto_resolve_plan_id set. needs_deliberation: requires organizational decision, agenda_id set. informational: awareness only, forum_post_id set. rejected: the trigger was invalid or below threshold.';

comment on column nebula.assessments_history.forum_post_id is 'Set when outcome=informational: an Assembly forum post was created for awareness (no agenda needed).';

alter table nebula.assessments_history
    owner to pguser;

create table nebula.observations_history
(
    id                   uuid                     default gen_random_uuid()                                  not null
        constraint observations_pkey
            primary key,
    trigger_type         text                                                                                not null,
    source_artifact_type text,
    source_artifact_id   uuid,
    payload              jsonb                    default '{}'::jsonb                                        not null,
    assessed             boolean                  default false                                              not null,
    created_at           timestamp with time zone default now()                                              not null,
    valid_from           timestamp with time zone default now()                                              not null,
    valid_until          timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt       timestamp with time zone default now()                                              not null,
    recorded_until_dt    timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

comment on table nebula.observations_history is 'Records trigger events that may need assessment.';

alter table nebula.observations_history
    owner to pguser;

create table nebula.assessment_resolutions_history
(
    resolution_id     uuid                     default gen_random_uuid()                                  not null
        constraint assessment_resolutions_pkey
            primary key,
    event_id          uuid                                                                                not null,
    outcome           text                                                                                not null,
    confidence        double precision,
    rationale         jsonb,
    dimensions_used   integer,
    dimensions_total  integer,
    resolved_at       timestamp with time zone default now()                                              not null,
    valid_from        timestamp with time zone default now()                                              not null,
    valid_until       timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt    timestamp with time zone default now()                                              not null,
    recorded_until_dt timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);


create table nebula.harvests_history
(
    id                uuid                     default gen_random_uuid()                                  not null,
    source_path       text                                                                                not null,
    source_filename   text                     default ''::text                                           not null,
    model             text                     default ''::text                                           not null,
    total_candidates  integer                  default 0                                                  not null,
    candidates        jsonb                    default '[]'::jsonb                                        not null,
    source_text       text,
    tags              text[]                   default '{}'::text[]                                       not null,
    metadata          jsonb                    default '{}'::jsonb                                        not null,
    created_at        timestamp with time zone default now()                                              not null,
    recorded_on_dt    timestamp with time zone default now()                                              not null,
    recorded_until_dt timestamp with time zone default '9999-12-31 23:59:59+00'::timestamp with time zone not null,
    valid_from        timestamp with time zone default now()                                              not null,
    valid_until       timestamp with time zone default '9999-12-31 23:59:59+00'::timestamp with time zone not null,
    level             integer                  default 1                                                  not null
        constraint chk_harvests_level
            check ((level >= 1) AND (level <= 4)),
    visibility_scope  text                     default 'all'::text                                        not null,
    docklang          jsonb,
    source_hash       text,
    version           integer                  default 1                                                  not null,
    run_metadata      jsonb                    default '{}'::jsonb                                        not null,
    file_size         bigint,
    primary key (id, recorded_on_dt)
);

alter table nebula.harvests_history
    owner to pguser;



create table nebula.harvest_candidates_history
(
    id                       uuid                     default gen_random_uuid()                                  not null
        constraint harvest_candidates_pkey
            primary key,
    harvest_id               uuid                                                                                not null,
    title                    text                                                                                not null,
    intent_description       text,
    implementation_notes     jsonb                    default '[]'::jsonb                                        not null,
    code_snippets            jsonb                    default '[]'::jsonb                                        not null,
    open_questions           jsonb                    default '[]'::jsonb                                        not null,
    tags                     text[]                   default '{}'::text[]                                       not null,
    status                   text
        constraint harvest_candidates_status_check
            check ((status IS NULL) OR (status = ANY
                                        (ARRAY ['pending'::text, 'linked'::text, 'useful'::text, 'rejected'::text, 'promoted'::text, 'superseded'::text]))),
    system_id                uuid,
    subsystem_id             uuid,
    feature_id               uuid,
    valid_from               timestamp with time zone default now()                                              not null,
    valid_until              timestamp with time zone default '9999-12-31 23:59:59+00'::timestamp with time zone not null,
    created_at               timestamp with time zone default now()                                              not null,
    updated_at               timestamp with time zone default now()                                              not null,
    work_request_id          uuid,
    completed                boolean                  default false                                              not null,
    compilation_readiness    numeric(4, 3),
    type                     text                     default 'requirement'::text                                not null
        constraint hc_type_check
            check (type = ANY
                   (ARRAY ['requirement'::text, 'principle'::text, 'rejected_alternative'::text, 'tension'::text, 'rationale'::text, 'mixed'::text])),
    design_rationale         jsonb                    default '[]'::jsonb                                        not null,
    provenance_block_indices jsonb                    default '[]'::jsonb                                        not null,
    needs_new_node           boolean                  default false                                              not null,
    proposed_parent          text,
    proposed_name            text,
    placement_reason         text,
    recorded_on_dt           timestamp with time zone default now()                                              not null,
    recorded_until_dt        timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

comment on column nebula.harvest_candidates_history.status is 'Candidate lifecycle: pending -> linked (to system) -> useful (reviewed) -> promoted (-> plan) | rejected (discarded)';

comment on column nebula.harvest_candidates_history.type is 'Candidate type: requirement, principle, rejected_alternative, tension, rationale, or mixed';

comment on column nebula.harvest_candidates_history.design_rationale is 'Stated principles, rejected alternatives, or reasoning that shaped a decision — even when no concrete action item follows';

comment on column nebula.harvest_candidates_history.provenance_block_indices is 'List of DockLang block indices that support this candidate (may be non-contiguous)';

comment on column nebula.harvest_candidates_history.needs_new_node is 'True when Operation 2B cannot find a clean hierarchy match';

comment on column nebula.harvest_candidates_history.proposed_parent is 'Proposed parent node for needs_new_node candidates';

comment on column nebula.harvest_candidates_history.proposed_name is 'Proposed name for needs_new_node candidates';

comment on column nebula.harvest_candidates_history.placement_reason is 'Reason why needs_new_node was flagged';

alter table nebula.harvest_candidates_history
    owner to pguser;

create index idx_hc_type
    on nebula.harvest_candidates_history (type);

create index idx_hc_needs_new_node
    on nebula.harvest_candidates_history (needs_new_node)
    where (needs_new_node = true);


    create table nebula.intent_records_history
(
    id                uuid                     default gen_random_uuid()                                  not null,
    candidate_id      uuid
        constraint fk_intent_records_candidate
            references nebula.harvest_candidates_history,
    parent_id         uuid,
    title             text                                                                                not null,
    description       text,
    source_type       text                     default 'manual'::text                                     not null
        constraint intent_records_source_type_check
            check (source_type = ANY
                   (ARRAY ['transcript'::text, 'audit_plan'::text, 'manual'::text, 'candidate'::text])),
    source_ref        text,
    tags              text[]                   default '{}'::text[],
    status            text                     default 'draft'::text                                      not null
        constraint intent_records_status_check
            check (status = ANY (ARRAY ['draft'::text, 'refined'::text, 'decomposed'::text, 'archived'::text])),
    metadata          jsonb                    default '{}'::jsonb,
    created_at        timestamp with time zone default now()                                              not null,
    updated_at        timestamp with time zone default now()                                              not null,
    valid_from        timestamp with time zone default now()                                              not null,
    valid_until       timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt    timestamp with time zone default now()                                              not null,
    recorded_until_dt timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

comment on table nebula.intent_records_history is 'Lightweight pre-canonical intent records — replaces ambiguous "plans" concept.';

alter table nebula.intent_records_history
    owner to pguser;


    create table nebula.intent_record_segment_sets
(
    id               uuid                     default gen_random_uuid()                                  not null
        primary key,
    intent_record_id uuid                                                                                not null,
    segment_set_id   uuid                                                                                not null,
    role             text                     default 'primary'::text                                    not null
        constraint intent_record_segment_sets_role_check
            check (role = ANY (ARRAY ['primary'::text, 'supporting'::text])),
    active           boolean                  default true                                               not null,
    created_at       timestamp with time zone default now()                                              not null,
    valid_from       timestamp with time zone default now()                                              not null,
    valid_until      timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

alter table nebula.intent_record_segment_sets
    owner to pguser;

create unique index uq_intent_record_segment_sets_current
    on nebula.intent_record_segment_sets (intent_record_id, segment_set_id)
    where (valid_until = '9999-12-31 00:00:00+00'::timestamp with time zone);




    create table nebula.requirements_history
(
    id                  uuid                     default gen_random_uuid()                                  not null,
    system_id           uuid                                                                                not null,
    subsystem_id        uuid,
    feature_id          uuid,
    title               text                                                                                not null,
    description         text                     default ''::text                                           not null,
    status              text                     default 'Backlog'::text                                    not null
        constraint requirements_status_check
            check (status = ANY
                   (ARRAY ['Backlog'::text, 'ToDo'::text, 'InProgress'::text, 'Active'::text, 'Blocked'::text, 'Done'::text, 'Cancelled'::text, 'Accepted'::text])),
    priority            text                     default 'Medium'::text                                     not null
        constraint requirements_priority_check
            check (priority = ANY (ARRAY ['Low'::text, 'Medium'::text, 'High'::text])),
    start_date          text,
    completion_date     text,
    created_at          timestamp with time zone default now()                                              not null,
    recorded_on_dt      timestamp with time zone default now()                                              not null,
    recorded_until_dt   timestamp with time zone default '9999-12-31 23:59:59+00'::timestamp with time zone not null,
    valid_from          timestamp with time zone default now()                                              not null,
    valid_until         timestamp with time zone default '9999-12-31 23:59:59+00'::timestamp with time zone not null,
    parent_id           uuid,
    req_type            text
        constraint chk_requirements_req_type
            check ((req_type IS NULL) OR
                   (req_type = ANY (ARRAY ['Epic'::text, 'Story'::text, 'Task'::text, 'Bug'::text]))),
    acceptance_criteria jsonb                    default '[]'::jsonb,
    candidate_id        uuid,
    conduit_plan_id     varchar(32),
    work_request_dco    jsonb,
    primary key (id, recorded_on_dt)
);

comment on column nebula.requirements_history.conduit_plan_id is 'Cross-reference to conduit plan_number that completed REVIEW_PASS';

alter table nebula.requirements_history
    owner to pguser;

create index idx_requirements_history_valid
    on nebula.requirements_history (valid_from, valid_until);

create index idx_requirements_history_status
    on nebula.requirements_history (status)
    where (valid_until = '9999-12-31 23:59:59+00'::timestamp with time zone);

create index idx_requirements_history_system
    on nebula.requirements_history (system_id)
    where (valid_until = '9999-12-31 23:59:59+00'::timestamp with time zone);


create table nebula.implementation_plans_history
(
    id                  uuid                     default gen_random_uuid()                                  not null
        constraint implementation_plans_pkey
            primary key,
    plan_number         text
        constraint uq_implementation_plans_plan_number
            unique,
    spec_id             uuid,
    requirement_id      uuid,
    title               text                                                                                not null,
    goal                text,
    content             text,
    files_affected      text[]                   default '{}'::text[],
    acceptance_criteria jsonb                    default '[]'::jsonb,
    dependencies        text[]                   default '{}'::text[],
    status              text                     default 'draft'::text                                      not null
        constraint implementation_plans_status_check
            check (status = ANY
                   (ARRAY ['draft'::text, 'pending'::text, 'approved'::text, 'work_requested'::text, 'completed'::text, 'archived'::text])),
    tags                text[]                   default '{}'::text[],
    metadata            jsonb                    default '{}'::jsonb,
    created_at          timestamp with time zone default now()                                              not null,
    updated_at          timestamp with time zone default now()                                              not null,
    valid_from          timestamp with time zone default now()                                              not null,
    valid_until         timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt      timestamp with time zone default now()                                              not null,
    recorded_until_dt   timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null
);

comment on table nebula.implementation_plans_history is 'Detailed context-heavy implementation plans. Replaces nebula.plans.';

alter table nebula.implementation_plans_history
    owner to pguser;


create table nebula.work_requests_history
(
    id                      uuid                     default gen_random_uuid()                                  not null
        constraint work_requests_pkey
            primary key,
    title                   text                                                                                not null,
    description             text,
    source_specification_id uuid
        constraint fk_work_requests_specification
            references nebula.specifications_history,
    source_requirement_id   uuid,
    business_status         text                     default 'DRAFT'::text                                      not null
        constraint work_requests_business_status_check
            check (business_status = ANY
                   (ARRAY ['DRAFT'::text, 'APPROVED'::text, 'DISPATCHED'::text, 'COMPLETED'::text, 'CANCELLED'::text])),
    intent                  text,
    context                 jsonb                    default '{}'::jsonb                                        not null,
    constraints             jsonb                    default '{}'::jsonb                                        not null,
    created_by              text,
    created_at              timestamp with time zone default now()                                              not null,
    updated_at              timestamp with time zone default now()                                              not null,
    dco_json                text,
    legacy_id               text,
    plan_id                 text
        constraint fk_work_requests_plan
            references nebula.implementation_plans_history (plan_number),
    step_outputs            text                     default '{}'::text                                         not null,
    consumed_at             timestamp with time zone,
    valid_from              timestamp with time zone default now()                                              not null,
    valid_until             timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    recorded_on_dt          timestamp with time zone default now()                                              not null,
    recorded_until_dt       timestamp with time zone default '9999-12-31 00:00:00+00'::timestamp with time zone not null,
    asset_id                uuid
        references semantics.canonical_asset
);

comment on table nebula.work_requests_history is 'Canonical work request table. Replaces conduit.work_requests as of migration 029.';

comment on column nebula.work_requests_history.business_status is 'Business lifecycle state: Should this happen? DRAFT → APPROVED → DISPATCHED → COMPLETED/CANCELLED';

comment on column nebula.work_requests_history.dco_json is 'Decomposition Command Object JSON. The compiled form of the work request.';

comment on column nebula.work_requests_history.legacy_id is 'Original TEXT ID from conduit.work_requests (e.g., wr-0130-1781781240). Preserved for knowledge graph compatibility.';

comment on column nebula.work_requests_history.plan_id is 'Reference to the implementation plan. Matches conduit.work_requests.plan_id format.';

comment on column nebula.work_requests_history.step_outputs is 'JSON object tracking outputs from each execution step.';

comment on column nebula.work_requests_history.consumed_at is 'Idempotency marker for harvest process. NULL = not yet consumed. Set when work request is processed by execution layer.';

alter table nebula.work_requests_history
    owner to pguser;

create index idx_work_requests_legacy_id
    on nebula.work_requests_history (legacy_id)
    where (legacy_id IS NOT NULL);

create index idx_work_requests_plan_id
    on nebula.work_requests_history (plan_id)
    where (plan_id IS NOT NULL);

create index idx_work_requests_consumed_at
    on nebula.work_requests_history (consumed_at)
    where (consumed_at IS NULL);

create index idx_work_requests_business_status
    on nebula.work_requests_history (business_status);




