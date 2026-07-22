DO $$
DECLARE
    v_field_id_name bigint;
    v_field_id_age  bigint;
    v_object_id     bigint;
    v_val_id        bigint;
BEGIN
    ------------------------------------------------------------------
    -- STEP 1: Register Field Metadata (upsert by property_name)
    ------------------------------------------------------------------
    INSERT INTO shrapnel.field (is_calculated, field_index, label, name, property_name, field_type_code)
    VALUES (false, 1, 'Full Name', 'Name', 'name', 2)
    ON CONFLICT (property_name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_field_id_name;

    INSERT INTO shrapnel.field (is_calculated, field_index, label, name, property_name, field_type_code)
    VALUES (false, 2, 'User Age', 'Age', 'age', 1)
    ON CONFLICT (property_name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_field_id_age;

    ------------------------------------------------------------------
    -- STEP 2: Create Object Instance
    ------------------------------------------------------------------
    INSERT INTO shrapnel.object_instance DEFAULT VALUES
    RETURNING id INTO v_object_id;

    ------------------------------------------------------------------
    -- STEP 3: Encode Attribute Values
    ------------------------------------------------------------------
    -- Attribute 1: name = 'Alice' (Type 2: String)
    INSERT INTO shrapnel.value (value_type_code) VALUES (2) RETURNING id INTO v_val_id;
    INSERT INTO shrapnel.value_string (id, value) VALUES (v_val_id, 'Alice');
    INSERT INTO shrapnel.object_attribute_value (object_id, field_id, value_id)
    VALUES (v_object_id, v_field_id_name, v_val_id);

    -- Attribute 2: age = 30 (Type 1: Long)
    INSERT INTO shrapnel.value (value_type_code) VALUES (1) RETURNING id INTO v_val_id;
    INSERT INTO shrapnel.value_long (id, value) VALUES (v_val_id, 30);
    INSERT INTO shrapnel.object_attribute_value (object_id, field_id, value_id)
    VALUES (v_object_id, v_field_id_age, v_val_id);

    RAISE NOTICE 'Created object_id=%, name_field_id=%, age_field_id=%', v_object_id, v_field_id_name, v_field_id_age;
END $$;

-- Sanity: decode the just-encoded object back into JSON
SELECT
    oi.id AS object_id,
    jsonb_object_agg(f.property_name,
        CASE f.field_type_code
            WHEN 1 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_long v JOIN shrapnel.value_long vs ON vs.id = v.id WHERE v.id = oav.value_id)
            WHEN 2 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_string vs WHERE vs.id = oav.value_id)
            WHEN 3 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_double vs WHERE vs.id = oav.value_id)
            WHEN 4 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_boolean vs WHERE vs.id = oav.value_id)
            WHEN 5 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_timestamp vs WHERE vs.id = oav.value_id)
            WHEN 6 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_jsonb vs WHERE vs.id = oav.value_id)
            WHEN 7 THEN (SELECT to_jsonb(vs.value)  FROM shrapnel.value_uuid vs WHERE vs.id = oav.value_id)
        END
    ) AS decoded
FROM shrapnel.object_instance oi
JOIN shrapnel.object_attribute_value oav ON oav.object_id = oi.id
JOIN shrapnel.field f ON f.id = oav.field_id
GROUP BY oi.id
ORDER BY oi.id DESC
LIMIT 5;
