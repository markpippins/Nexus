-- Every relationship_ref tested so far happened to correlate the next hop
-- via the current table's own 'id' column (Answer.id -> VerifiedStatement.
-- answer_id, Requirement.id -> Requirement.parent_id). compile_condition
-- hardcoded that as format('%I.id', current_alias). WorkRequestEdge ->
-- WorkRequest breaks the assumption: the correlation column is
-- parent_work_request_id, a column ON the edge, not the edge's own id.
-- Fix: look up the correlation column from the CHILD relationship_ref's
-- own binding instead of assuming '.id'.

CREATE OR REPLACE FUNCTION resolution.correlation_ref(current_alias text, child_expr_id uuid)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.compile_condition(expr_id uuid, current_alias text)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql;
