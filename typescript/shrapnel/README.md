# shrapnel-srv

REST API for the **shrapnel Relational Object Store / EAV system**, backed by
PostgreSQL.

The shrapnel system separates **Data Definitions** (metadata) from **Concrete
Object Instances** (values) using an Entity-Attribute-Value model:

| Table | Purpose |
|-------|---------|
| `shrapnel.field_type` | Type registry (1 Long, 2 String, 3 Double, 4 Boolean, 5 Timestamp, 6 JSONB, 7 UUID) |
| `shrapnel.field` | Attribute name + `property_name` (unique upsert key) + `field_type_code` |
| `shrapnel.object_instance` | A single concrete object/entity instance |
| `shrapnel.value` | Base entry for one concrete value, references `value_type_code` |
| `shrapnel.value_<type>` | 1:1 typed extension tables storing the physical value |
| `shrapnel.object_attribute_value` | Junction: `(object_id, field_id) -> value_id` |

## Quick start

```bash
cd ~/dev/nexus/typescript/shrapnel
npm install
npm run migrate                 # apply migrations/0001_init.sql against PG
SHRAPNEL_SRV_PORT=3110 npm run dev
```

Default DSN: `postgresql://pguser:pgpass@localhost:5432/postgres` — overridable
via `SHRAPNEL_PG_DSN`. Port is `SHRAPNEL_SRV_PORT` (default `3110`).

## REST endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/health` | Service / DB health probe |
| `GET`    | `/api/field-types` | List type registry |
| `GET`    | `/api/fields` | List field metadata |
| `POST`   | `/api/fields` | Create / upsert a field |
| `GET`    | `/api/fields/:id` | Fetch one field |
| `GET`    | `/api/objects` | List object instances (with optional decode) |
| `POST`   | `/api/objects` | Create object and encode values from a JSON body |
| `GET`    | `/api/objects/:id` | Decode an object back into JSON |
| `DELETE` | `/api/objects/:id` | Delete an object and all its values |
| `GET`    | `/api/objects/:id/values` | List raw bindings for an object |
| `POST`   | `/api/encode` | Generic encode: takes arbitrary JSON, infers fields, returns `object_id` |

## Encoding contract

`POST /api/objects` and `POST /api/encode` accept a JSON body of the form:

```json
{
  "fields": [
    { "property_name": "name",  "label": "Full Name", "name": "Name", "type": "String" },
    { "property_name": "age",    "label": "User Age",  "name": "Age",  "type": "Long" }
  ],
  "values": { "name": "Alice", "age": 30 }
}
```

If `fields` is omitted, field metadata is inferred from the `values` payload
(basic JS type -> shrapnel type code).

The API encodes strictly in the order defined by the spec:

1. Upsert every attribute in `shrapnel.field` (by `property_name`).
2. Insert a row in `shrapnel.object_instance`.
3. For each `(field, value)` pair:
   - insert a `shrapnel.value` row (`value_type_code`),
   - insert a row in the matching `shrapnel.value_<type>` extension,
   - link them via `shrapnel.object_attribute_value`.

All three sub-steps happen inside a single transaction so partial encodings
roll back on failure.

## Schema integrity guarantees

Every table in the shrapnel schema has an explicit primary key (the original
shrapnel review surfaced tables like `data_source.id` and `qbe_table.id` that
were `bigint NOT NULL` but lacked `PRIMARY KEY` — the local shrapnel schema
does not have this defect). All relationships are declared via `FOREIGN KEY`
constraints (e.g. `object_attribute_value.value_id -> value.id`,
`field.field_type_code -> field_type.code`,
`object_attribute_value.{object_id, field_id} -> object_instance.id / field.id`).
The junction table carries both a surrogate `id` PK and a `UNIQUE(object_id,
field_id)` composite to prevent duplicate bindings. The `field.property_name`
column has a unique constraint to support `ON CONFLICT (property_name)` upserts.

The polymorphic value<->value_<type> pair deserves special attention.

The 1:1 binding between `value.id` and exactly one `value_<type>.id` extension
row is enforced at TWO layers:

1. **DB layer** — migration `0002_value_extension_type_guard.sql` installs a
   `BEFORE INSERT OR UPDATE` trigger on every `value_<type>` table that
   raises an exception unless the parent `value.value_type_code` matches the
   type the extension represents. This means:
   - you cannot insert a `value_string` row for a parent `value` whose
     `value_type_code = 1` (Long) — the trigger raises;
   - you cannot insert the same `value.id` into TWO different extension
     tables because the second extension's trigger would assert the wrong
     type code;
   - you cannot insert an extension row for an `id` that doesn't exist in
     `value` at all (FK already catches this, the trigger re-states it).
2. **API layer** — `lib/encode.js`'s `encodePayload()` inserts the `value`
   base row AND the matching `value_<type>` row inside a single
   `withTransaction()` call. Partial encodings cannot escape: any failure in
   either row rolls the whole transaction back.

The one gap that is NOT closed purely inside the database schema is **existence**:
nothing structurally prevents a `value` row from having NO extension row at
all (a deferred constraint cannot know which extension table to expect). The
API invariant above makes this impossible in practice for writes going
through the shrapnel-srv; any other writer that talks to the shrapnel schema
directly MUST maintain the same invariant by inserting both rows in the same
transaction.

## Migrations

- `migrations/0001_init.sql` — full schema DDL (idempotent).
- `migrations/0002_value_extension_type_guard.sql` — DB-level guard trigger
  that rejects any `value_<type>` extension row whose parent `value` row's
  declared `value_type_code` does not match the type the extension represents.
- `smoke_example.sql` — the canonical DO-block example from the spec, plus a
  decode query to verify the round-trip. Not part of the migration flow; run
  manually with `psql -f smoke_example.sql` against the same DB.
- `negative_path_check.sql` — proves the type-guard trigger in `0002` fires
  on each failure mode (wrong extension, second extension, no parent).
  Run with `npm run dbcheck`.
