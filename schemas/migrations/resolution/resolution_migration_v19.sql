-- proposition_ref: the second-order node kind. Resolves to the referenced
-- Proposition's CURRENT disposition (a text value), usable as an operand
-- in a comparison -- e.g. proposition_ref(P) = 'Asserted'. This is the
-- piece Level 3 of the earlier exercise needed and didn't have.

ALTER TABLE resolution.expression DROP CONSTRAINT expression_kind_check;
ALTER TABLE resolution.expression ADD CONSTRAINT expression_kind_check
    CHECK (kind IN ('literal','attribute_ref','operator','function_call','relationship_ref','proposition_ref'));

ALTER TABLE resolution.expression ADD COLUMN referenced_proposition_id uuid REFERENCES resolution.proposition(id);

ALTER TABLE resolution.expression DROP CONSTRAINT expression_kind_fields_check;
ALTER TABLE resolution.expression ADD CONSTRAINT expression_kind_fields_check CHECK (
       (kind = 'literal'           AND literal_value IS NOT NULL AND attribute_id IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND operator IS NULL AND referenced_proposition_id IS NULL)
    OR (kind = 'attribute_ref'     AND attribute_id IS NOT NULL AND literal_value IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND operator IS NULL AND referenced_proposition_id IS NULL)
    OR (kind = 'operator'          AND operator IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND referenced_proposition_id IS NULL)
    OR (kind = 'function_call'     AND function_name IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND concept_relationship_id IS NULL AND operator IS NULL AND referenced_proposition_id IS NULL)
    OR (kind = 'relationship_ref'  AND concept_relationship_id IS NOT NULL AND quantifier IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND function_name IS NULL AND operator IS NULL AND referenced_proposition_id IS NULL)
    OR (kind = 'proposition_ref'   AND referenced_proposition_id IS NOT NULL AND attribute_id IS NULL AND literal_value IS NULL AND function_name IS NULL AND concept_relationship_id IS NULL AND operator IS NULL)
);

-- compile_condition and compile_root both need a proposition_ref branch --
-- it's a scalar text lookup, needs no alias/relationship traversal at all,
-- which is exactly why it works identically at the true root or nested.
CREATE OR REPLACE FUNCTION resolution.compile_proposition_ref(expr_id uuid)
RETURNS text AS $$
DECLARE
    v_prop_id uuid;
BEGIN
    SELECT referenced_proposition_id INTO v_prop_id FROM resolution.expression WHERE id = expr_id;
    IF v_prop_id IS NULL THEN
        RAISE EXCEPTION 'proposition_ref node % has no referenced_proposition_id', expr_id;
    END IF;
    RETURN format(
        '(SELECT cav.value FROM resolution.proposition p JOIN resolution.concept_attribute_value cav ON cav.id = p.disposition_value_id WHERE p.id = %L)',
        v_prop_id
    );
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resolution.compile_root(expr_id uuid, literal_root_ref text)
RETURNS text AS $$
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
$$ LANGUAGE plpgsql;
