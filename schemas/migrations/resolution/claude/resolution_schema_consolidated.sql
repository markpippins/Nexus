--
-- PostgreSQL database dump
--

\restrict 3kXanYxubEqOQTSdOCCNROdlHlpAO3Mu1edQfwLBWQMDjXPQXnCIuAQAU6iiRMk

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
-- Name: admit_and_record(uuid, text, text, text, jsonb, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.admit_and_record(p_transaction_id uuid, p_idempotency_key text, p_entity_id text, p_tool_name text, p_input jsonb, p_state_transition_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_concept_name      text;
    v_check_entity_id   uuid;
    v_check             RECORD;
    v_admission_result  text;
BEGIN
    SELECT c.name INTO v_concept_name
    FROM resolution.concept_state_transition cst
    JOIN resolution.concept c ON c.id = cst.concept_id
    WHERE cst.id = p_state_transition_id;
    IF v_concept_name IS NULL THEN
        RAISE EXCEPTION 'no concept_state_transition for id %', p_state_transition_id;
    END IF;

    v_check_entity_id := resolution.resolve_entity_uuid(p_entity_id, v_concept_name);

    SELECT * INTO v_check FROM resolution.check_transition_guard(p_state_transition_id, v_check_entity_id);
    v_admission_result := CASE WHEN v_check.admitted THEN 'ADMITTED' ELSE 'REJECTED' END;

    INSERT INTO peb.transactions (id, idempotency_key, entity_id, admission_result, tool_name, input, created_at)
    VALUES (p_transaction_id, p_idempotency_key, p_entity_id, v_admission_result, p_tool_name, p_input, now());

    IF NOT v_check.admitted THEN
        INSERT INTO peb.violations (id, transaction_id, violation_type, severity, entity_id, context, resolution, created_at)
        VALUES (gen_random_uuid(), p_transaction_id,
                CASE v_check.rule_type WHEN 'invariant' THEN 'INVARIANT_VIOLATED' ELSE 'GUARD_FAILED' END,
                'hard', p_entity_id,
                jsonb_build_object('rule_name', v_check.rule_name, 'rule_type', v_check.rule_type,
                                    'reason', v_check.reason, 'compiled_sql', v_check.compiled_sql),
                'rejected', now());
    END IF;

    RETURN v_admission_result;
END;
$$;


--
-- Name: check_and_record_disagreement(uuid, text, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_and_record_disagreement(p_representation_comparison_id uuid, p_external_id text, p_relational_proposition_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_check      RECORD;
    v_concept_id uuid;
    v_asserted   uuid;
BEGIN
    SELECT * INTO v_check FROM resolution.detect_disagreement(p_representation_comparison_id, p_external_id);

    SELECT c.id INTO v_concept_id FROM resolution.concept c WHERE c.name = 'WorkRequest';
    INSERT INTO resolution.observation (trigger_type, asset_concept_id, source_artifact_id, payload, assessed)
    VALUES ('representation_disagreement', v_concept_id,
            resolution.resolve_entity_uuid(p_external_id, 'WorkRequest'),
            jsonb_build_object('from_repr', v_check.from_repr, 'to_repr', v_check.to_repr,
                                'from_value', v_check.from_value, 'to_value', v_check.to_value, 'agrees', v_check.agrees),
            true);

    SELECT cav.id INTO v_asserted
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Asserted';

    UPDATE resolution.proposition
    SET value = v_check.agrees, disposition_value_id = v_asserted, last_evaluated_at = now()
    WHERE id = p_relational_proposition_id;

    RETURN v_check.agrees;
END;
$$;


--
-- Name: check_context_match(uuid, jsonb); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_context_match(p_proposition_id uuid, p_context jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_declared_count  integer;
    v_mismatch_name   text;
    v_uncovered_count integer;
BEGIN
    SELECT count(*) INTO v_declared_count
    FROM resolution.proposition_frame_value WHERE proposition_id = p_proposition_id;

    IF v_declared_count = 0 THEN
        RETURN 'not_scoped';
    END IF;

    IF p_context IS NULL THEN
        RETURN 'context_required';
    END IF;

    SELECT fd.name INTO v_mismatch_name
    FROM resolution.proposition_frame_value pfv
    JOIN resolution.frame_dimension fd ON fd.id = pfv.dimension_id
    LEFT JOIN resolution.frame_dimension_value fdv ON fdv.id = pfv.reference_value_id
    WHERE pfv.proposition_id = p_proposition_id
      AND p_context ? fd.name
      AND (p_context ->> fd.name) IS DISTINCT FROM coalesce(fdv.value, pfv.scalar_value)
    LIMIT 1;

    IF v_mismatch_name IS NOT NULL THEN
        RETURN 'context_mismatch';
    END IF;

    SELECT count(*) INTO v_uncovered_count
    FROM resolution.proposition_frame_value pfv
    JOIN resolution.frame_dimension fd ON fd.id = pfv.dimension_id
    WHERE pfv.proposition_id = p_proposition_id AND NOT (p_context ? fd.name);

    IF v_uncovered_count > 0 THEN
        RETURN 'context_required';  -- caller's context doesn't cover every declared dimension
    END IF;

    RETURN 'matched';
END;
$$;


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
-- Name: check_relationship_rule(uuid, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_relationship_rule(p_concept_relationship_id uuid, p_from_entity_id uuid) RETURNS TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    r RECORD;
    v_result boolean;
    v_sql    text;
BEGIN
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'conditional' AND rl.concept_relationship_id = p_concept_relationship_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'conditional has no expression_id wired up -- failing closed';
            RETURN;
        END IF;

        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_from_entity_id) eg;

        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'conditional failed');
            RETURN;
        END IF;
    END LOOP;

    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text,
        'all conditionals passed (or none registered) -- checked FROM-side only, see notes';
END;
$$;


--
-- Name: FUNCTION check_relationship_rule(p_concept_relationship_id uuid, p_from_entity_id uuid); Type: COMMENT; Schema: resolution; Owner: -
--

COMMENT ON FUNCTION resolution.check_relationship_rule(p_concept_relationship_id uuid, p_from_entity_id uuid) IS 'Only evaluates against the relationship''s FROM-side entity. A conditional needing to reference BOTH sides (e.g. comparing the from and to entities'' attributes to each other) is not expressible yet -- evaluate_relationship_guard has exactly one root. Real two-sided conditionals will need that extended, not worked around here.';


--
-- Name: check_representation_rule(uuid, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_representation_rule(p_representation_id uuid, p_entity_id uuid) RETURNS TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    r RECORD;
    v_result boolean;
    v_sql    text;
BEGIN
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.representation_id = p_representation_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'representation rule has no expression_id wired up -- failing closed';
            RETURN;
        END IF;

        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;

        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'representation rule failed');
            RETURN;
        END IF;
    END LOOP;

    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text, 'all representation rules passed (or none registered)';
END;
$$;


--
-- Name: check_transition_guard(uuid, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.check_transition_guard(p_state_transition_id uuid, p_entity_id uuid) RETURNS TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_concept_id uuid;
    r RECORD;
    v_result boolean;
    v_sql    text;
BEGIN
    SELECT concept_id INTO v_concept_id
    FROM resolution.concept_state_transition WHERE id = p_state_transition_id;
    IF v_concept_id IS NULL THEN
        RAISE EXCEPTION 'no concept_state_transition for id %', p_state_transition_id;
    END IF;

    -- 1. guard-type rules attached specifically to this transition
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'guard' AND rl.state_transition_id = p_state_transition_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'guard has no expression_id wired up -- cannot evaluate, failing closed';
            RETURN;
        END IF;
        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;
        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'guard failed');
            RETURN;
        END IF;
    END LOOP;

    -- 2. invariant-type rules on the CONCEPT this transition belongs to --
    -- these must hold no matter which transition is being attempted.
    FOR r IN
        SELECT rl.name, rl.rule_type, rl.expression_id, rl.notes
        FROM resolution.rule rl
        WHERE rl.rule_type = 'invariant' AND rl.concept_id = v_concept_id
    LOOP
        IF r.expression_id IS NULL THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, NULL::text,
                'invariant has no expression_id wired up -- cannot evaluate, failing closed';
            RETURN;
        END IF;
        SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
        FROM resolution.evaluate_relationship_guard(r.expression_id, p_entity_id) eg;
        IF NOT v_result THEN
            RETURN QUERY SELECT false, r.name, r.rule_type, v_sql, coalesce(r.notes, 'invariant violated');
            RETURN;
        END IF;
    END LOOP;

    -- still narrow, worth stating plainly: concept_relationship-attached
    -- and representation-attached rules are NOT checked here. Those apply
    -- when a relationship instance or a physical write happens, not when
    -- a single entity transitions state -- a different trigger point this
    -- function doesn't cover yet.
    RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::text,
        'all guards and invariants passed (or none registered)';
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
        IF NOT FOUND THEN RAISE EXCEPTION 'no concept_attribute_binding for attribute %', v_attr_id; END IF;
        RETURN format('%I.%I', current_alias, v_binding.column_name);
    ELSIF v_kind = 'relationship_ref' THEN
        RETURN resolution.compile_exists_chain(expr_id, resolution.correlation_ref(current_alias, expr_id));
    ELSIF v_kind = 'proposition_ref' THEN
        RETURN resolution.compile_proposition_ref(expr_id);
    ELSIF v_kind = 'function_call' THEN
        SELECT * INTO v_fn_binding FROM resolution.function_binding WHERE function_name = v_function_name;
        IF NOT FOUND THEN RAISE EXCEPTION 'no function_binding for function_name %', v_function_name; END IF;
        SELECT array_agg(resolution.compile_condition(eo.child_expression_id, current_alias) ORDER BY eo.position)
        INTO v_args FROM resolution.expression_operand eo WHERE eo.parent_expression_id = expr_id;
        IF coalesce(array_length(v_args, 1), 0) <> v_fn_binding.arg_count THEN
            RAISE EXCEPTION 'function % expects % arg(s), got %', v_function_name, v_fn_binding.arg_count, coalesce(array_length(v_args, 1), 0);
        END IF;
        RETURN format(v_fn_binding.sql_template, VARIADIC v_args);
    ELSIF v_kind = 'operator' THEN
        SELECT child_expression_id INTO v_left_id  FROM resolution.expression_operand WHERE parent_expression_id = expr_id AND position = 1;
        SELECT child_expression_id INTO v_right_id FROM resolution.expression_operand WHERE parent_expression_id = expr_id AND position = 2;
        IF v_left_id IS NULL OR v_right_id IS NULL THEN RAISE EXCEPTION 'operator node % missing an operand', expr_id; END IF;
        RETURN format('(%s %s %s)', resolution.compile_condition(v_left_id, current_alias), v_operator, resolution.compile_condition(v_right_id, current_alias));
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
-- Name: compile_proposition_ref(uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.compile_proposition_ref(expr_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_prop_id uuid;
    v_field   text;
BEGIN
    SELECT referenced_proposition_id, coalesce(proposition_ref_field, 'disposition')
    INTO v_prop_id, v_field
    FROM resolution.expression WHERE id = expr_id;

    IF v_prop_id IS NULL THEN
        RAISE EXCEPTION 'proposition_ref node % has no referenced_proposition_id', expr_id;
    END IF;

    IF v_field = 'value' THEN
        RETURN format('(SELECT p.value::text FROM resolution.proposition p WHERE p.id = %L)', v_prop_id);
    ELSE
        RETURN format(
            '(SELECT cav.value FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id WHERE p.id = %L)',
            v_prop_id
        );
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
    v_attr_id    uuid;
    v_binding    resolution.concept_attribute_binding%ROWTYPE;
    v_left_id    uuid;
    v_right_id   uuid;
BEGIN
    SELECT kind, quantifier, operator, literal_value, attribute_id
    INTO v_kind, v_quantifier, v_operator, v_literal, v_attr_id
    FROM resolution.expression WHERE id = expr_id;

    IF v_kind = 'relationship_ref' THEN
        IF v_quantifier IN ('EXISTS', 'ALL') THEN
            RETURN resolution.compile_exists_chain(expr_id, literal_root_ref);
        ELSIF v_quantifier = 'COUNT' THEN
            RETURN resolution.compile_count_scalar(expr_id, literal_root_ref);
        ELSE
            RAISE EXCEPTION 'unknown quantifier %', v_quantifier;
        END IF;
    ELSIF v_kind = 'attribute_ref' THEN
        SELECT * INTO v_binding FROM resolution.concept_attribute_binding WHERE attribute_id = v_attr_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'no concept_attribute_binding for attribute %', v_attr_id; END IF;
        RETURN format('(SELECT %I FROM %I.%I WHERE id = %s)', v_binding.column_name, v_binding.schema_name, v_binding.table_name, literal_root_ref);
    ELSIF v_kind = 'proposition_ref' THEN
        RETURN resolution.compile_proposition_ref(expr_id);
    ELSIF v_kind = 'operator' THEN
        SELECT child_expression_id INTO v_left_id  FROM resolution.expression_operand WHERE parent_expression_id = expr_id AND position = 1;
        SELECT child_expression_id INTO v_right_id FROM resolution.expression_operand WHERE parent_expression_id = expr_id AND position = 2;
        RETURN format('(%s %s %s)', resolution.compile_root(v_left_id, literal_root_ref), v_operator, resolution.compile_root(v_right_id, literal_root_ref));
    ELSIF v_kind = 'literal' THEN
        RETURN quote_literal(v_literal);
    ELSE
        RAISE EXCEPTION 'compile_root: unsupported root-level kind %', v_kind;
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
-- Name: derive_external_id(text, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.derive_external_id(p_concept_name text, p_entity_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_schema      text;
    v_table       text;
    v_asset_id    uuid;
    v_external_id text;
BEGIN
    SELECT r.schema_name, r.table_name INTO v_schema, v_table
    FROM resolution.representation r
    JOIN resolution.concept c ON c.id = r.concept_id AND c.name = p_concept_name
    JOIN resolution.representation_identity ri ON ri.representation_id = r.id;
    IF v_table IS NULL THEN
        RAISE EXCEPTION 'no identity-bearing representation for concept %', p_concept_name;
    END IF;

    EXECUTE format('SELECT asset_id FROM %I.%I WHERE id = $1', v_schema, v_table)
        INTO v_asset_id USING p_entity_id;
    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION 'entity % (concept %) has no asset_id, cannot derive an external id', p_entity_id, p_concept_name;
    END IF;

    SELECT canonical_asset_id INTO v_external_id
    FROM resolution.canonical_asset WHERE id = v_asset_id AND expired_at IS NULL;
    RETURN v_external_id;
END;
$_$;


--
-- Name: detect_disagreement(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.detect_disagreement(p_representation_comparison_id uuid, p_external_id text) RETURNS TABLE(agrees boolean, from_value text, to_value text, from_repr text, to_repr text)
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_comp              RECORD;
    v_rr                RECORD;
    v_from_repr         RECORD;
    v_to_repr           RECORD;
    v_from_concept_name text;
    v_from_entity_id    uuid;
    v_from_value        text;
    v_to_value          text;
BEGIN
    SELECT * INTO v_comp FROM resolution.representation_comparison WHERE id = p_representation_comparison_id;
    SELECT * INTO v_rr   FROM resolution.representation_relationship WHERE id = v_comp.representation_relationship_id;
    SELECT * INTO v_from_repr FROM resolution.representation WHERE id = v_rr.from_representation_id;
    SELECT * INTO v_to_repr   FROM resolution.representation WHERE id = v_rr.to_representation_id;

    SELECT c.name INTO v_from_concept_name FROM resolution.concept c WHERE c.id = v_from_repr.concept_id;
    v_from_entity_id := resolution.resolve_entity_uuid(p_external_id, v_from_concept_name);

    EXECUTE format('SELECT %I::text FROM %I.%I WHERE id = $1', v_comp.from_column, v_from_repr.schema_name, v_from_repr.table_name)
        INTO v_from_value USING v_from_entity_id;

    EXECUTE format('SELECT %I::text FROM %I.%I WHERE work_request_uuid = $1', v_comp.to_column, v_to_repr.schema_name, v_to_repr.table_name)
        INTO v_to_value USING p_external_id;

    RETURN QUERY SELECT (v_from_value IS NOT DISTINCT FROM v_to_value), v_from_value, v_to_value, v_from_repr.label, v_to_repr.label;
END;
$_$;


--
-- Name: evaluate_proposition(uuid, text, jsonb); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.evaluate_proposition(p_proposition_id uuid, p_trigger_reason text DEFAULT 'manual'::text, p_context jsonb DEFAULT NULL::jsonb) RETURNS TABLE(disposition text, all_passed boolean, context_status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_context_status       text;
    v_current_disposition  text;
    v_subject_entity_id    uuid;
    r                      RECORD;
    v_result               boolean;
    v_sql                  text;
    v_all_passed           boolean := true;
    v_relational_failed    boolean := false;
    v_disposition_value_id uuid;
    v_new_disposition      text;
BEGIN
    v_context_status := resolution.check_context_match(p_proposition_id, p_context);

    IF v_context_status NOT IN ('not_scoped', 'matched') THEN
        -- refuse to evaluate: no assertion_evaluation rows, no disposition
        -- change, no last_evaluated_at change. Nothing was actually checked.
        SELECT cav.value INTO v_current_disposition
        FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE p.id = p_proposition_id;
        RETURN QUERY SELECT v_current_disposition, NULL::boolean, v_context_status;
        RETURN;
    END IF;

    SELECT subject_entity_id INTO v_subject_entity_id FROM resolution.proposition WHERE id = p_proposition_id;

    FOR r IN
        SELECT pa.rule_id, rl.expression_id, rl.is_relational_check
        FROM resolution.proposition_assertion pa
        JOIN resolution.rule rl ON rl.id = pa.rule_id
        WHERE pa.proposition_id = p_proposition_id
    LOOP
        IF r.expression_id IS NULL THEN
            v_result := false; v_sql := NULL;
        ELSE
            SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
            FROM resolution.evaluate_relationship_guard(r.expression_id, v_subject_entity_id) eg;
        END IF;

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql, trigger_reason)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql, p_trigger_reason);

        IF NOT v_result THEN
            v_all_passed := false;
            IF r.is_relational_check THEN v_relational_failed := true; END IF;
        END IF;
    END LOOP;

    v_new_disposition := CASE
        WHEN v_all_passed THEN 'Asserted'
        WHEN v_relational_failed THEN 'Disputed'
        ELSE 'Rejected'
    END;

    SELECT cav.id INTO v_disposition_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_new_disposition;

    UPDATE resolution.proposition
    SET disposition_value_id = v_disposition_value_id, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN QUERY SELECT v_new_disposition, v_all_passed, v_context_status;
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


--
-- Name: is_stale(uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.is_stale(p_proposition_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_last_evaluated  timestamptz;
    v_tightest_window interval;
    v_type_default    interval;
BEGIN
    SELECT last_evaluated_at INTO v_last_evaluated FROM resolution.proposition WHERE id = p_proposition_id;
    IF v_last_evaluated IS NULL THEN
        RETURN false;
    END IF;

    SELECT min(rl.staleness_window) INTO v_tightest_window
    FROM resolution.proposition_assertion pa
    JOIN resolution.rule rl ON rl.id = pa.rule_id
    WHERE pa.proposition_id = p_proposition_id AND rl.staleness_window IS NOT NULL;

    IF v_tightest_window IS NULL THEN
        SELECT st.default_staleness_window INTO v_type_default
        FROM resolution.proposition p
        JOIN resolution.semantic_type st ON st.id = p.semantic_type_id
        WHERE p.id = p_proposition_id;
        v_tightest_window := v_type_default;
    END IF;

    IF v_tightest_window IS NULL THEN
        RETURN false;  -- no assertion override AND no semantic-type default -- never stale
    END IF;

    RETURN v_last_evaluated < now() - v_tightest_window;
END;
$$;


--
-- Name: is_well_framed(uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.is_well_framed(p_proposition_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_missing_count integer;
BEGIN
    SELECT count(*) INTO v_missing_count
    FROM resolution.semantic_type_required_dimension std
    JOIN resolution.proposition p ON p.semantic_type_id = std.semantic_type_id
    WHERE p.id = p_proposition_id
      AND NOT EXISTS (
          SELECT 1 FROM resolution.proposition_frame_value pfv
          WHERE pfv.proposition_id = p_proposition_id AND pfv.dimension_id = std.dimension_id
      );
    RETURN v_missing_count = 0;
END;
$$;


--
-- Name: on_change(text, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.on_change(p_concept_name text, p_entity_id uuid) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    r      RECORD;
    v_eval RECORD;
    v_ext  text;
    v_reason text;
BEGIN
    FOR r IN
        SELECT p.id, cav.value AS current_disposition
        FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        JOIN resolution.concept c ON c.id = p.asset_concept_id
        WHERE cav.value IN ('Pending', 'Asserted', 'Rejected', 'Stale')
          AND c.name = p_concept_name AND p.subject_entity_id = p_entity_id
          AND EXISTS (SELECT 1 FROM resolution.proposition_assertion pa WHERE pa.proposition_id = p.id)
    LOOP
        v_reason := CASE WHEN r.current_disposition = 'Pending' THEN 'pending_created' ELSE 'upstream_changed' END;
        SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id, v_reason);
        RETURN QUERY SELECT r.id, 'event_evaluate'::text, v_eval.disposition;
    END LOOP;

    BEGIN
        v_ext := resolution.derive_external_id(p_concept_name, p_entity_id);
    EXCEPTION WHEN OTHERS THEN
        v_ext := NULL;
    END;

    IF v_ext IS NOT NULL THEN
        FOR r IN
            SELECT p.id FROM resolution.proposition p
            JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
            JOIN resolution.concept c ON c.id = p.asset_concept_id
            WHERE cav.value = 'Disputed' AND c.name = p_concept_name AND p.subject_entity_id = p_entity_id
              AND EXISTS (SELECT 1 FROM resolution.proposition_comparison pc WHERE pc.proposition_id = p.id)
        LOOP
            SELECT * INTO v_eval FROM resolution.reopen_disputed_proposition(r.id, v_ext);
            RETURN QUERY SELECT r.id, 'event_reopen'::text, v_eval.disposition;
        END LOOP;
    END IF;

    RETURN;
END;
$$;


--
-- Name: reopen_disputed_proposition(uuid, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.reopen_disputed_proposition(p_proposition_id uuid, p_external_id text) RETURNS TABLE(disposition text, comparators_agree boolean, assertions_passed boolean)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_current_disposition text;
    v_comp                RECORD;
    v_relational_prop_id  uuid;
    v_all_agree           boolean := true;
    v_eval                RECORD;
    v_target_value        text;
    v_target_value_id     uuid;
BEGIN
    SELECT cav.value INTO v_current_disposition
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    IF v_current_disposition IS DISTINCT FROM 'Disputed' THEN
        RAISE EXCEPTION 'proposition % is not Disputed (currently %), nothing to reopen', p_proposition_id, v_current_disposition;
    END IF;

    FOR v_comp IN
        SELECT pc.representation_comparison_id
        FROM resolution.proposition_comparison pc WHERE pc.proposition_id = p_proposition_id
    LOOP
        -- refresh the Relational proposition for this comparison, if one
        -- exists, so evaluate_proposition below sees current data rather
        -- than whatever value was last recorded.
        SELECT p2.id INTO v_relational_prop_id
        FROM resolution.proposition p2
        JOIN resolution.proposition_comparison pc2
            ON pc2.proposition_id = p2.id AND pc2.representation_comparison_id = v_comp.representation_comparison_id
        JOIN resolution.concept_attribute_value gcav ON gcav.id = p2.grounding_status_value_id AND gcav.value = 'Relational'
        LIMIT 1;

        IF v_relational_prop_id IS NOT NULL THEN
            PERFORM resolution.check_and_record_disagreement(v_comp.representation_comparison_id, p_external_id, v_relational_prop_id);
            IF NOT (SELECT p3.value FROM resolution.proposition p3 WHERE p3.id = v_relational_prop_id) THEN
                v_all_agree := false;
            END IF;
        ELSIF NOT (SELECT agrees FROM resolution.detect_disagreement(v_comp.representation_comparison_id, p_external_id)) THEN
            -- no Relational proposition wired for this comparison -- fall
            -- back to a direct check
            v_all_agree := false;
        END IF;
    END LOOP;

    SELECT * INTO v_eval FROM resolution.evaluate_proposition(p_proposition_id);
    -- evaluate_proposition already wrote its own disposition based on the
    -- (now-refreshed) assertions -- nothing further to override here,
    -- since a failing relational assertion already yields Disputed and a
    -- clean pass already yields Asserted.

    SELECT cav.value INTO v_target_value
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    RETURN QUERY SELECT v_target_value, v_all_agree, v_eval.all_passed;
END;
$$;


--
-- Name: resolve_disputed_via_verification(uuid, uuid); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.resolve_disputed_via_verification(p_proposition_id uuid, p_verified_statement_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_current_disposition text;
    v_vs                  RECORD;
    v_proposition_concept uuid;
    v_asserted_value      uuid;
BEGIN
    SELECT cav.value INTO v_current_disposition
    FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE p.id = p_proposition_id;

    IF v_current_disposition IS DISTINCT FROM 'Disputed' THEN
        RAISE EXCEPTION 'proposition % is not Disputed (currently %)', p_proposition_id, v_current_disposition;
    END IF;

    SELECT * INTO v_vs FROM resolution.verified_statement WHERE id = p_verified_statement_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no verified_statement %', p_verified_statement_id; END IF;

    SELECT id INTO v_proposition_concept FROM resolution.concept WHERE name = 'Proposition';

    IF v_vs.asset_concept_id IS DISTINCT FROM v_proposition_concept OR v_vs.target_asset_id IS DISTINCT FROM p_proposition_id THEN
        RAISE EXCEPTION 'verified_statement % does not target proposition % -- refusing to resolve on an unrelated verification',
            p_verified_statement_id, p_proposition_id;
    END IF;

    SELECT cav.id INTO v_asserted_value
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Asserted';

    UPDATE resolution.proposition
    SET disposition_value_id = v_asserted_value, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN 'Asserted';
END;
$$;


--
-- Name: resolve_entity_uuid(text, text); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.resolve_entity_uuid(p_external_id text, p_concept_name text) RETURNS uuid
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_asset_id uuid;
    v_schema   text;
    v_table    text;
    v_result   uuid;
BEGIN
    SELECT id INTO v_asset_id FROM resolution.canonical_asset
    WHERE canonical_asset_id = p_external_id AND expired_at IS NULL;
    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION 'no active canonical_asset for external id %', p_external_id;
    END IF;

    SELECT r.schema_name, r.table_name INTO v_schema, v_table
    FROM resolution.representation r
    JOIN resolution.concept c ON c.id = r.concept_id AND c.name = p_concept_name
    JOIN resolution.representation_identity ri ON ri.representation_id = r.id;
    IF v_table IS NULL THEN
        RAISE EXCEPTION 'no identity-bearing representation found for concept %', p_concept_name;
    END IF;

    EXECUTE format('SELECT id FROM %I.%I WHERE asset_id = $1', v_schema, v_table)
        INTO v_result USING v_asset_id;
    IF v_result IS NULL THEN
        RAISE EXCEPTION 'canonical_asset % has no matching row in %.%', p_external_id, v_schema, v_table;
    END IF;

    RETURN v_result;
END;
$_$;


--
-- Name: run_reconciliation_sweep(integer); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.run_reconciliation_sweep(p_batch_limit integer DEFAULT 50) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.id, c.name AS concept_name, p.subject_entity_id
        FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        JOIN resolution.concept c ON c.id = p.asset_concept_id
        WHERE cav.value IN ('Pending', 'Disputed') AND p.subject_entity_id IS NOT NULL
        LIMIT p_batch_limit
    LOOP
        RETURN QUERY SELECT * FROM resolution.on_change(r.concept_name, r.subject_entity_id);
    END LOOP;

    RETURN QUERY SELECT * FROM resolution.run_staleness_sweep(p_batch_limit);
END;
$$;


--
-- Name: run_staleness_sweep(integer); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.run_staleness_sweep(p_batch_limit integer DEFAULT 50) RETURNS TABLE(proposition_id uuid, action_taken text, resulting_disposition text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    r           RECORD;
    v_eval      RECORD;
    v_stale_ids uuid[];
    v_value_id  uuid;
BEGIN
    -- snapshot ALREADY-stale propositions, oldest-checked first, so a
    -- proposition that's been waiting longest gets priority for reopening
    SELECT array_agg(p.id ORDER BY p.last_evaluated_at ASC NULLS FIRST) INTO v_stale_ids
    FROM resolution.proposition p
    JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
    WHERE cav.value = 'Stale';

    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Stale';

    -- oldest-checked-first here too: without this ORDER BY, which N rows
    -- come back under LIMIT is whatever the planner happens to pick --
    -- under real load that means some propositions could go unchecked
    -- indefinitely while others get hit every cycle. Ordering by
    -- last_evaluated_at means each call makes genuine, fair progress
    -- rather than an arbitrary one.
    FOR r IN
        SELECT p.id FROM resolution.proposition p
        JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id
        WHERE cav.value = 'Asserted' AND resolution.is_stale(p.id)
        ORDER BY p.last_evaluated_at ASC NULLS FIRST
        LIMIT p_batch_limit
    LOOP
        UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
        RETURN QUERY SELECT r.id, 'marked_stale'::text, 'Stale'::text;
    END LOOP;

    SELECT cav.id INTO v_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = 'Pending';

    IF v_stale_ids IS NOT NULL THEN
        FOR r IN SELECT unnest(v_stale_ids[1:p_batch_limit]) AS id LOOP
            UPDATE resolution.proposition SET disposition_value_id = v_value_id WHERE id = r.id;
            SELECT * INTO v_eval FROM resolution.evaluate_proposition(r.id, 'clock_stale_retry');
            RETURN QUERY SELECT r.id, 'reopened_from_stale'::text, v_eval.disposition;
        END LOOP;
    END IF;

    RETURN;
END;
$$;


--
-- Name: validate_proposition_frame_value(); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.validate_proposition_frame_value() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_dim         resolution.frame_dimension%ROWTYPE;
    v_ref_dim_id  uuid;
BEGIN
    SELECT * INTO v_dim FROM resolution.frame_dimension WHERE id = NEW.dimension_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no frame_dimension %', NEW.dimension_id;
    END IF;

    IF v_dim.value_kind = 'governed_reference' THEN
        IF NEW.reference_value_id IS NULL THEN
            RAISE EXCEPTION 'dimension % requires a governed reference value, not a scalar', v_dim.name;
        END IF;
        SELECT dimension_id INTO v_ref_dim_id FROM resolution.frame_dimension_value WHERE id = NEW.reference_value_id;
        IF v_ref_dim_id IS DISTINCT FROM NEW.dimension_id THEN
            RAISE EXCEPTION 'reference_value_id % belongs to a different dimension than %', NEW.reference_value_id, v_dim.name;
        END IF;

    ELSIF v_dim.value_kind = 'typed_scalar' THEN
        IF NEW.scalar_value IS NULL THEN
            RAISE EXCEPTION 'dimension % requires a scalar value, not a governed reference', v_dim.name;
        END IF;
        BEGIN
            CASE v_dim.scalar_type
                WHEN 'integer'   THEN PERFORM NEW.scalar_value::integer;
                WHEN 'numeric'   THEN PERFORM NEW.scalar_value::numeric;
                WHEN 'boolean'   THEN PERFORM NEW.scalar_value::boolean;
                WHEN 'timestamp' THEN PERFORM NEW.scalar_value::timestamptz;
                ELSE NULL;  -- 'text' needs no cast check
            END CASE;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'scalar_value % is not a valid % for dimension %', NEW.scalar_value, v_dim.scalar_type, v_dim.name;
        END;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: verified_statement_immutable(); Type: FUNCTION; Schema: resolution; Owner: -
--

CREATE FUNCTION resolution.verified_statement_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'resolution.verified_statement is immutable: % is not allowed', TG_OP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assertion_evaluation; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.assertion_evaluation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposition_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    result boolean NOT NULL,
    compiled_sql text,
    evaluated_at timestamp with time zone DEFAULT now() NOT NULL,
    trigger_reason text DEFAULT 'manual'::text,
    CONSTRAINT assertion_evaluation_trigger_reason_check CHECK ((trigger_reason = ANY (ARRAY['pending_created'::text, 'upstream_changed'::text, 'explicit_repair'::text, 'clock_stale_retry'::text, 'manual'::text])))
);


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
    referenced_proposition_id uuid,
    proposition_ref_field text,
    CONSTRAINT expression_kind_check CHECK ((kind = ANY (ARRAY['literal'::text, 'attribute_ref'::text, 'operator'::text, 'function_call'::text, 'relationship_ref'::text, 'proposition_ref'::text]))),
    CONSTRAINT expression_kind_fields_check CHECK ((((kind = 'literal'::text) AND (literal_value IS NOT NULL) AND (attribute_id IS NULL) AND (function_name IS NULL) AND (concept_relationship_id IS NULL) AND (operator IS NULL) AND (referenced_proposition_id IS NULL)) OR ((kind = 'attribute_ref'::text) AND (attribute_id IS NOT NULL) AND (literal_value IS NULL) AND (function_name IS NULL) AND (concept_relationship_id IS NULL) AND (operator IS NULL) AND (referenced_proposition_id IS NULL)) OR ((kind = 'operator'::text) AND (operator IS NOT NULL) AND (attribute_id IS NULL) AND (literal_value IS NULL) AND (function_name IS NULL) AND (concept_relationship_id IS NULL) AND (referenced_proposition_id IS NULL)) OR ((kind = 'function_call'::text) AND (function_name IS NOT NULL) AND (attribute_id IS NULL) AND (literal_value IS NULL) AND (concept_relationship_id IS NULL) AND (operator IS NULL) AND (referenced_proposition_id IS NULL)) OR ((kind = 'relationship_ref'::text) AND (concept_relationship_id IS NOT NULL) AND (quantifier IS NOT NULL) AND (attribute_id IS NULL) AND (literal_value IS NULL) AND (function_name IS NULL) AND (operator IS NULL) AND (referenced_proposition_id IS NULL)) OR ((kind = 'proposition_ref'::text) AND (referenced_proposition_id IS NOT NULL) AND (attribute_id IS NULL) AND (literal_value IS NULL) AND (function_name IS NULL) AND (concept_relationship_id IS NULL) AND (operator IS NULL)))),
    CONSTRAINT expression_operator_whitelist_check CHECK (((operator IS NULL) OR (operator = ANY (ARRAY['='::text, '<>'::text, '>'::text, '<'::text, '>='::text, '<='::text, 'AND'::text, 'OR'::text])))),
    CONSTRAINT expression_proposition_ref_field_check CHECK (((proposition_ref_field IS NULL) OR (proposition_ref_field = ANY (ARRAY['disposition'::text, 'value'::text])))),
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
-- Name: frame_dimension; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.frame_dimension (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    value_kind text NOT NULL,
    scalar_type text,
    CONSTRAINT frame_dimension_check CHECK ((((value_kind = 'typed_scalar'::text) AND (scalar_type IS NOT NULL)) OR ((value_kind = 'governed_reference'::text) AND (scalar_type IS NULL)))),
    CONSTRAINT frame_dimension_scalar_type_check CHECK (((scalar_type IS NULL) OR (scalar_type = ANY (ARRAY['text'::text, 'integer'::text, 'boolean'::text, 'timestamp'::text, 'numeric'::text])))),
    CONSTRAINT frame_dimension_value_kind_check CHECK ((value_kind = ANY (ARRAY['governed_reference'::text, 'typed_scalar'::text])))
);


--
-- Name: frame_dimension_value; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.frame_dimension_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dimension_id uuid NOT NULL,
    value text NOT NULL,
    description text
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
-- Name: proposition; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.proposition (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    asset_concept_id uuid,
    subject_entity_id uuid,
    disposition_value_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    recorded_on_dt timestamp with time zone DEFAULT now() NOT NULL,
    recorded_until_dt timestamp with time zone DEFAULT 'infinity'::timestamp with time zone NOT NULL,
    last_evaluated_at timestamp with time zone,
    grounding_status_value_id uuid,
    value boolean,
    semantic_type_id uuid
);


--
-- Name: proposition_assertion; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.proposition_assertion (
    proposition_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposition_comparison; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.proposition_comparison (
    proposition_id uuid NOT NULL,
    representation_comparison_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proposition_frame_value; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.proposition_frame_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposition_id uuid NOT NULL,
    dimension_id uuid NOT NULL,
    reference_value_id uuid,
    scalar_value text,
    CONSTRAINT proposition_frame_value_check CHECK ((((reference_value_id IS NOT NULL) AND (scalar_value IS NULL)) OR ((reference_value_id IS NULL) AND (scalar_value IS NOT NULL))))
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
-- Name: representation_comparison; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.representation_comparison (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    representation_relationship_id uuid NOT NULL,
    from_column text NOT NULL,
    to_column text NOT NULL,
    notes text
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
    is_relational_check boolean DEFAULT false NOT NULL,
    staleness_window interval,
    CONSTRAINT rule_check CHECK (((((((concept_id IS NOT NULL))::integer + ((concept_relationship_id IS NOT NULL))::integer) + ((representation_id IS NOT NULL))::integer) + ((state_transition_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT rule_rule_type_check CHECK ((rule_type = ANY (ARRAY['invariant'::text, 'guard'::text, 'conditional'::text, 'derivation'::text]))),
    CONSTRAINT rule_severity_check CHECK ((severity = ANY (ARRAY['hard'::text, 'soft'::text])))
);


--
-- Name: semantic_type; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.semantic_type (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    default_staleness_window interval
);


--
-- Name: semantic_type_required_dimension; Type: TABLE; Schema: resolution; Owner: -
--

CREATE TABLE resolution.semantic_type_required_dimension (
    semantic_type_id uuid NOT NULL,
    dimension_id uuid NOT NULL
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
-- Name: assertion_evaluation assertion_evaluation_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.assertion_evaluation
    ADD CONSTRAINT assertion_evaluation_pkey PRIMARY KEY (id);


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
-- Name: frame_dimension frame_dimension_name_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.frame_dimension
    ADD CONSTRAINT frame_dimension_name_key UNIQUE (name);


--
-- Name: frame_dimension frame_dimension_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.frame_dimension
    ADD CONSTRAINT frame_dimension_pkey PRIMARY KEY (id);


--
-- Name: frame_dimension_value frame_dimension_value_dimension_id_value_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.frame_dimension_value
    ADD CONSTRAINT frame_dimension_value_dimension_id_value_key UNIQUE (dimension_id, value);


--
-- Name: frame_dimension_value frame_dimension_value_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.frame_dimension_value
    ADD CONSTRAINT frame_dimension_value_pkey PRIMARY KEY (id);


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
-- Name: proposition_assertion proposition_assertion_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_assertion
    ADD CONSTRAINT proposition_assertion_pkey PRIMARY KEY (proposition_id, rule_id);


--
-- Name: proposition_comparison proposition_comparison_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_comparison
    ADD CONSTRAINT proposition_comparison_pkey PRIMARY KEY (proposition_id, representation_comparison_id);


--
-- Name: proposition_frame_value proposition_frame_value_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_frame_value
    ADD CONSTRAINT proposition_frame_value_pkey PRIMARY KEY (id);


--
-- Name: proposition_frame_value proposition_frame_value_proposition_id_dimension_id_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_frame_value
    ADD CONSTRAINT proposition_frame_value_proposition_id_dimension_id_key UNIQUE (proposition_id, dimension_id);


--
-- Name: proposition proposition_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition
    ADD CONSTRAINT proposition_pkey PRIMARY KEY (id);


--
-- Name: representation_comparison representation_comparison_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_comparison
    ADD CONSTRAINT representation_comparison_pkey PRIMARY KEY (id);


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
-- Name: semantic_type semantic_type_name_key; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.semantic_type
    ADD CONSTRAINT semantic_type_name_key UNIQUE (name);


--
-- Name: semantic_type semantic_type_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.semantic_type
    ADD CONSTRAINT semantic_type_pkey PRIMARY KEY (id);


--
-- Name: semantic_type_required_dimension semantic_type_required_dimension_pkey; Type: CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.semantic_type_required_dimension
    ADD CONSTRAINT semantic_type_required_dimension_pkey PRIMARY KEY (semantic_type_id, dimension_id);


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
-- Name: idx_assertion_evaluation_proposition; Type: INDEX; Schema: resolution; Owner: -
--

CREATE INDEX idx_assertion_evaluation_proposition ON resolution.assertion_evaluation USING btree (proposition_id, evaluated_at DESC);


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
-- Name: expression_operand trg_expression_operand_acyclic; Type: TRIGGER; Schema: resolution; Owner: -
--

CREATE TRIGGER trg_expression_operand_acyclic BEFORE INSERT OR UPDATE ON resolution.expression_operand FOR EACH ROW EXECUTE FUNCTION resolution.check_expression_acyclic();


--
-- Name: proposition_frame_value trg_validate_proposition_frame_value; Type: TRIGGER; Schema: resolution; Owner: -
--

CREATE TRIGGER trg_validate_proposition_frame_value BEFORE INSERT OR UPDATE ON resolution.proposition_frame_value FOR EACH ROW EXECUTE FUNCTION resolution.validate_proposition_frame_value();


--
-- Name: verified_statement trg_verified_statement_immutable; Type: TRIGGER; Schema: resolution; Owner: -
--

CREATE TRIGGER trg_verified_statement_immutable BEFORE DELETE OR UPDATE ON resolution.verified_statement FOR EACH ROW EXECUTE FUNCTION resolution.verified_statement_immutable();


--
-- Name: assertion_evaluation assertion_evaluation_proposition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.assertion_evaluation
    ADD CONSTRAINT assertion_evaluation_proposition_id_fkey FOREIGN KEY (proposition_id) REFERENCES resolution.proposition(id);


--
-- Name: assertion_evaluation assertion_evaluation_rule_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.assertion_evaluation
    ADD CONSTRAINT assertion_evaluation_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES resolution.rule(id);


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
-- Name: expression expression_referenced_proposition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.expression
    ADD CONSTRAINT expression_referenced_proposition_id_fkey FOREIGN KEY (referenced_proposition_id) REFERENCES resolution.proposition(id);


--
-- Name: frame_dimension_value frame_dimension_value_dimension_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.frame_dimension_value
    ADD CONSTRAINT frame_dimension_value_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES resolution.frame_dimension(id);


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
-- Name: proposition_assertion proposition_assertion_proposition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_assertion
    ADD CONSTRAINT proposition_assertion_proposition_id_fkey FOREIGN KEY (proposition_id) REFERENCES resolution.proposition(id);


--
-- Name: proposition_assertion proposition_assertion_rule_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_assertion
    ADD CONSTRAINT proposition_assertion_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES resolution.rule(id);


--
-- Name: proposition proposition_asset_concept_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition
    ADD CONSTRAINT proposition_asset_concept_id_fkey FOREIGN KEY (asset_concept_id) REFERENCES resolution.concept(id);


--
-- Name: proposition_comparison proposition_comparison_proposition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_comparison
    ADD CONSTRAINT proposition_comparison_proposition_id_fkey FOREIGN KEY (proposition_id) REFERENCES resolution.proposition(id);


--
-- Name: proposition_comparison proposition_comparison_representation_comparison_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_comparison
    ADD CONSTRAINT proposition_comparison_representation_comparison_id_fkey FOREIGN KEY (representation_comparison_id) REFERENCES resolution.representation_comparison(id);


--
-- Name: proposition proposition_disposition_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition
    ADD CONSTRAINT proposition_disposition_value_id_fkey FOREIGN KEY (disposition_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: proposition_frame_value proposition_frame_value_dimension_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_frame_value
    ADD CONSTRAINT proposition_frame_value_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES resolution.frame_dimension(id);


--
-- Name: proposition_frame_value proposition_frame_value_proposition_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_frame_value
    ADD CONSTRAINT proposition_frame_value_proposition_id_fkey FOREIGN KEY (proposition_id) REFERENCES resolution.proposition(id);


--
-- Name: proposition_frame_value proposition_frame_value_reference_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition_frame_value
    ADD CONSTRAINT proposition_frame_value_reference_value_id_fkey FOREIGN KEY (reference_value_id) REFERENCES resolution.frame_dimension_value(id);


--
-- Name: proposition proposition_grounding_status_value_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition
    ADD CONSTRAINT proposition_grounding_status_value_id_fkey FOREIGN KEY (grounding_status_value_id) REFERENCES resolution.concept_attribute_value(id);


--
-- Name: proposition proposition_semantic_type_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.proposition
    ADD CONSTRAINT proposition_semantic_type_id_fkey FOREIGN KEY (semantic_type_id) REFERENCES resolution.semantic_type(id);


--
-- Name: representation_comparison representation_comparison_representation_relationship_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.representation_comparison
    ADD CONSTRAINT representation_comparison_representation_relationship_id_fkey FOREIGN KEY (representation_relationship_id) REFERENCES resolution.representation_relationship(id);


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
-- Name: semantic_type_required_dimension semantic_type_required_dimension_dimension_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.semantic_type_required_dimension
    ADD CONSTRAINT semantic_type_required_dimension_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES resolution.frame_dimension(id);


--
-- Name: semantic_type_required_dimension semantic_type_required_dimension_semantic_type_id_fkey; Type: FK CONSTRAINT; Schema: resolution; Owner: -
--

ALTER TABLE ONLY resolution.semantic_type_required_dimension
    ADD CONSTRAINT semantic_type_required_dimension_semantic_type_id_fkey FOREIGN KEY (semantic_type_id) REFERENCES resolution.semantic_type(id);


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

\unrestrict 3kXanYxubEqOQTSdOCCNROdlHlpAO3Mu1edQfwLBWQMDjXPQXnCIuAQAU6iiRMk

