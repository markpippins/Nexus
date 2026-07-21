import { TYPE_CODES, TYPE_NAMES, EXTENSION_TABLES, assertKnownTypeName, inferTypeName, coerceForStorage, coerceFromStorage } from './types.js';

// Identifier guard so formatted SQL cannot be injected via table/param names.
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export function assertIdentifier(name) {
  if (!IDENT_RE.test(name)) {
    const err = new Error(`invalid identifier: ${name}`);
    err.status = 400;
    throw err;
  }
}

// Normalise a "fields" entry from the API body into a canonical shape.
// Input may use either {type: "Long"} or {field_type_code: 1} or neither.
export function normaliseFieldSpec(entry) {
  if (!entry || typeof entry !== 'object') {
    throw Object.assign(new Error('field spec must be an object'), { status: 400 });
  }
  const propertyName = entry.property_name || entry.propertyName;
  if (!propertyName) {
    throw Object.assign(new Error('field spec requires property_name'), { status: 400 });
  }
  let typeCode = entry.field_type_code ?? entry.fieldTypeCode;
  if (typeCode == null) {
    const typeName = entry.type || entry.type_name || entry.typeName;
    if (typeName == null) {
      throw Object.assign(new Error(`field spec '${propertyName}' missing type`), { status: 400 });
    }
    typeCode = assertKnownTypeName(typeName);
  } else if (!TYPE_NAMES[typeCode]) {
    throw Object.assign(new Error(`unknown field_type_code ${typeCode}`), { status: 400 });
  }
  return {
    is_calculated: !!entry.is_calculated ?? false,
    field_index: entry.field_index ?? entry.fieldIndex ?? 0,
    label: entry.label ?? entry.property_label ?? null,
    name: entry.name ?? propertyName,
    property_name: propertyName,
    field_type_code: typeCode,
  };
}

// Encode a payload into the shrapnel store. Returns { object_id }.
//
// body shape:
//   {
//     fields: [ { property_name, label, name, type | field_type_code } ],
//     values: { <property_name>: <js value> }
//   }
//
// If `fields` is omitted, it is inferred from the keys of `values` (in
// insertion order) using inferTypeName().
export async function encodePayload(client, body) {
  if (!body || typeof body !== 'object') {
    throw Object.assign(new Error('body must be a JSON object'), { status: 400 });
  }
  const values = body.values ?? body;
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw Object.assign(new Error('values must be a JSON object'), { status: 400 });
  }

  // ---- STEP 1: resolve / upsert field metadata, remembering id per property ----
  let fieldSpecs = [];
  if (Array.isArray(body.fields) && body.fields.length > 0) {
    fieldSpecs = body.fields.map(normaliseFieldSpec);
    // If field_index is 0 (default), renumber sequentially
    let idx = 1;
    for (const f of fieldSpecs) {
      if (!f.field_index) f.field_index = idx;
      idx += 1;
    }
  } else {
    // Infer fields from values, in insertion order of Object.keys
    let idx = 1;
    for (const [propName, raw] of Object.entries(values)) {
      const typeName = inferTypeName(raw);
      fieldSpecs.push({
        is_calculated: false,
        field_index: idx++,
        label: propName,
        name: propName,
        property_name: propName,
        field_type_code: TYPE_CODES[typeName],
      });
    }
  }

  const fieldIds = {}; // property_name -> field_id
  for (const f of fieldSpecs) {
    const res = await client.query(
      `INSERT INTO shrapnel.field (is_calculated, field_index, label, name, property_name, field_type_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (property_name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [f.is_calculated, f.field_index, f.label, f.name, f.property_name, f.field_type_code]
    );
    fieldIds[f.property_name] = res.rows[0].id;
  }

  // ---- STEP 2: create object_instance ----
  const oiRes = await client.query(
    `INSERT INTO shrapnel.object_instance DEFAULT VALUES RETURNING id`
  );
  const objectId = oiRes.rows[0].id;

  // ---- STEP 3: for each value: create value + value_<type> + OAV ----
  for (const f of fieldSpecs) {
    if (!Object.prototype.hasOwnProperty.call(values, f.property_name)) {
      // Spec says every field gets a value; skip fields with no supplied data.
      continue;
    }
    const rawValue = values[f.property_name];
    if (rawValue === undefined || rawValue === null) {
      // NULLs not allowed in extension tables; skip rather than encode nothing.
      continue;
    }
    const typeCode = f.field_type_code;
    const table = EXTENSION_TABLES[typeCode];
    assertIdentifier(table);
    const storageValue = coerceForStorage(rawValue, typeCode);

    const vRes = await client.query(
      `INSERT INTO shrapnel.value (value_type_code) VALUES ($1) RETURNING id`,
      [typeCode]
    );
    const valueId = vRes.rows[0].id;
    await client.query(
      `INSERT INTO shrapnel.${table} (id, value) VALUES ($1, $2)`,
      [valueId, storageValue]
    );
    await client.query(
      `INSERT INTO shrapnel.object_attribute_value (object_id, field_id, value_id)
       VALUES ($1, $2, $3)`,
      [objectId, fieldIds[f.property_name], valueId]
    );
  }

  return { object_id: objectId, fields: fieldSpecs };
}

// Decode an object_id back into a JSON object using a single SQL round-trip.
export async function decodeObject(client, objectId) {
  // Pull all bindings joined to field metadata + extension tables.
  const res = await client.query(
    `
    SELECT
      f.property_name,
      f.label,
      f.name,
      f.field_type_code,
      oav.value_id,
      CASE f.field_type_code
        WHEN 1 THEN (SELECT v.value::text  FROM shrapnel.value_long      v WHERE v.id = oav.value_id)
        WHEN 2 THEN (SELECT v.value       FROM shrapnel.value_string    v WHERE v.id = oav.value_id)
        WHEN 3 THEN (SELECT v.value::text  FROM shrapnel.value_double    v WHERE v.id = oav.value_id)
        WHEN 4 THEN (SELECT v.value::text  FROM shrapnel.value_boolean   v WHERE v.id = oav.value_id)
        WHEN 5 THEN (SELECT v.value::text  FROM shrapnel.value_timestamp v WHERE v.id = oav.value_id)
        WHEN 6 THEN (SELECT v.value::text  FROM shrapnel.value_jsonb     v WHERE v.id = oav.value_id)
        WHEN 7 THEN (SELECT v.value::text  FROM shrapnel.value_uuid      v WHERE v.id = oav.value_id)
      END AS raw_value
    FROM shrapnel.object_attribute_value oav
    JOIN shrapnel.field f ON f.id = oav.field_id
    WHERE oav.object_id = $1
    ORDER BY f.field_index, f.id
    `,
    [objectId]
  );
  const obj = {};
  for (const row of res.rows) {
    obj[row.property_name] = coerceFromStorage(row.raw_value, row.field_type_code);
  }
  return obj;
}
