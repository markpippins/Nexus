--
-- PostgreSQL database dump
--

\restrict 1PMjF1LDXBr9sR76k3W7rAPcPg9Swkj8sMyVemL12DF87sw2MvdeR78pb6h2TQi

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: resolution; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA resolution;


--
-- Name: SCHEMA resolution; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA resolution IS 'SOL sandbox: greenfield redevelopment of semantics + selected nebula domain tables. Zero blast radius to production.';


--
-- Name: check_expression_acyclic(); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_expression_acyclic() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_would_cycle boolean;
BEGIN
    -- would this edge (parent -> child) create a cycle? true iff parent
    -- is already reachable FROM child via existing edges.
    WITH RECURSIVE reachable(id) AS (
        SELECT NEW.child_expression_id
        UNION
        SELECT eo.child_expression_id
        FROM resolution.expression_operand eo
        JOIN reachable r ON eo.parent_expression_id = r.id
    )
    SELECT EXISTS (SELECT 1 FROM reachable WHERE id = NEW.parent_expression_id)
    INTO v_would_cycle;

    IF v_would_cycle THEN
        RAISE EXCEPTION 'expression_operand: edge % -> % would create a cycle',
            NEW.parent_expression_id, NEW.child_expression_id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: compile_condition(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.compile_condition(expr_id uuid, current_alias text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind          text;
    v_operator      text;
    v_literal       text;
    v_attr_id       uuid;
    v_function_name text;
    v_binding       resolution.concept_attribute_binding%ROWTYPE;
    v_fn_binding    resolution.function_binding%ROWTYPE;
    v_left_id       uuid;
    v_right_id      uuid;
    v_args          text[];
BEGIN
    SELECT kind, operator, literal_value, attribute_id, function_name
    INTO v_kind, v_operator, v_literal, v_attr_id, v_function_name
    FROM resolution.expression WHERE id = expr_id;

    IF v_kind = 'literal' THEN
        RETURN quote_literal(v_literal);

    ELSIF v_kind = 'attribute_ref' THEN
        SELECT * INTO v_binding FROM resolution.concept_attribute_binding WHERE attribute_id = v_attr_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'no concept_attribute_binding for attribute %', v_attr_id;
        END IF;
        RETURN format('%I.%I', current_alias, v_binding.column_name);

    ELSIF v_kind = 'relationship_ref' THEN
        -- was: format('%I.id', current_alias) -- wrong whenever the next
        -- hop's correlation column isn't the current table's own PK.
        RETURN resolution.compile_exists_chain(expr_id, resolution.correlation_ref(current_alias, expr_id));

    ELSIF v_kind = 'function_call' THEN
        SELECT * INTO v_fn_binding FROM resolution.function_binding WHERE function_name = v_function_name;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'no function_binding for function_name %', v_function_name;
        END IF;

        SELECT array_agg(resolution.compile_condition(eo.child_expression_id, current_alias) ORDER BY eo.position)
        INTO v_args
        FROM resolution.expression_operand eo WHERE eo.parent_expression_id = expr_id;

        IF coalesce(array_length(v_args, 1), 0) <> v_fn_binding.arg_count THEN
            RAISE EXCEPTION 'function % expects % arg(s), got %',
                v_function_name, v_fn_binding.arg_count, coalesce(array_length(v_args, 1), 0);
        END IF;

        RETURN format(v_fn_binding.sql_template, VARIADIC v_args);

    ELSIF v_kind = 'operator' THEN
        SELECT child_expression_id INTO v_left_id  FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 1;
        SELECT child_expression_id INTO v_right_id FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 2;
        IF v_left_id IS NULL OR v_right_id IS NULL THEN
            RAISE EXCEPTION 'operator node % missing an operand', expr_id;
        END IF;
        RETURN format('(%s %s %s)',
            resolution.compile_condition(v_left_id, current_alias),
            v_operator,
            resolution.compile_condition(v_right_id, current_alias)
        );

    ELSE
        RAISE EXCEPTION 'compile_condition does not support kind %', v_kind;
    END IF;
END;
$$;


--
-- Name: compile_count_scalar(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.compile_count_scalar(expr_id uuid, parent_ref text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_crid      uuid;
    v_binding   resolution.concept_relationship_binding%ROWTYPE;
    v_alias     text;
    v_child_id  uuid;
    v_child_sql text;
BEGIN
    SELECT concept_relationship_id INTO v_crid FROM resolution.expression WHERE id = expr_id;

    SELECT * INTO v_binding
    FROM resolution.concept_relationship_binding WHERE concept_relationship_id = v_crid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no concept_relationship_binding for concept_relationship %', v_crid;
    END IF;

    v_alias := 't_' || replace(expr_id::text, '-', '');

    SELECT child_expression_id INTO v_child_id
    FROM resolution.expression_operand WHERE parent_expression_id = expr_id ORDER BY position LIMIT 1;

    IF v_child_id IS NOT NULL THEN
        v_child_sql := resolution.compile_condition(v_child_id, v_alias);
    ELSE
        v_child_sql := 'TRUE';
    END IF;

    RETURN format(
        '(SELECT count(*) FROM %I.%I %I WHERE %I.%I = %s AND (%s))',
        v_binding.to_schema, v_binding.to_table, v_alias,
        v_alias, v_binding.to_column, parent_ref, v_child_sql
    );
END;
$$;


--
-- Name: compile_exists_chain(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.compile_exists_chain(expr_id uuid, parent_ref text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind        text;
    v_crid        uuid;
    v_quantifier  text;
    v_binding     resolution.concept_relationship_binding%ROWTYPE;
    v_alias       text;
    v_child_id    uuid;
    v_child_sql   text;
BEGIN
    SELECT kind, concept_relationship_id, quantifier INTO v_kind, v_crid, v_quantifier
    FROM resolution.expression WHERE id = expr_id;

    IF v_kind IS NULL THEN
        RAISE EXCEPTION 'no expression row for id %', expr_id;
    ELSIF v_kind <> 'relationship_ref' THEN
        RAISE EXCEPTION 'compile_exists_chain only supports relationship_ref nodes, got % for %', v_kind, expr_id;
    END IF;

    SELECT * INTO v_binding
    FROM resolution.concept_relationship_binding WHERE concept_relationship_id = v_crid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no concept_relationship_binding for concept_relationship %', v_crid;
    END IF;

    v_alias := 't_' || replace(expr_id::text, '-', '');

    SELECT child_expression_id INTO v_child_id
    FROM resolution.expression_operand
    WHERE parent_expression_id = expr_id
    ORDER BY position LIMIT 1;

    IF v_child_id IS NOT NULL THEN
        v_child_sql := resolution.compile_condition(v_child_id, v_alias);
    ELSE
        v_child_sql := 'TRUE';
    END IF;

    IF v_quantifier = 'EXISTS' THEN
        RETURN format(
            'EXISTS (SELECT 1 FROM %I.%I %I WHERE %I.%I = %s AND (%s))',
            v_binding.to_schema, v_binding.to_table, v_alias,
            v_alias, v_binding.to_column, parent_ref, v_child_sql
        );
    ELSIF v_quantifier = 'ALL' THEN
        -- universal quantification: no matching row may VIOLATE the
        -- condition. Vacuously true when there are no matching rows at all
        -- (e.g. a leaf requirement with no children).
        RETURN format(
            'NOT EXISTS (SELECT 1 FROM %I.%I %I WHERE %I.%I = %s AND NOT (%s))',
            v_binding.to_schema, v_binding.to_table, v_alias,
            v_alias, v_binding.to_column, parent_ref, v_child_sql
        );
    ELSE
        RAISE EXCEPTION 'quantifier % not implemented (COUNT still unimplemented)', v_quantifier;
    END IF;
END;
$$;


--
-- Name: compile_root(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.compile_root(expr_id uuid, literal_root_ref text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind       text;
    v_quantifier text;
    v_operator   text;
    v_literal    text;
    v_left_id    uuid;
    v_right_id   uuid;
BEGIN
    SELECT kind, quantifier, operator, literal_value INTO v_kind, v_quantifier, v_operator, v_literal
    FROM resolution.expression WHERE id = expr_id;

    IF v_kind = 'relationship_ref' THEN
        IF v_quantifier IN ('EXISTS', 'ALL') THEN
            RETURN resolution.compile_exists_chain(expr_id, literal_root_ref);
        ELSIF v_quantifier = 'COUNT' THEN
            RETURN resolution.compile_count_scalar(expr_id, literal_root_ref);
        ELSE
            RAISE EXCEPTION 'unknown quantifier %', v_quantifier;
        END IF;

    ELSIF v_kind = 'operator' THEN
        SELECT child_expression_id INTO v_left_id  FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 1;
        SELECT child_expression_id INTO v_right_id FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 2;
        -- each side of the root operator gets the SAME literal root ref --
        -- we're still above any table alias at this level.
        RETURN format('(%s %s %s)',
            resolution.compile_root(v_left_id, literal_root_ref),
            v_operator,
            resolution.compile_root(v_right_id, literal_root_ref)
        );

    ELSIF v_kind = 'literal' THEN
        RETURN quote_literal(v_literal);

    ELSE
        RAISE EXCEPTION 'compile_root: unsupported root-level kind % (attribute_ref has no meaning with no table in scope)', v_kind;
    END IF;
END;
$$;


--
-- Name: correlation_ref(text, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.correlation_ref(current_alias text, child_expr_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_kind        text;
    v_crid        uuid;
    v_from_column text;
BEGIN
    SELECT kind, concept_relationship_id INTO v_kind, v_crid
    FROM resolution.expression WHERE id = child_expr_id;

    IF v_kind IS DISTINCT FROM 'relationship_ref' THEN
        RAISE EXCEPTION 'correlation_ref only applies to a relationship_ref child, got % for %', v_kind, child_expr_id;
    END IF;

    SELECT from_column INTO v_from_column
    FROM resolution.concept_relationship_binding WHERE concept_relationship_id = v_crid;
    IF v_from_column IS NULL THEN
        RAISE EXCEPTION 'no concept_relationship_binding for concept_relationship %', v_crid;
    END IF;

    RETURN format('%I.%I', current_alias, v_from_column);
END;
$$;


--
-- Name: evaluate_relationship_guard(uuid, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.evaluate_relationship_guard(expr_id uuid, root_instance_id uuid) RETURNS TABLE(compiled_sql text, result boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sql text;
    v_result boolean;
BEGIN
    v_sql := resolution.compile_root(expr_id, quote_literal(root_instance_id::text));
    EXECUTE format('SELECT %s', v_sql) INTO v_result;
    RETURN QUERY SELECT v_sql, v_result;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assessment; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.assessment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    observation_id uuid NOT NULL,
    outcome text NOT NULL,
    confidence numeric(4,3),
    impact_scope jsonb DEFAULT '{}'::jsonb NOT NULL,
    analysis_detail text,
    rationale jsonb,
    dimensions_used integer,
    dimensions_total integer,
    agenda_id uuid,
    auto_resolve_plan_id uuid,
    forum_post_id uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT assessment_outcome_check CHECK ((outcome = ANY (ARRAY['informational'::text, 'recommendation'::text, 'needs_deliberation'::text, 'policy_blocked'::text, 'auto_resolved'::text, 'rejected'::text])))
);


--
-- Name: candidate; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.candidate (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    harvest_id uuid NOT NULL,
    title text NOT NULL,
    intent_description text,
    implementation_notes jsonb DEFAULT '[]'::jsonb NOT NULL,
    code_snippets jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text,
    type text DEFAULT 'requirement'::text NOT NULL,
    design_rationale jsonb DEFAULT '[]'::jsonb NOT NULL,
    compilation_readiness numeric(4,3),
    completed boolean DEFAULT false NOT NULL,
    needs_new_node boolean DEFAULT false NOT NULL,
    proposed_parent text,
    proposed_name text,
    placement_reason text,
    system_id uuid,
    subsystem_id uuid,
    feature_id uuid,
    work_request_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT candidate_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['pending'::text, 'linked'::text, 'useful'::text, 'rejected'::text, 'promoted'::text, 'superseded'::text])))),
    CONSTRAINT candidate_type_check CHECK ((type = ANY (ARRAY['requirement'::text, 'principle'::text, 'rejected_alternative'::text, 'tension'::text, 'rationale'::text, 'mixed'::text])))
);


--
-- Name: candidate_segment_set; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.candidate_segment_set (
    candidate_id uuid NOT NULL,
    segment_set_id uuid NOT NULL,
    role text DEFAULT 'primary'::text NOT NULL,
    CONSTRAINT candidate_segment_set_role_check CHECK ((role = ANY (ARRAY['primary'::text, 'supporting'::text])))
);


--
-- Name: candidate_source_chunk; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.candidate_source_chunk (
    candidate_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: canonical_asset; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.canonical_asset (
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
-- Name: concept; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: concept_attribute; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_attribute (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concept_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    value_type text NOT NULL,
    is_state_attribute boolean DEFAULT false NOT NULL
);


--
-- Name: concept_attribute_binding; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_attribute_binding (
    attribute_id uuid NOT NULL,
    schema_name text NOT NULL,
    table_name text NOT NULL,
    column_name text NOT NULL
);


--
-- Name: concept_attribute_value; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_attribute_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attribute_id uuid NOT NULL,
    value text NOT NULL,
    description text
);


--
-- Name: concept_relationship; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_relationship (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_concept_id uuid NOT NULL,
    to_concept_id uuid NOT NULL,
    relationship_type text NOT NULL,
    path text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: concept_relationship_binding; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_relationship_binding (
    concept_relationship_id uuid NOT NULL,
    from_schema text NOT NULL,
    from_table text NOT NULL,
    from_column text NOT NULL,
    to_schema text NOT NULL,
    to_table text NOT NULL,
    to_column text NOT NULL,
    notes text
);


--
-- Name: concept_state_transition; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.concept_state_transition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concept_id uuid NOT NULL,
    from_value_id uuid,
    to_value_id uuid NOT NULL,
    name text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: consumer_operation; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.consumer_operation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    representation_id uuid NOT NULL,
    consumer_name text NOT NULL,
    operation text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: expression; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.expression (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    operator text,
    literal_value text,
    attribute_id uuid,
    function_name text,
    return_type text NOT NULL,
    label text,
    concept_relationship_id uuid,
    quantifier text,
    CONSTRAINT expression_kind_check CHECK ((kind = ANY (ARRAY['literal'::text, 'attribute_ref'::text, 'operator'::text, 'function_call'::text, 'relationship_ref'::text]))),
    CONSTRAINT expression_quantifier_check CHECK (((quantifier IS NULL) OR (quantifier = ANY (ARRAY['EXISTS'::text, 'ALL'::text, 'COUNT'::text]))))
);


--
-- Name: expression_operand; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.expression_operand (
    parent_expression_id uuid NOT NULL,
    child_expression_id uuid NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT expression_operand_check CHECK ((parent_expression_id <> child_expression_id))
);


--
-- Name: function_binding; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.function_binding (
    function_name text NOT NULL,
    sql_template text NOT NULL,
    arg_count integer NOT NULL,
    return_type text NOT NULL,
    notes text
);


--
-- Name: harvest; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.harvest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    source_path text NOT NULL,
    source_filename text DEFAULT ''::text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    total_candidates integer DEFAULT 0 NOT NULL,
    source_text text,
    docklang jsonb,
    source_hash text,
    version integer DEFAULT 1 NOT NULL,
    run_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    file_size bigint,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    visibility_scope text DEFAULT 'all'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT harvest_level_check CHECK (((level >= 1) AND (level <= 4)))
);


--
-- Name: identity_strategy; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.identity_strategy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concept_id uuid NOT NULL,
    canonical_key_description text NOT NULL,
    notes text
);


--
-- Name: implementation_plan; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.implementation_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    plan_number text,
    specification_id uuid,
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
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT implementation_plan_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'work_requested'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: observation; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.observation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_type text NOT NULL,
    asset_concept_id uuid,
    source_artifact_id uuid,
    predicate_type text,
    predicate_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    assessed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT observation_predicate_type_check CHECK (((predicate_type IS NULL) OR (predicate_type = ANY (ARRAY['concept_attribute'::text, 'concept_relationship'::text, 'expression'::text]))))
);


--
-- Name: TABLE observation; Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON TABLE resolution.observation IS 'predicate_type now includes expression: a candidate rejection reason can point directly at the SOL IR expression node that failed, not just a concept_attribute/concept_relationship.';


--
-- Name: observation_source_chunk; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.observation_source_chunk (
    observation_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: open_question; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.open_question (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    blocking boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    category_value_id uuid,
    status_value_id uuid,
    assessment_id uuid
);


--
-- Name: TABLE open_question; Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON TABLE resolution.open_question IS 'Ported from nebula.open_questions_history. category/status REPLACED by governed concept_attribute_value + concept_state_transition (real lifecycle: OPEN -> IN_DELIBERATION -> RESOLVED/WONT_FIX/DEFERRED, instead of a flat CHECK). requirement_id/candidate_id direct columns DROPPED — that was drift, duplicating open_question_entities; all linkage now goes through open_question_entity, the same predicate-reference pattern used on observation.';


--
-- Name: open_question_answer; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.open_question_answer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    role text NOT NULL,
    answer text NOT NULL,
    confidence text DEFAULT 'MEDIUM'::text,
    reasoning text,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL
);


--
-- Name: open_question_entity; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.open_question_entity (
    open_question_id uuid NOT NULL,
    asset_concept_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL
);


--
-- Name: owning_subsystem; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.owning_subsystem (
    id smallint NOT NULL,
    name text NOT NULL,
    description text
);


--
-- Name: representation; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.representation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concept_id uuid NOT NULL,
    label text NOT NULL,
    schema_name text,
    table_name text,
    owning_subsystem_id smallint,
    owner text,
    raw_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: representation_identity; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.representation_identity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    representation_id uuid NOT NULL,
    identity_strategy_id uuid NOT NULL,
    identity_expression text NOT NULL,
    notes text
);


--
-- Name: representation_relationship; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.representation_relationship (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_representation_id uuid NOT NULL,
    to_representation_id uuid NOT NULL,
    relationship_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone,
    CONSTRAINT representation_relationship_check CHECK ((from_representation_id <> to_representation_id))
);


--
-- Name: requirement; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.requirement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    candidate_id uuid,
    parent_id uuid,
    source_type text NOT NULL,
    system_id uuid,
    subsystem_id uuid,
    feature_id uuid,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'Backlog'::text NOT NULL,
    priority text DEFAULT 'Medium'::text NOT NULL,
    req_type text,
    compilation_status text DEFAULT 'draft'::text NOT NULL,
    sol_ir_expression_id uuid,
    start_date text,
    completion_date text,
    acceptance_criteria jsonb DEFAULT '[]'::jsonb,
    conduit_plan_id character varying(32),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT requirement_check CHECK (((source_type = 'candidate'::text) OR (candidate_id IS NULL))),
    CONSTRAINT requirement_compilation_status_check CHECK ((compilation_status = ANY (ARRAY['draft'::text, 'compiled'::text, 'rejected'::text]))),
    CONSTRAINT requirement_priority_check CHECK ((priority = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text]))),
    CONSTRAINT requirement_req_type_check CHECK (((req_type IS NULL) OR (req_type = ANY (ARRAY['Epic'::text, 'Story'::text, 'Task'::text, 'Bug'::text])))),
    CONSTRAINT requirement_source_type_check CHECK ((source_type = ANY (ARRAY['candidate'::text, 'manual'::text]))),
    CONSTRAINT requirement_status_check CHECK ((status = ANY (ARRAY['Backlog'::text, 'ToDo'::text, 'InProgress'::text, 'Active'::text, 'Blocked'::text, 'Done'::text, 'Cancelled'::text, 'Accepted'::text])))
);


--
-- Name: requirement_segment_set; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.requirement_segment_set (
    requirement_id uuid NOT NULL,
    segment_set_id uuid NOT NULL,
    role text DEFAULT 'primary'::text NOT NULL,
    CONSTRAINT requirement_segment_set_role_check CHECK ((role = ANY (ARRAY['primary'::text, 'supporting'::text])))
);


--
-- Name: rule; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.rule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    rule_type text NOT NULL,
    expression_id uuid,
    severity text DEFAULT 'hard'::text NOT NULL,
    concept_id uuid,
    concept_relationship_id uuid,
    representation_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expired_at timestamp with time zone,
    state_transition_id uuid,
    CONSTRAINT rule_check CHECK (((((((concept_id IS NOT NULL))::integer + ((concept_relationship_id IS NOT NULL))::integer) + ((representation_id IS NOT NULL))::integer) + ((state_transition_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT rule_rule_type_check CHECK ((rule_type = ANY (ARRAY['invariant'::text, 'guard'::text, 'conditional'::text, 'derivation'::text]))),
    CONSTRAINT rule_severity_check CHECK ((severity = ANY (ARRAY['hard'::text, 'soft'::text])))
);


--
-- Name: specification; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.specification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    requirement_id uuid,
    agenda_id uuid NOT NULL,
    revision_number integer NOT NULL,
    revision_type text NOT NULL,
    superseded_by uuid,
    item_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    change_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT specification_revision_type_check CHECK ((revision_type = ANY (ARRAY['created'::text, 'revised'::text, 'merged'::text, 'split'::text, 'retired'::text])))
);


--
-- Name: TABLE specification; Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON TABLE resolution.specification IS 'Ported from nebula.specifications_history. derived_from uuid[] REPLACED by resolution.specification_lineage — merge/split lineage is a DAG and wants to be queried relationally (same reasoning as candidate_source_chunk).';


--
-- Name: specification_lineage; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.specification_lineage (
    specification_id uuid NOT NULL,
    derived_from_id uuid NOT NULL,
    CONSTRAINT specification_lineage_check CHECK ((specification_id <> derived_from_id))
);


--
-- Name: verified_statement; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.verified_statement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    answer_id uuid NOT NULL,
    expression_id uuid NOT NULL,
    asset_concept_id uuid NOT NULL,
    target_asset_id uuid NOT NULL,
    verified_by text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: TABLE verified_statement; Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON TABLE resolution.verified_statement IS 'The compile step. A verified answer becomes an asserted SOL IR fact about target_asset_id — this is what closes the loop back to expression/predicate_type=''expression'' on observation.';


--
-- Name: work_request; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.work_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid,
    title text NOT NULL,
    description text,
    source_specification_id uuid,
    source_requirement_id uuid,
    business_status text DEFAULT 'DRAFT'::text NOT NULL,
    intent text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    dco_json text,
    legacy_id text,
    plan_id text,
    step_outputs text DEFAULT '{}'::text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT work_request_business_status_check CHECK ((business_status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'DISPATCHED'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: work_request_edge; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.work_request_edge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_work_request_id uuid NOT NULL,
    child_work_request_id uuid NOT NULL,
    edge_type text DEFAULT 'depends_on'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    CONSTRAINT work_request_edge_check CHECK ((parent_work_request_id <> child_work_request_id))
);


--
-- Name: TABLE work_request_edge; Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON TABLE resolution.work_request_edge IS 'Ported from vision.work_request_edges_history. parent = upstream/prerequisite, child = downstream/dependent, matching vision''s own work_request_dag traversal direction. Only ''depends_on'' is a confirmed edge_type from the DDL alone -- others may exist in production and are not invented here.';


--
-- Name: assessment assessment_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.assessment
    ADD CONSTRAINT assessment_pkey PRIMARY KEY (id);


--
-- Name: candidate candidate_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate
    ADD CONSTRAINT candidate_pkey PRIMARY KEY (id);


--
-- Name: candidate_segment_set candidate_segment_set_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate_segment_set
    ADD CONSTRAINT candidate_segment_set_pkey PRIMARY KEY (candidate_id, segment_set_id);


--
-- Name: candidate_source_chunk candidate_source_chunk_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate_source_chunk
    ADD CONSTRAINT candidate_source_chunk_pkey PRIMARY KEY (candidate_id, chunk_id);


--
-- Name: canonical_asset canonical_asset_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.canonical_asset
    ADD CONSTRAINT canonical_asset_pkey PRIMARY KEY (id);


--
-- Name: concept_attribute_binding concept_attribute_binding_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute_binding
    ADD CONSTRAINT concept_attribute_binding_pkey PRIMARY KEY (attribute_id);


--
-- Name: concept_attribute concept_attribute_concept_id_name_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute
    ADD CONSTRAINT concept_attribute_concept_id_name_key UNIQUE (concept_id, name);


--
-- Name: concept_attribute concept_attribute_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute
    ADD CONSTRAINT concept_attribute_pkey PRIMARY KEY (id);


--
-- Name: concept_attribute_value concept_attribute_value_attribute_id_value_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute_value
    ADD CONSTRAINT concept_attribute_value_attribute_id_value_key UNIQUE (attribute_id, value);


--
-- Name: concept_attribute_value concept_attribute_value_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute_value
    ADD CONSTRAINT concept_attribute_value_pkey PRIMARY KEY (id);


--
-- Name: concept concept_name_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept
    ADD CONSTRAINT concept_name_key UNIQUE (name);


--
-- Name: concept concept_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept
    ADD CONSTRAINT concept_pkey PRIMARY KEY (id);


--
-- Name: concept_relationship_binding concept_relationship_binding_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_relationship_binding
    ADD CONSTRAINT concept_relationship_binding_pkey PRIMARY KEY (concept_relationship_id);


--
-- Name: concept_relationship concept_relationship_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_relationship
    ADD CONSTRAINT concept_relationship_pkey PRIMARY KEY (id);


--
-- Name: concept_state_transition concept_state_transition_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_state_transition
    ADD CONSTRAINT concept_state_transition_pkey PRIMARY KEY (id);


--
-- Name: consumer_operation consumer_operation_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.consumer_operation
    ADD CONSTRAINT consumer_operation_pkey PRIMARY KEY (id);


--
-- Name: expression_operand expression_operand_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression_operand
    ADD CONSTRAINT expression_operand_pkey PRIMARY KEY (parent_expression_id, "position");


--
-- Name: expression expression_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression
    ADD CONSTRAINT expression_pkey PRIMARY KEY (id);


--
-- Name: function_binding function_binding_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.function_binding
    ADD CONSTRAINT function_binding_pkey PRIMARY KEY (function_name);


--
-- Name: harvest harvest_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.harvest
    ADD CONSTRAINT harvest_pkey PRIMARY KEY (id);


--
-- Name: identity_strategy identity_strategy_concept_id_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.identity_strategy
    ADD CONSTRAINT identity_strategy_concept_id_key UNIQUE (concept_id);


--
-- Name: identity_strategy identity_strategy_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.identity_strategy
    ADD CONSTRAINT identity_strategy_pkey PRIMARY KEY (id);


--
-- Name: implementation_plan implementation_plan_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.implementation_plan
    ADD CONSTRAINT implementation_plan_pkey PRIMARY KEY (id);


--
-- Name: implementation_plan implementation_plan_plan_number_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.implementation_plan
    ADD CONSTRAINT implementation_plan_plan_number_key UNIQUE (plan_number);


--
-- Name: observation observation_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.observation
    ADD CONSTRAINT observation_pkey PRIMARY KEY (id);


--
-- Name: observation_source_chunk observation_source_chunk_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.observation_source_chunk
    ADD CONSTRAINT observation_source_chunk_pkey PRIMARY KEY (observation_id, chunk_id);


--
-- Name: open_question_answer open_question_answer_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question_answer
    ADD CONSTRAINT open_question_answer_pkey PRIMARY KEY (id);


--
-- Name: open_question_entity open_question_entity_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question_entity
    ADD CONSTRAINT open_question_entity_pkey PRIMARY KEY (open_question_id, asset_concept_id, entity_id);


--
-- Name: open_question open_question_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question
    ADD CONSTRAINT open_question_pkey PRIMARY KEY (id);


--
-- Name: owning_subsystem owning_subsystem_name_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.owning_subsystem
    ADD CONSTRAINT owning_subsystem_name_key UNIQUE (name);


--
-- Name: owning_subsystem owning_subsystem_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.owning_subsystem
    ADD CONSTRAINT owning_subsystem_pkey PRIMARY KEY (id);


--
-- Name: representation_identity representation_identity_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_identity
    ADD CONSTRAINT representation_identity_pkey PRIMARY KEY (id);


--
-- Name: representation_identity representation_identity_representation_id_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_identity
    ADD CONSTRAINT representation_identity_representation_id_key UNIQUE (representation_id);


--
-- Name: representation representation_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation
    ADD CONSTRAINT representation_pkey PRIMARY KEY (id);


--
-- Name: representation_relationship representation_relationship_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_relationship
    ADD CONSTRAINT representation_relationship_pkey PRIMARY KEY (id);


--
-- Name: requirement requirement_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement
    ADD CONSTRAINT requirement_pkey PRIMARY KEY (id);


--
-- Name: requirement_segment_set requirement_segment_set_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement_segment_set
    ADD CONSTRAINT requirement_segment_set_pkey PRIMARY KEY (requirement_id, segment_set_id);


--
-- Name: rule rule_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_pkey PRIMARY KEY (id);


--
-- Name: specification_lineage specification_lineage_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification_lineage
    ADD CONSTRAINT specification_lineage_pkey PRIMARY KEY (specification_id, derived_from_id);


--
-- Name: specification specification_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification
    ADD CONSTRAINT specification_pkey PRIMARY KEY (id);


--
-- Name: verified_statement verified_statement_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.verified_statement
    ADD CONSTRAINT verified_statement_pkey PRIMARY KEY (id);


--
-- Name: work_request_edge work_request_edge_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request_edge
    ADD CONSTRAINT work_request_edge_pkey PRIMARY KEY (id);


--
-- Name: work_request work_request_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request
    ADD CONSTRAINT work_request_pkey PRIMARY KEY (id);


--
-- Name: idx_canonical_asset_active_canonical_asset_id; Type: INDEX; Schema: resolution; Owner: -
--

CREATE UNIQUE INDEX idx_canonical_asset_active_canonical_asset_id ON resolution.canonical_asset USING btree (canonical_asset_id) WHERE (expired_at IS NULL);


--
-- Name: idx_oq_entity_concept_id; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_oq_entity_concept_id ON resolution.open_question_entity USING btree (asset_concept_id, entity_id);


--
-- Name: idx_oqa_question; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_oqa_question ON resolution.open_question_answer USING btree (question_id);


--
-- Name: idx_oqa_question_role; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_oqa_question_role ON resolution.open_question_answer USING btree (question_id, role);


--
-- Name: idx_resolution_requirement_parent; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_requirement_parent ON resolution.requirement USING btree (parent_id) WHERE (valid_until = 'infinity'::timestamp with time zone);


--
-- Name: idx_resolution_requirement_status; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_requirement_status ON resolution.requirement USING btree (status) WHERE (valid_until = 'infinity'::timestamp with time zone);


--
-- Name: idx_resolution_requirement_valid; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_requirement_valid ON resolution.requirement USING btree (valid_from, valid_until);


--
-- Name: idx_resolution_work_request_business_status; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_work_request_business_status ON resolution.work_request USING btree (business_status);


--
-- Name: idx_resolution_work_request_legacy_id; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_work_request_legacy_id ON resolution.work_request USING btree (legacy_id) WHERE (legacy_id IS NOT NULL);


--
-- Name: idx_resolution_work_request_plan_id; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_resolution_work_request_plan_id ON resolution.work_request USING btree (plan_id) WHERE (plan_id IS NOT NULL);


--
-- Name: idx_work_request_edge_active_pair; Type: INDEX; Schema: resolution; Owner: -
--

CREATE UNIQUE INDEX idx_work_request_edge_active_pair ON resolution.work_request_edge USING btree (parent_work_request_id, child_work_request_id, edge_type) WHERE (valid_until = 'infinity'::timestamp with time zone);


--
-- Name: one_state_attr_per_concept; Type: INDEX; Schema: resolution; Owner: -
--

CREATE UNIQUE INDEX one_state_attr_per_concept ON resolution.concept_attribute USING btree (concept_id) WHERE is_state_attribute;


--
-- Name: expression_operand trg_expression_operand_acyclic; Type: TRIGGER; Schema: resolution; Owner: -
--

CREATE TRIGGER trg_expression_operand_acyclic BEFORE INSERT OR UPDATE ON resolution.expression_operand FOR EACH ROW EXECUTE FUNCTION resolution.check_expression_acyclic();


--
-- Name: assessment assessment_observation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.assessment
    ADD CONSTRAINT assessment_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES resolution.observation(id);


--
-- Name: candidate candidate_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate
    ADD CONSTRAINT candidate_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: candidate candidate_harvest_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate
    ADD CONSTRAINT candidate_harvest_id_fkey FOREIGN KEY (harvest_id) REFERENCES resolution.harvest(id);


--
-- Name: candidate_segment_set candidate_segment_set_candidate_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate_segment_set
    ADD CONSTRAINT candidate_segment_set_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES resolution.candidate(id);


--
-- Name: candidate_source_chunk candidate_source_chunk_candidate_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.candidate_source_chunk
    ADD CONSTRAINT candidate_source_chunk_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES resolution.candidate(id);


--
-- Name: concept_attribute_binding concept_attribute_binding_attribute_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute_binding
    ADD CONSTRAINT concept_attribute_binding_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES resolution.concept_attribute(id);


--
-- Name: concept_attribute concept_attribute_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute
    ADD CONSTRAINT concept_attribute_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES resolution.concept(id);


--
-- Name: concept_attribute_value concept_attribute_value_attribute_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_attribute_value
    ADD CONSTRAINT concept_attribute_value_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES resolution.concept_attribute(id);


--
-- Name: concept_relationship_binding concept_relationship_binding_concept_relationship_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_relationship_binding
    ADD CONSTRAINT concept_relationship_binding_concept_relationship_id_fkey FOREIGN KEY (concept_relationship_id) REFERENCES resolution.concept_relationship(id);


--
-- Name: concept_relationship concept_relationship_from_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_relationship
    ADD CONSTRAINT concept_relationship_from_concept_id_fkey FOREIGN KEY (from_concept_id) REFERENCES resolution.concept(id);


--
-- Name: concept_relationship concept_relationship_to_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_relationship
    ADD CONSTRAINT concept_relationship_to_concept_id_fkey FOREIGN KEY (to_concept_id) REFERENCES resolution.concept(id);


--
-- Name: concept_state_transition concept_state_transition_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_state_transition
    ADD CONSTRAINT concept_state_transition_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES resolution.concept(id);


--
-- Name: concept_state_transition concept_state_transition_from_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_state_transition
    ADD CONSTRAINT concept_state_transition_from_value_id_fkey FOREIGN KEY (from_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: concept_state_transition concept_state_transition_to_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.concept_state_transition
    ADD CONSTRAINT concept_state_transition_to_value_id_fkey FOREIGN KEY (to_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: consumer_operation consumer_operation_representation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.consumer_operation
    ADD CONSTRAINT consumer_operation_representation_id_fkey FOREIGN KEY (representation_id) REFERENCES resolution.representation(id);


--
-- Name: expression expression_attribute_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression
    ADD CONSTRAINT expression_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES resolution.concept_attribute(id);


--
-- Name: expression expression_concept_relationship_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression
    ADD CONSTRAINT expression_concept_relationship_id_fkey FOREIGN KEY (concept_relationship_id) REFERENCES resolution.concept_relationship(id);


--
-- Name: expression_operand expression_operand_child_expression_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression_operand
    ADD CONSTRAINT expression_operand_child_expression_id_fkey FOREIGN KEY (child_expression_id) REFERENCES resolution.expression(id);


--
-- Name: expression_operand expression_operand_parent_expression_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression_operand
    ADD CONSTRAINT expression_operand_parent_expression_id_fkey FOREIGN KEY (parent_expression_id) REFERENCES resolution.expression(id);


--
-- Name: harvest harvest_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.harvest
    ADD CONSTRAINT harvest_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: identity_strategy identity_strategy_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.identity_strategy
    ADD CONSTRAINT identity_strategy_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES resolution.concept(id);


--
-- Name: implementation_plan implementation_plan_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.implementation_plan
    ADD CONSTRAINT implementation_plan_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: implementation_plan implementation_plan_requirement_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.implementation_plan
    ADD CONSTRAINT implementation_plan_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES resolution.requirement(id);


--
-- Name: implementation_plan implementation_plan_specification_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.implementation_plan
    ADD CONSTRAINT implementation_plan_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES resolution.specification(id);


--
-- Name: observation observation_asset_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.observation
    ADD CONSTRAINT observation_asset_concept_id_fkey FOREIGN KEY (asset_concept_id) REFERENCES resolution.concept(id);


--
-- Name: observation_source_chunk observation_source_chunk_observation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.observation_source_chunk
    ADD CONSTRAINT observation_source_chunk_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES resolution.observation(id);


--
-- Name: open_question_answer open_question_answer_question_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question_answer
    ADD CONSTRAINT open_question_answer_question_id_fkey FOREIGN KEY (question_id) REFERENCES resolution.open_question(id) ON DELETE CASCADE;


--
-- Name: open_question open_question_assessment_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question
    ADD CONSTRAINT open_question_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES resolution.assessment(id);


--
-- Name: open_question open_question_category_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question
    ADD CONSTRAINT open_question_category_value_id_fkey FOREIGN KEY (category_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: open_question_entity open_question_entity_asset_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question_entity
    ADD CONSTRAINT open_question_entity_asset_concept_id_fkey FOREIGN KEY (asset_concept_id) REFERENCES resolution.concept(id);


--
-- Name: open_question_entity open_question_entity_open_question_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question_entity
    ADD CONSTRAINT open_question_entity_open_question_id_fkey FOREIGN KEY (open_question_id) REFERENCES resolution.open_question(id) ON DELETE CASCADE;


--
-- Name: open_question open_question_status_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.open_question
    ADD CONSTRAINT open_question_status_value_id_fkey FOREIGN KEY (status_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: representation representation_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation
    ADD CONSTRAINT representation_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES resolution.concept(id);


--
-- Name: representation_identity representation_identity_identity_strategy_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_identity
    ADD CONSTRAINT representation_identity_identity_strategy_id_fkey FOREIGN KEY (identity_strategy_id) REFERENCES resolution.identity_strategy(id);


--
-- Name: representation_identity representation_identity_representation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_identity
    ADD CONSTRAINT representation_identity_representation_id_fkey FOREIGN KEY (representation_id) REFERENCES resolution.representation(id);


--
-- Name: representation representation_owning_subsystem_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation
    ADD CONSTRAINT representation_owning_subsystem_id_fkey FOREIGN KEY (owning_subsystem_id) REFERENCES resolution.owning_subsystem(id);


--
-- Name: representation_relationship representation_relationship_from_representation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_relationship
    ADD CONSTRAINT representation_relationship_from_representation_id_fkey FOREIGN KEY (from_representation_id) REFERENCES resolution.representation(id);


--
-- Name: representation_relationship representation_relationship_to_representation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_relationship
    ADD CONSTRAINT representation_relationship_to_representation_id_fkey FOREIGN KEY (to_representation_id) REFERENCES resolution.representation(id);


--
-- Name: requirement requirement_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement
    ADD CONSTRAINT requirement_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: requirement requirement_candidate_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement
    ADD CONSTRAINT requirement_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES resolution.candidate(id);


--
-- Name: requirement requirement_parent_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement
    ADD CONSTRAINT requirement_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES resolution.requirement(id);


--
-- Name: requirement_segment_set requirement_segment_set_requirement_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement_segment_set
    ADD CONSTRAINT requirement_segment_set_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES resolution.requirement(id);


--
-- Name: requirement requirement_sol_ir_expression_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.requirement
    ADD CONSTRAINT requirement_sol_ir_expression_id_fkey FOREIGN KEY (sol_ir_expression_id) REFERENCES resolution.expression(id);


--
-- Name: rule rule_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES resolution.concept(id);


--
-- Name: rule rule_concept_relationship_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_concept_relationship_id_fkey FOREIGN KEY (concept_relationship_id) REFERENCES resolution.concept_relationship(id);


--
-- Name: rule rule_expression_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_expression_id_fkey FOREIGN KEY (expression_id) REFERENCES resolution.expression(id);


--
-- Name: rule rule_representation_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_representation_id_fkey FOREIGN KEY (representation_id) REFERENCES resolution.representation(id);


--
-- Name: rule rule_state_transition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.rule
    ADD CONSTRAINT rule_state_transition_id_fkey FOREIGN KEY (state_transition_id) REFERENCES resolution.concept_state_transition(id);


--
-- Name: specification specification_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification
    ADD CONSTRAINT specification_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: specification_lineage specification_lineage_derived_from_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification_lineage
    ADD CONSTRAINT specification_lineage_derived_from_id_fkey FOREIGN KEY (derived_from_id) REFERENCES resolution.specification(id);


--
-- Name: specification_lineage specification_lineage_specification_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification_lineage
    ADD CONSTRAINT specification_lineage_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES resolution.specification(id);


--
-- Name: specification specification_requirement_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification
    ADD CONSTRAINT specification_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES resolution.requirement(id);


--
-- Name: specification specification_superseded_by_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.specification
    ADD CONSTRAINT specification_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES resolution.specification(id);


--
-- Name: verified_statement verified_statement_answer_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.verified_statement
    ADD CONSTRAINT verified_statement_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES resolution.open_question_answer(id);


--
-- Name: verified_statement verified_statement_asset_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.verified_statement
    ADD CONSTRAINT verified_statement_asset_concept_id_fkey FOREIGN KEY (asset_concept_id) REFERENCES resolution.concept(id);


--
-- Name: verified_statement verified_statement_expression_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.verified_statement
    ADD CONSTRAINT verified_statement_expression_id_fkey FOREIGN KEY (expression_id) REFERENCES resolution.expression(id);


--
-- Name: work_request work_request_asset_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request
    ADD CONSTRAINT work_request_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES resolution.canonical_asset(id);


--
-- Name: work_request_edge work_request_edge_child_work_request_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request_edge
    ADD CONSTRAINT work_request_edge_child_work_request_id_fkey FOREIGN KEY (child_work_request_id) REFERENCES resolution.work_request(id);


--
-- Name: work_request_edge work_request_edge_parent_work_request_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request_edge
    ADD CONSTRAINT work_request_edge_parent_work_request_id_fkey FOREIGN KEY (parent_work_request_id) REFERENCES resolution.work_request(id);


--
-- Name: work_request work_request_plan_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request
    ADD CONSTRAINT work_request_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES resolution.implementation_plan(plan_number);


--
-- Name: work_request work_request_source_requirement_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request
    ADD CONSTRAINT work_request_source_requirement_id_fkey FOREIGN KEY (source_requirement_id) REFERENCES resolution.requirement(id);


--
-- Name: work_request work_request_source_specification_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.work_request
    ADD CONSTRAINT work_request_source_specification_id_fkey FOREIGN KEY (source_specification_id) REFERENCES resolution.specification(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 1PMjF1LDXBr9sR76k3W7rAPcPg9Swkj8sMyVemL12DF87sw2MvdeR78pb6h2TQi

