-- 001_segment_sets.sql
-- Additive migration: introduces reusable "segment sets" so candidates,
-- intent records, requirements, etc. can point back at the original
-- chunked transcript data instead of copying text forward.
--
-- Nothing here ALTERs or DROPs an existing table/column. Existing
-- copy-forward columns (harvest_candidates.code_snippets,
-- intent_records.description, requirements_history.description, ...)
-- are untouched and keep working exactly as before.

-- ---------------------------------------------------------------------
-- 1. segment_sets: the first-class, reusable, cache-backed object
-- ---------------------------------------------------------------------
create table nebula.segment_sets
(
    id           uuid                     default gen_random_uuid() not null primary key,
    name         text,
    description  text,
    status       text                     default 'active'::text    not null
        constraint segment_sets_status_check
            check (status = ANY (ARRAY ['active'::text, 'archived'::text])),
    metadata     jsonb                    default '{}'::jsonb        not null,
    created_at   timestamp with time zone default now()              not null,
    updated_at   timestamp with time zone default now()              not null
);

comment on table nebula.segment_sets is
    'First-class, addressable, reusable collection of segments (possibly non-contiguous). Domain objects point at a segment_set instead of copying source text forward. Cached in Redis under nexus:segset:{id} for fast agent-tooling reads.';

alter table nebula.segment_sets
    owner to pguser;

-- ---------------------------------------------------------------------
-- 2. segment_set_members: ordered, non-destructive membership
-- ---------------------------------------------------------------------
create table nebula.segment_set_members
(
    id              uuid                     default gen_random_uuid() not null primary key,
    segment_set_id  uuid                                               not null, -- -> segment_sets.id
    segment_id      uuid                                               not null, -- -> segments_history.id (logical id; current version has expiration_dt = '9999-12-31 23:59:59+00')
    ordinal         integer                                            not null,
    included        boolean                  default true              not null, -- toggle instead of delete
    note            text,
    created_at      timestamp with time zone default now()             not null,
    unique (segment_set_id, segment_id)
);

comment on table nebula.segment_set_members is
    'Ordered membership of a segment_set. "Candidate covers chunks 5-8 and 12-18" = two rows here, each pointing at a nebula.segments_history row. Excluding a digression toggles included=false rather than deleting.';

create index idx_segment_set_members_set
    on nebula.segment_set_members (segment_set_id)
    where included;

alter table nebula.segment_set_members
    owner to pguser;

-- ---------------------------------------------------------------------
-- 3. per-domain-type links (additive; candidate_id / *_id columns on the
--    existing tables are untouched and keep their current meaning)
-- ---------------------------------------------------------------------
create table nebula.candidate_segment_sets
(
    id              uuid                     default gen_random_uuid() not null primary key,
    candidate_id    uuid                                               not null, -- -> harvest_candidates.id
    segment_set_id  uuid                                               not null, -- -> segment_sets.id
    role            text                     default 'primary'::text   not null
        constraint candidate_segment_sets_role_check
            check (role = ANY (ARRAY ['primary'::text, 'supporting'::text])),
    active          boolean                  default true              not null, -- unlink toggles this instead of deleting the row
    created_at      timestamp with time zone default now()             not null,
    unique (candidate_id, segment_set_id)
);

alter table nebula.candidate_segment_sets
    owner to pguser;

create table nebula.intent_record_segment_sets
(
    id                uuid                     default gen_random_uuid() not null primary key,
    intent_record_id  uuid                                               not null, -- -> intent_records.id
    segment_set_id    uuid                                               not null, -- -> segment_sets.id
    role              text                     default 'primary'::text   not null
        constraint intent_record_segment_sets_role_check
            check (role = ANY (ARRAY ['primary'::text, 'supporting'::text])),
    active            boolean                  default true              not null,
    created_at        timestamp with time zone default now()             not null,
    unique (intent_record_id, segment_set_id)
);

alter table nebula.intent_record_segment_sets
    owner to pguser;

create table nebula.requirement_segment_sets
(
    id              uuid                     default gen_random_uuid() not null primary key,
    requirement_id  uuid                                               not null, -- -> requirements_history.id
    segment_set_id  uuid                                               not null, -- -> segment_sets.id
    role            text                     default 'primary'::text   not null
        constraint requirement_segment_sets_role_check
            check (role = ANY (ARRAY ['primary'::text, 'supporting'::text])),
    active          boolean                  default true              not null,
    created_at      timestamp with time zone default now()             not null,
    unique (requirement_id, segment_set_id)
);

alter table nebula.requirement_segment_sets
    owner to pguser;
