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

## Migrations

- `migrations/0001_init.sql` — full schema DDL (idempotent).
- `migrations/0002_smoke_example.sql` — the canonical DO-block example from the
  spec, plus a decode query to verify the round-trip.
