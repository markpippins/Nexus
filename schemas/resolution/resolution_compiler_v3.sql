CREATE OR REPLACE FUNCTION resolution.compile_condition(expr_id uuid, current_alias text)
RETURNS text AS $$
DECLARE
    v_kind      text;
    v_operator  text;
    v_literal   text;
    v_attr_id   uuid;
    v_crid      uuid;
    v_binding   resolution.concept_attribute_binding%ROWTYPE;
    v_left_id   uuid;
    v_right_id  uuid;
BEGIN
    SELECT kind, operator, literal_value, attribute_id, concept_relationship_id
    INTO v_kind, v_operator, v_literal, v_attr_id, v_crid
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
        -- an existence chain can now appear as an AND/OR operand, not just
        -- as the top of a guard
        RETURN resolution.compile_exists_chain(expr_id, format('%I.id', current_alias));

    ELSIF v_kind = 'operator' THEN
        SELECT child_expression_id INTO v_left_id  FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 1;
        SELECT child_expression_id INTO v_right_id FROM resolution.expression_operand
            WHERE parent_expression_id = expr_id AND position = 2;
        IF v_left_id IS NULL OR v_right_id IS NULL THEN
            RAISE EXCEPTION 'operator node % missing an operand', expr_id;
        END IF;
        -- 'AND'/'OR' and comparison operators ('=', etc) are the same
        -- shape here: two operands, combined with the operator text.
        -- Each operand can itself be any condition kind, including a
        -- nested relationship_ref existence check.
        RETURN format('(%s %s %s)',
            resolution.compile_condition(v_left_id, current_alias),
            v_operator,
            resolution.compile_condition(v_right_id, current_alias)
        );

    ELSE
        RAISE EXCEPTION 'compile_condition does not support kind % (function_call not implemented yet)', v_kind;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- simplified: the chain's terminal child is always compiled through
-- compile_condition now, which itself knows how to handle a nested
-- relationship_ref (continue the chain) vs a real condition (leaf predicate).
CREATE OR REPLACE FUNCTION resolution.compile_exists_chain(expr_id uuid, parent_ref text)
RETURNS text AS $$
DECLARE
    v_kind      text;
    v_crid      uuid;
    v_binding   resolution.concept_relationship_binding%ROWTYPE;
    v_alias     text;
    v_child_id  uuid;
    v_child_sql text;
BEGIN
    SELECT kind, concept_relationship_id INTO v_kind, v_crid
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

    RETURN format(
        'EXISTS (SELECT 1 FROM %I.%I %I WHERE %I.%I = %s AND (%s))',
        v_binding.to_schema, v_binding.to_table, v_alias,
        v_alias, v_binding.to_column, parent_ref, v_child_sql
    );
END;
$$ LANGUAGE plpgsql;
