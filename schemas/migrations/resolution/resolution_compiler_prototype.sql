-- Prototype compiler, scoped narrowly to EXISTS-quantified relationship_ref
-- chains — exactly what the OpenQuestion resolve guard needs, nothing more.
-- Not a general expression compiler yet: no literal/attribute_ref/operator
-- composition, no ALL/COUNT handling. Proves the compile-to-SQL strategy
-- is mechanical, not that the full vocabulary is done.

CREATE OR REPLACE FUNCTION resolution.compile_exists_chain(expr_id uuid, parent_ref text)
RETURNS text AS $$
DECLARE
    v_kind        text;
    v_crid        uuid;
    v_binding     resolution.concept_relationship_binding%ROWTYPE;
    v_alias       text;
    v_child_id    uuid;
    v_child_sql   text;
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
        -- schema convention: every to_table's own PK is 'id'
        v_child_sql := resolution.compile_exists_chain(v_child_id, format('%I.id', v_alias));
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

CREATE OR REPLACE FUNCTION resolution.evaluate_relationship_guard(expr_id uuid, root_instance_id uuid)
RETURNS TABLE(compiled_sql text, result boolean) AS $$
DECLARE
    v_sql text;
    v_result boolean;
BEGIN
    v_sql := resolution.compile_exists_chain(expr_id, quote_literal(root_instance_id::text));
    EXECUTE format('SELECT %s', v_sql) INTO v_result;
    RETURN QUERY SELECT v_sql, v_result;
END;
$$ LANGUAGE plpgsql;
