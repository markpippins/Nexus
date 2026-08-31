# Agent-Records → Shrapnel Bridge

Live extraction of every `nebula.agent_records` row into the **shrapnel
Relational Object Store / EAV system**.

The shrapnel store is an Entity-Attribute-Value datastore (schema `shrapnel`
in the `postgres` database, served by `shrapnel-srv` on `:3118`). This project
keeps it current with the canonical agent-record corpus so downstream consumers
can query every record — by record type, role, level, tag, timestamp, or any
attribute — through shrapnel's EAV surface.

## Why

`nebula.agent_records` is the canonical store for all agent audit artifacts
(reports, decisions, analyses, inspections, prompts, responses, assessments,
engineering logs, architecture notes). Shrapnel provides a uniform
object/attribute/value query surface over heterogeneous data. Extracting
agent records into shrapnel makes the full corpus addressable through one
EAV API and decouples read access from the source schema.

## Architecture

```
nebula.agent_records (nexus DB, view over agent_records_history)
        │
        │  poll for created_at > cursor, every 5s
        ▼
agent-records-to-shrapnel-bridge.py   (systemd user service)
        │
        │  encode each new record as an EAV object
        ▼
shrapnel.*  (postgres DB) ── served by shrapnel-srv (:3118)
   ├── field                 (19 attribute metadata rows)
   ├── object_instance       (one per agent record)
   ├── value / value_<type>  (typed EAV payloads)
   ├── object_attribute_value (junctions)
   └── bridge_cursor         (tool, cursor_val) forward-only watermark
```

## Components

| Artifact | Path | Purpose |
|---|---|---|
| Bridge script | `bin/agent-records-to-shrapnel-bridge.py` | Polls `nebula.agent_records`, detects new record types, encodes new records into shrapnel |
| Systemd unit | `bin/agent-records-to-shrapnel-bridge.service` | Runs the bridge continuously (installed to `~/.config/systemd/user/`) |
| Cursor table | `shrapnel.bridge_cursor` | Forward-only watermark of the last processed `created_at` |
| Bulk loader (one-shot) | `bin/load-agent-records-to-shrapnel.py` | Initial backfill of the full corpus (idempotent) |

## Shrapnel field schema

Each agent record becomes one `object_instance` bound to the following fields
(`property_name` → type). Only non-null / non-empty attributes are bound (EAV
extension tables disallow NULL; empty arrays/objects are skipped by design).

| property_name | type | source column |
|---|---|---|
| `record_id` | UUID | id |
| `record_type` | String | record_type |
| `record_type_enum` | Long | derived (1..9, new types appended) |
| `role` | String | role |
| `title` | String | title |
| `content` | String | content |
| `source_path` | String | source_path |
| `metadata` | JSONB | metadata |
| `tags` | JSONB | tags[] |
| `system_id` | UUID | system_id |
| `subsystem_id` | UUID | subsystem_id |
| `feature_id` | UUID | feature_id |
| `plan_ref` | String | plan_ref |
| `candidate_id` | UUID | candidate_id |
| `requirement_id` | UUID | requirement_id |
| `created_at` | Timestamp | created_at |
| `level` | Long | level |
| `visibility_scope` | String | visibility_scope |
| `model` | String | model |

## Usage

### Continuous sync (systemd, default)

```bash
systemctl --user start agent-records-to-shrapnel-bridge.service
systemctl --user enable agent-records-to-shrapnel-bridge.service
systemctl --user status agent-records-to-shrapnel-bridge.service
```

Polls every `--interval` seconds (default `5`). Idempotent — dedupes on
`record_id`; cursor is forward-only, so records are never double-processed.

### Manual / one-shot (cron, debugging)

```bash
python3 bin/agent-records-to-shrapnel-bridge.py --once
python3 bin/agent-records-to-shrapnel-bridge.py --interval 10
```

### Initial bulk backfill

```bash
python3 bin/load-agent-records-to-shrapnel.py
```

Re-running the bulk loader skips already-loaded `record_id`s.

### Querying shrapnel

```bash
# health / counts
curl http://localhost:3118/health

# list EAV objects (one per agent record)
curl "http://localhost:3118/api/objects?limit=100"

# decode one object's values
curl "http://localhost:3118/api/objects/<object_id>/values"

# SQL: records by type
psql ... -c "SELECT vs.value, count(*) FROM shrapnel.object_attribute_value oav
  JOIN shrapnel.field f ON f.id=oav.field_id AND f.property_name='record_type'
  JOIN shrapnel.value v ON v.id=oav.value_id
  JOIN shrapnel.value_string vs ON vs.id=v.id
  GROUP BY vs.value ORDER BY count(*) DESC;"
```

## Record-type auto-detection

When a record with a previously-unseen `record_type` is encountered, the
bridge appends it to the `record_type_enum` registry in place (canonical
ordering is preserved). No code change is required — new types flow through
automatically.

## Logging

Logs are written to `nexus/logs/agent-records-to-shrapnel-bridge.log`
(startup line, per-pass encode counts, cursor advances, errors).

## Terrain registration

Registered as runnable service **id 131** (ONLINE), workspace `nexus/bin`,
startup via `systemctl --user start agent-records-to-shrapnel-bridge.service`.