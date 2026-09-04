-- nexus CI bootstrap — global receipt/WR surfaces for DB-backed tests
-- Extracted from prod (titanium) via pg_dump --schema-only; regenerate with
-- nexus/sql/ci-bootstrap/refresh.sh when adapter global reads/writes change.
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS vision;
CREATE SCHEMA IF NOT EXISTS nebula;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS semantics;
CREATE SCHEMA IF NOT EXISTS conduit;
CREATE OR REPLACE FUNCTION execution.check_attempt_lease_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.lease_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM execution.leases l
            WHERE l.id = NEW.lease_id AND l.request_id = NEW.request_id
        ) THEN
            RAISE EXCEPTION 'attempt_lease_request_mismatch: lease % has request_id %, attempt has request_id %',
                NEW.lease_id, 
                (SELECT l.request_id FROM execution.leases l WHERE l.id = NEW.lease_id),
                NEW.request_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION vision.receipts_assign_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        BEGIN
          IF NEW.sequence IS NULL THEN
            SELECT COALESCE(MAX(r.sequence), -1) + 1
            INTO NEW.sequence
            FROM vision.receipts r
            WHERE r.plan_id = NEW.plan_id;
          END IF;
          RETURN NEW;
        END;
        $function$
;
CREATE OR REPLACE FUNCTION execution.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $function$
;
CREATE OR REPLACE FUNCTION execution.receipt_governance_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_plan_id TEXT;
  v_wr_id TEXT;
BEGIN
  SELECT r.source_plan_id, r.source_wr_id::text
    INTO v_plan_id, v_wr_id
  FROM execution.requests r
  WHERE r.id = NEW.request_id;

  INSERT INTO peb.governance_events
    (receipt_id, event_type, work_request_id, plan_id, agent_role, payload)
  VALUES (
    NEW.id::text,
    'receipt:' || NEW.type,
    v_wr_id,
    COALESCE(v_plan_id, COALESCE(NEW.lineage_original_id, 'unknown')),
    NEW.agent_role,
    COALESCE(NEW.metadata, '{}'::jsonb)
  )
  ON CONFLICT (receipt_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION execution.receipts_immutable_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE: execution.receipts cannot be updated or deleted';
  RETURN NULL;
END;
$function$
;

--
-- PostgreSQL database dump
--

\restrict mmdfxYziexDehSNwGq9lKTEx0u31g3QCh2goPOE8pAn4ZqXW7dgJudQPwi50S4G

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.11 (Debian 17.11-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: canonical_asset; Type: TABLE; Schema: semantics; Owner: -
--

CREATE TABLE semantics.canonical_asset (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_asset_id text NOT NULL,
    asset_kind text NOT NULL,
    canonical_key jsonb,
    source_hash text,
    content_hash text,
    validity_start timestamp with time zone,
    validity_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: circuit_breaker; Type: TABLE; Schema: conduit; Owner: -
--

CREATE TABLE conduit.circuit_breaker (
    id integer DEFAULT 1 NOT NULL,
    tripped integer DEFAULT 0,
    tripped_at timestamp with time zone,
    retry_after integer DEFAULT 1800,
    error text,
    detail text,
    source text,
    fallback_model text,
    paused integer DEFAULT 0,
    max_retries_per_model integer DEFAULT 3,
    retry_delay_seconds integer DEFAULT 120,
    max_fallbacks integer DEFAULT 3,
    push_back_to_pending integer DEFAULT 1,
    updated_at timestamp with time zone,
    wake_requested_at timestamp with time zone,
    CONSTRAINT circuit_breaker_id_check CHECK ((id = 1))
);


--
-- Name: sessions; Type: TABLE; Schema: conduit; Owner: -
--

CREATE TABLE conduit.sessions (
    id text NOT NULL,
    agent_role text NOT NULL,
    start_iso timestamp with time zone NOT NULL,
    end_iso timestamp with time zone,
    exit_code integer,
    retries_used integer DEFAULT 0,
    plans_processed text DEFAULT '[]'::text NOT NULL,
    plan_count integer DEFAULT 0,
    pid integer,
    is_running integer DEFAULT 1,
    last_activity timestamp with time zone,
    model text,
    fallback_used integer DEFAULT 0,
    cost_usd real,
    total_work_seconds real DEFAULT 0 NOT NULL,
    workflow_id text,
    run_id text,
    workflow_start_time timestamp with time zone,
    workflow_close_time timestamp with time zone,
    workflow_run_time_ms real,
    workflow_result text,
    created_at timestamp with time zone NOT NULL,
    tags text DEFAULT '[]'::text NOT NULL,
    last_heartbeat_at timestamp with time zone
);


--
-- Name: attempts; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE execution.attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lease_id uuid NOT NULL,
    request_id uuid NOT NULL,
    executor_id text NOT NULL,
    status text DEFAULT 'CREATED'::text NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    exit_code integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attempts_status_check CHECK ((status = ANY (ARRAY['CREATED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'TIMED_OUT'::text])))
);


--
-- Name: leases; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE execution.leases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    executor_id text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    ttl_seconds integer DEFAULT 300 NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    released_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leases_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'EXPIRED'::text, 'RELEASED'::text])))
);


--
-- Name: receipts; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE execution.receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid,
    request_id uuid NOT NULL,
    type text NOT NULL,
    agent_role text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    lineage_source text,
    lineage_original_id text,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_execution_receipts_type CHECK ((type = ANY (ARRAY['ABANDONED'::text, 'API_LIMIT'::text, 'BLOCK'::text, 'CANCELLED'::text, 'CCNF_EXECUTION'::text, 'CRITIQUE'::text, 'CRITIQUE_PASS'::text, 'CRITIQUE_REJECT'::text, 'EXECUTION_COMPLETE'::text, 'HOLD'::text, 'IMPLEMENTATION'::text, 'PLANNING'::text, 'PLAN_BLOCK'::text, 'PLAN_CREATE'::text, 'PROPOSED'::text, 'REQUEUED'::text, 'REVIEW'::text, 'REVIEW_PASS'::text, 'REVIEW_REJECT'::text]))),
    CONSTRAINT receipts_type_check CHECK ((type = ANY (ARRAY['API_LIMIT'::text, 'BLOCK'::text, 'CANCELLED'::text, 'EXECUTION_COMPLETE'::text, 'HOLD'::text, 'IMPLEMENTATION'::text, 'PLAN_CREATE'::text, 'PLANNING'::text, 'PROPOSED'::text, 'REQUEUED'::text, 'REVIEW'::text, 'REVIEW_PASS'::text, 'REVIEW_REJECT'::text])))
);


--
-- Name: requests; Type: TABLE; Schema: execution; Owner: -
--

CREATE TABLE execution.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_key text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    intent_type text DEFAULT 'task'::text NOT NULL,
    objective text DEFAULT ''::text NOT NULL,
    inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
    deterministic boolean DEFAULT true NOT NULL,
    max_retries integer,
    timeout_policy text,
    resource_hints text[] DEFAULT '{}'::text[],
    op_trace jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    source_plan_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_wr_id uuid,
    CONSTRAINT requests_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'COMPILED'::text, 'VALIDATED'::text, 'ADMITTED'::text, 'READY'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])))
);


--
-- Name: specifications_history; Type: TABLE; Schema: nebula; Owner: -
--

CREATE TABLE nebula.specifications_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agenda_id uuid NOT NULL,
    revision_number integer NOT NULL,
    revision_type text NOT NULL,
    superseded_by uuid,
    derived_from uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    item_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    change_summary text,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT '9999-12-31 23:59:59+00'::timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT '9999-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    CONSTRAINT specifications_revision_type_check CHECK ((revision_type = ANY (ARRAY['created'::text, 'revised'::text, 'merged'::text, 'split'::text, 'retired'::text])))
);

ALTER TABLE ONLY nebula.specifications_history REPLICA IDENTITY FULL;


--
-- Name: implementation_plans_history; Type: TABLE; Schema: nebula; Owner: -
--

CREATE TABLE nebula.implementation_plans_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_number text,
    spec_id uuid,
    requirement_id uuid,
    title text NOT NULL,
    goal text,
    content text,
    files_affected text[] DEFAULT '{}'::text[],
    acceptance_criteria jsonb DEFAULT '[]'::jsonb,
    dependencies text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT '9999-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT '9999-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    asset_id uuid,
    CONSTRAINT implementation_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'work_requested'::text, 'completed'::text, 'archived'::text])))
);

ALTER TABLE ONLY nebula.implementation_plans_history REPLICA IDENTITY FULL;


--
-- Name: TABLE implementation_plans_history; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON TABLE nebula.implementation_plans_history IS 'Detailed context-heavy implementation plans. Replaces nebula.plans.';


--
-- Name: implementation_plans; Type: VIEW; Schema: nebula; Owner: -
--

CREATE VIEW nebula.implementation_plans AS
 SELECT id,
    plan_number,
    spec_id,
    requirement_id,
    title,
    goal,
    content,
    files_affected,
    acceptance_criteria,
    dependencies,
    status,
    tags,
    metadata,
    created_at,
    updated_at,
    valid_from,
    valid_until,
    recorded_on_dt,
    recorded_until_dt,
    asset_id
   FROM nebula.implementation_plans_history
  WHERE ((now() >= recorded_on_dt) AND (now() < recorded_until_dt) AND (now() >= valid_from) AND (now() < valid_until));


--
-- Name: plans; Type: VIEW; Schema: nebula; Owner: -
--

CREATE VIEW nebula.plans AS
 SELECT plan_number AS id,
    ''::text AS file_name,
    title,
    'wrp'::text AS project,
    COALESCE(goal, ''::text) AS goal,
    COALESCE(content, ''::text) AS content,
    COALESCE(array_to_string(files_affected, ','::text), ''::text) AS files_affected,
    COALESCE((acceptance_criteria)::text, '[]'::text) AS acceptance_criteria,
    COALESCE(array_to_string(dependencies, ','::text), ''::text) AS dependencies,
    ''::text AS prompt_ref,
    ''::text AS notes,
    0 AS priority,
    (created_at)::text AS created_at,
    (updated_at)::text AS updated_at,
        CASE
            WHEN (status = 'archived'::text) THEN 1
            ELSE 0
        END AS deleted,
    status
   FROM nebula.implementation_plans;


--
-- Name: receipts; Type: TABLE; Schema: vision; Owner: -
--

CREATE TABLE vision.receipts (
    id text NOT NULL,
    plan_id text NOT NULL,
    type text NOT NULL,
    agent_role text NOT NULL,
    session_id text,
    artifact_path text,
    summary text DEFAULT ''::text NOT NULL,
    metadata_json text DEFAULT '{}'::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    ticket_id text,
    tokens_used integer DEFAULT 0,
    recorded_on_dt timestamp with time zone DEFAULT now(),
    recorded_until_dt timestamp with time zone,
    sequence integer NOT NULL,
    CONSTRAINT chk_receipts_sequence_non_negative CHECK ((sequence >= 0)),
    CONSTRAINT chk_vision_receipts_type CHECK ((type = ANY (ARRAY['ABANDONED'::text, 'API_LIMIT'::text, 'BLOCK'::text, 'CANCELLED'::text, 'CCNF_EXECUTION'::text, 'CRITIQUE'::text, 'CRITIQUE_PASS'::text, 'CRITIQUE_REJECT'::text, 'HOLD'::text, 'IMPLEMENTATION'::text, 'PLANNING'::text, 'PLAN_BLOCK'::text, 'PLAN_CREATE'::text, 'PROPOSED'::text, 'REQUEUED'::text, 'REVIEW'::text, 'REVIEW_PASS'::text, 'REVIEW_REJECT'::text])))
);

ALTER TABLE ONLY vision.receipts REPLICA IDENTITY FULL;


--
-- Name: TABLE receipts; Type: COMMENT; Schema: vision; Owner: -
--

COMMENT ON TABLE vision.receipts IS 'FROZEN (D-T19-2d): legacy receipt store, read-only for the pipeline — real receipts now write execution.receipts. Only the test/synthetic fallback path writes here. Archive after 7-day soak (confirm with ops).';


--
-- Name: receipts_unified; Type: VIEW; Schema: nebula; Owner: -
--

CREATE VIEW nebula.receipts_unified AS
 SELECT COALESCE(e.lineage_original_id, (e.id)::text) AS id,
    rq.source_plan_id AS plan_id,
    e.type,
    e.agent_role,
    (e.metadata ->> 'session_id'::text) AS session_id,
    (e.metadata ->> 'artifact_path'::text) AS artifact_path,
    e.summary,
    (e.metadata)::text AS metadata_json,
    e.issued_at AS created_at,
    (e.metadata ->> 'ticket_id'::text) AS ticket_id,
    COALESCE(((e.metadata ->> 'tokens_used'::text))::integer, 0) AS tokens_used,
    NULL::integer AS sequence,
    e.issued_at AS recorded_on_dt,
    NULL::timestamp with time zone AS recorded_until_dt
   FROM (execution.receipts e
     JOIN execution.requests rq ON ((rq.id = e.request_id)))
  WHERE (e.lineage_source = 'conduit'::text)
UNION ALL
 SELECT receipts.id,
    receipts.plan_id,
    receipts.type,
    receipts.agent_role,
    receipts.session_id,
    receipts.artifact_path,
    receipts.summary,
    receipts.metadata_json,
    receipts.created_at,
    receipts.ticket_id,
    receipts.tokens_used,
    receipts.sequence,
    receipts.recorded_on_dt,
    receipts.recorded_until_dt
   FROM vision.receipts;


--
-- Name: plan_status; Type: VIEW; Schema: nebula; Owner: -
--

CREATE VIEW nebula.plan_status AS
 SELECT id,
    file_name,
    title,
    project,
    goal,
    content,
    files_affected,
    acceptance_criteria,
    dependencies,
    prompt_ref,
    notes,
    priority,
    created_at,
    updated_at,
    deleted,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type = 'HOLD'::text) AND (NOT (EXISTS ( SELECT 1
                       FROM nebula.receipts_unified r2
                      WHERE ((r2.plan_id = p.id) AND (r2.type = ANY (ARRAY['CANCELLED'::text, 'ABANDONED'::text])) AND (r2.created_at > r.created_at)))))))) THEN 'HOLD'::text
            WHEN (( SELECT r.type
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type <> ALL (ARRAY['PLANNING'::text, 'HOLD'::text])))
              ORDER BY r.created_at DESC
             LIMIT 1) = 'REQUEUED'::text) THEN 'PLAN_CREATE'::text
            WHEN (EXISTS ( SELECT 1
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type = 'REVIEW_PASS'::text) AND (NOT (EXISTS ( SELECT 1
                       FROM nebula.receipts_unified r2
                      WHERE ((r2.plan_id = p.id) AND (r2.type = ANY (ARRAY['BLOCK'::text, 'PLAN_BLOCK'::text, 'CANCELLED'::text, 'ABANDONED'::text])) AND (r2.created_at > r.created_at)))))))) THEN 'REVIEW_PASS'::text
            WHEN (EXISTS ( SELECT 1
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type = 'REVIEW_REJECT'::text)))) THEN COALESCE(( SELECT r.type
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type <> 'BLOCK'::text))
              ORDER BY r.created_at DESC
             LIMIT 1), 'PLAN_CREATE'::text)
            ELSE COALESCE(( SELECT r.type
               FROM nebula.receipts_unified r
              WHERE ((r.plan_id = p.id) AND (r.type <> ALL (ARRAY['PLANNING'::text, 'HOLD'::text])))
              ORDER BY r.created_at DESC
             LIMIT 1), ( SELECT r.type
               FROM nebula.receipts_unified r
              WHERE (r.plan_id = p.id)
              ORDER BY r.created_at DESC
             LIMIT 1), NULL::text)
        END AS derived_status
   FROM nebula.plans p
  WHERE (deleted = 0);


--
-- Name: work_requests_history; Type: TABLE; Schema: nebula; Owner: -
--

CREATE TABLE nebula.work_requests_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    source_specification_id uuid,
    source_requirement_id uuid,
    business_status text DEFAULT 'DRAFT'::text NOT NULL,
    intent text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dco_json text,
    legacy_id text,
    plan_id text,
    step_outputs text DEFAULT '{}'::text NOT NULL,
    consumed_at timestamp with time zone,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT '9999-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT '9999-12-31 00:00:00+00'::timestamp with time zone NOT NULL,
    asset_id uuid,
    entity_key text,
    CONSTRAINT work_requests_business_status_check CHECK ((business_status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'DISPATCHED'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);

ALTER TABLE ONLY nebula.work_requests_history REPLICA IDENTITY FULL;


--
-- Name: TABLE work_requests_history; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON TABLE nebula.work_requests_history IS 'Canonical work request table. Replaces conduit.work_requests as of migration 029.';


--
-- Name: COLUMN work_requests_history.business_status; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.business_status IS 'Business lifecycle state: Should this happen? DRAFT → APPROVED → DISPATCHED → COMPLETED/CANCELLED';


--
-- Name: COLUMN work_requests_history.dco_json; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.dco_json IS 'Decomposition Command Object JSON. The compiled form of the work request.';


--
-- Name: COLUMN work_requests_history.legacy_id; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.legacy_id IS 'Original TEXT ID from conduit.work_requests (e.g., wr-0130-1781781240). Preserved for knowledge graph compatibility.';


--
-- Name: COLUMN work_requests_history.plan_id; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.plan_id IS 'Reference to the implementation plan. Matches conduit.work_requests.plan_id format.';


--
-- Name: COLUMN work_requests_history.step_outputs; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.step_outputs IS 'JSON object tracking outputs from each execution step.';


--
-- Name: COLUMN work_requests_history.consumed_at; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.consumed_at IS 'Idempotency marker for harvest process. NULL = not yet consumed. Set when work request is processed by execution layer.';


--
-- Name: COLUMN work_requests_history.entity_key; Type: COMMENT; Schema: nebula; Owner: -
--

COMMENT ON COLUMN nebula.work_requests_history.entity_key IS 'T22 (T08): deterministic entity identity key emitted at the WRP boundary. NULL = identity-unknown (historical rows, not retroactively computed).';


--
-- Name: work_requests; Type: VIEW; Schema: nebula; Owner: -
--

CREATE VIEW nebula.work_requests AS
 SELECT id,
    title,
    description,
    source_specification_id,
    source_requirement_id,
    business_status,
    intent,
    context,
    constraints,
    created_by,
    created_at,
    updated_at,
    dco_json,
    legacy_id,
    plan_id,
    step_outputs,
    consumed_at,
    valid_from,
    valid_until,
    recorded_on_dt,
    recorded_until_dt,
    asset_id,
    entity_key
   FROM nebula.work_requests_history
  WHERE ((now() >= recorded_on_dt) AND (now() < recorded_until_dt) AND (now() >= valid_from) AND (now() < valid_until));


--
-- Name: tickets; Type: TABLE; Schema: vision; Owner: -
--

CREATE TABLE vision.tickets (
    id text NOT NULL,
    plan_id text NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    session_id text,
    created_by_receipt text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    claimed_at timestamp with time zone,
    closed_at timestamp with time zone,
    token_budget integer,
    tokens_used integer,
    objective text,
    completion_criteria text,
    owner text DEFAULT ''::text NOT NULL,
    parent_ticket_id text,
    spawn_reason text,
    last_activity text,
    expires_at timestamp with time zone,
    deadline timestamp with time zone,
    confidence real,
    closure_reason text,
    replacement_of text,
    recorded_on_dt timestamp with time zone DEFAULT now(),
    recorded_until_dt timestamp with time zone
);

ALTER TABLE ONLY vision.tickets REPLICA IDENTITY FULL;


--
-- Name: circuit_breaker circuit_breaker_pkey; Type: CONSTRAINT; Schema: conduit; Owner: -
--

ALTER TABLE ONLY conduit.circuit_breaker
    ADD CONSTRAINT circuit_breaker_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: conduit; Owner: -
--

ALTER TABLE ONLY conduit.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.attempts
    ADD CONSTRAINT attempts_pkey PRIMARY KEY (id);


--
-- Name: leases leases_pkey; Type: CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.leases
    ADD CONSTRAINT leases_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: requests requests_business_key_key; Type: CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.requests
    ADD CONSTRAINT requests_business_key_key UNIQUE (business_key);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: implementation_plans_history implementation_plans_pkey; Type: CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.implementation_plans_history
    ADD CONSTRAINT implementation_plans_pkey PRIMARY KEY (id);


--
-- Name: specifications_history specifications_pkey; Type: CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.specifications_history
    ADD CONSTRAINT specifications_pkey PRIMARY KEY (id);


--
-- Name: implementation_plans_history uq_implementation_plans_plan_number; Type: CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.implementation_plans_history
    ADD CONSTRAINT uq_implementation_plans_plan_number UNIQUE (plan_number);


--
-- Name: work_requests_history uq_work_requests_entity_key_active; Type: CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.work_requests_history
    ADD CONSTRAINT uq_work_requests_entity_key_active EXCLUDE USING gist (entity_key WITH =, tstzrange(valid_from, valid_until) WITH &&);


--
-- Name: work_requests_history work_requests_pkey; Type: CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.work_requests_history
    ADD CONSTRAINT work_requests_pkey PRIMARY KEY (id);


--
-- Name: canonical_asset canonical_asset_pkey; Type: CONSTRAINT; Schema: semantics; Owner: -
--

ALTER TABLE ONLY semantics.canonical_asset
    ADD CONSTRAINT canonical_asset_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: vision; Owner: -
--

ALTER TABLE ONLY vision.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: vision; Owner: -
--

ALTER TABLE ONLY vision.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: idx_execution_attempts_lease; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_attempts_lease ON execution.attempts USING btree (lease_id);


--
-- Name: idx_execution_attempts_request; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_attempts_request ON execution.attempts USING btree (request_id);


--
-- Name: idx_execution_attempts_status; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_attempts_status ON execution.attempts USING btree (status);


--
-- Name: idx_execution_leases_active_per_request; Type: INDEX; Schema: execution; Owner: -
--

CREATE UNIQUE INDEX idx_execution_leases_active_per_request ON execution.leases USING btree (request_id) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_execution_leases_executor; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_leases_executor ON execution.leases USING btree (executor_id);


--
-- Name: idx_execution_leases_request; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_leases_request ON execution.leases USING btree (request_id);


--
-- Name: idx_execution_receipts_attempt; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_receipts_attempt ON execution.receipts USING btree (attempt_id);


--
-- Name: idx_execution_receipts_conduit_lineage; Type: INDEX; Schema: execution; Owner: -
--

CREATE UNIQUE INDEX idx_execution_receipts_conduit_lineage ON execution.receipts USING btree (lineage_original_id) WHERE (lineage_source = 'conduit'::text);


--
-- Name: idx_execution_receipts_issued_at_id; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_receipts_issued_at_id ON execution.receipts USING btree (issued_at DESC, id DESC);


--
-- Name: idx_execution_receipts_request; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_receipts_request ON execution.receipts USING btree (request_id);


--
-- Name: idx_execution_receipts_type; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_receipts_type ON execution.receipts USING btree (type);


--
-- Name: idx_execution_requests_source_plan; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_requests_source_plan ON execution.requests USING btree (source_plan_id) WHERE (source_plan_id IS NOT NULL);


--
-- Name: idx_execution_requests_source_wr; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_requests_source_wr ON execution.requests USING btree (source_wr_id) WHERE (source_wr_id IS NOT NULL);


--
-- Name: idx_execution_requests_status; Type: INDEX; Schema: execution; Owner: -
--

CREATE INDEX idx_execution_requests_status ON execution.requests USING btree (status);


--
-- Name: idx_implementation_plans_history_updated_at_id; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_implementation_plans_history_updated_at_id ON nebula.implementation_plans_history USING btree (updated_at DESC, id DESC);


--
-- Name: idx_work_requests_business_status; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_work_requests_business_status ON nebula.work_requests_history USING btree (business_status);


--
-- Name: idx_work_requests_consumed_at; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_work_requests_consumed_at ON nebula.work_requests_history USING btree (consumed_at) WHERE (consumed_at IS NULL);


--
-- Name: idx_work_requests_history_entity_key; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_work_requests_history_entity_key ON nebula.work_requests_history USING btree (entity_key) WHERE (entity_key IS NOT NULL);


--
-- Name: idx_work_requests_legacy_id; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_work_requests_legacy_id ON nebula.work_requests_history USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: idx_work_requests_plan_id; Type: INDEX; Schema: nebula; Owner: -
--

CREATE INDEX idx_work_requests_plan_id ON nebula.work_requests_history USING btree (plan_id) WHERE (plan_id IS NOT NULL);


--
-- Name: idx_canonical_asset_active_canonical_asset_id; Type: INDEX; Schema: semantics; Owner: -
--

CREATE UNIQUE INDEX idx_canonical_asset_active_canonical_asset_id ON semantics.canonical_asset USING btree (canonical_asset_id) WHERE (expired_at IS NULL);


--
-- Name: idx_receipts_plan_sequence; Type: INDEX; Schema: vision; Owner: -
--

CREATE UNIQUE INDEX idx_receipts_plan_sequence ON vision.receipts USING btree (plan_id, sequence);


--
-- Name: idx_vision_tickets_open; Type: INDEX; Schema: vision; Owner: -
--

CREATE UNIQUE INDEX idx_vision_tickets_open ON vision.tickets USING btree (plan_id, role) WHERE (status = 'open'::text);


--
-- Name: attempts trg_attempt_lease_consistency; Type: TRIGGER; Schema: execution; Owner: -
--

CREATE TRIGGER trg_attempt_lease_consistency BEFORE INSERT OR UPDATE ON execution.attempts FOR EACH ROW EXECUTE FUNCTION execution.check_attempt_lease_consistency();


--
-- Name: requests trg_execution_requests_updated_at; Type: TRIGGER; Schema: execution; Owner: -
--

CREATE TRIGGER trg_execution_requests_updated_at BEFORE UPDATE ON execution.requests FOR EACH ROW EXECUTE FUNCTION execution.set_updated_at();


--
-- Name: receipts trg_receipt_governance; Type: TRIGGER; Schema: execution; Owner: -
--

CREATE TRIGGER trg_receipt_governance AFTER INSERT ON execution.receipts FOR EACH ROW EXECUTE FUNCTION execution.receipt_governance_trigger();


--
-- Name: receipts trg_receipts_immutable; Type: TRIGGER; Schema: execution; Owner: -
--

CREATE TRIGGER trg_receipts_immutable BEFORE DELETE OR UPDATE ON execution.receipts FOR EACH ROW EXECUTE FUNCTION execution.receipts_immutable_guard();


--
-- Name: receipts trg_receipts_assign_sequence; Type: TRIGGER; Schema: vision; Owner: -
--

CREATE TRIGGER trg_receipts_assign_sequence BEFORE INSERT ON vision.receipts FOR EACH ROW EXECUTE FUNCTION vision.receipts_assign_sequence();


--
-- Name: attempts attempts_lease_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.attempts
    ADD CONSTRAINT attempts_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES execution.leases(id);


--
-- Name: attempts attempts_request_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.attempts
    ADD CONSTRAINT attempts_request_id_fkey FOREIGN KEY (request_id) REFERENCES execution.requests(id);


--
-- Name: leases leases_request_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.leases
    ADD CONSTRAINT leases_request_id_fkey FOREIGN KEY (request_id) REFERENCES execution.requests(id);


--
-- Name: receipts receipts_attempt_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.receipts
    ADD CONSTRAINT receipts_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES execution.attempts(id);


--
-- Name: receipts receipts_request_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.receipts
    ADD CONSTRAINT receipts_request_id_fkey FOREIGN KEY (request_id) REFERENCES execution.requests(id);


--
-- Name: requests requests_source_wr_id_fkey; Type: FK CONSTRAINT; Schema: execution; Owner: -
--

ALTER TABLE ONLY execution.requests
    ADD CONSTRAINT requests_source_wr_id_fkey FOREIGN KEY (source_wr_id) REFERENCES nebula.work_requests_history(id) ON DELETE SET NULL;


--
-- Name: work_requests_history fk_work_requests_plan; Type: FK CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.work_requests_history
    ADD CONSTRAINT fk_work_requests_plan FOREIGN KEY (plan_id) REFERENCES nebula.implementation_plans_history(plan_number);


--
-- Name: work_requests_history fk_work_requests_specification; Type: FK CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.work_requests_history
    ADD CONSTRAINT fk_work_requests_specification FOREIGN KEY (source_specification_id) REFERENCES nebula.specifications_history(id);


--
-- Name: implementation_plans_history implementation_plans_history_asset_id_fkey; Type: FK CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.implementation_plans_history
    ADD CONSTRAINT implementation_plans_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES semantics.canonical_asset(id);


--
-- Name: work_requests_history work_requests_history_asset_id_fkey; Type: FK CONSTRAINT; Schema: nebula; Owner: -
--

ALTER TABLE ONLY nebula.work_requests_history
    ADD CONSTRAINT work_requests_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES semantics.canonical_asset(id);


--
-- PostgreSQL database dump complete
--

\unrestrict mmdfxYziexDehSNwGq9lKTEx0u31g3QCh2goPOE8pAn4ZqXW7dgJudQPwi50S4G

