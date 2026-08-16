-- COUNT returns a scalar (integer), unlike EXISTS/ALL which return boolean.
-- A COUNT-quantified relationship_ref can't be a guard's root on its own --
-- it has to be wrapped in a comparison (COUNT(...) >= 2). That means the
-- guard's true entry point needs to handle two shapes: root is a bare
-- relationship_ref (EXISTS/ALL, boolean already), or root is an operator
-- wrapping a COUNT scalar comparison. compile_root replaces the assumption
-- that evaluate_relationship_guard always starts from a relationship_ref.

CREATE OR REPLACE FUNCTION resolution.compile_count_scalar(expr_id uuid, parent_ref text)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.compile_root(expr_id uuid, literal_root_ref text)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql;

-- entry point now goes through compile_root, not compile_exists_chain
-- directly -- handles both plain EXISTS/ALL roots and COUNT-comparison roots.
CREATE OR REPLACE FUNCTION resolution.evaluate_relationship_guard(expr_id uuid, root_instance_id uuid)
RETURNS TABLE(compiled_sql text, result boolean) AS $$
DECLARE
    v_sql text;
    v_result boolean;
BEGIN
    v_sql := resolution.compile_root(expr_id, quote_literal(root_instance_id::text));
    EXECUTE format('SELECT %s', v_sql) INTO v_result;
    RETURN QUERY SELECT v_sql, v_result;
END;
$$ LANGUAGE plpgsql;
