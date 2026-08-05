# Semantics Schema — Quick Reference

> **Date:** 2026-08-03
> **Scope:** `semantics` schema in the `nexus` database (type-level semantic topology)
> **Design:** `semantics-db.md` · **Migrations:** `semantics.sql` + V055–V060 (see chain below)

---

## What This Schema Is

`semantics.*` holds the **type-level legend** — the classes and the legal
pipeline shape — while instance-level facts live elsewhere (`cascade.lineage_edges`
is the *map*). Nothing here repeats per baseline: schema location, owner,
consumers, and identity mapping are durable facts about a representation; only
snapshot judgments (lifecycle state, drift, audit reason, safe-to-retire) repeat.

**Core discipline:** durable structure is **append-only, expire-not-delete**.
Rows are never physically removed; they are soft-deleted via `expired_at`
(and retained so foreign keys keep resolving). Changing a durable fact means
expiring the old row and inserting a new version.

---

## Tables (12)

| Table | Purpose | Key columns / notes |
|-------|---------|---------------------|
| `owning_subsystem` | The fleet subsystems (stable `smallint` lookup keys) | `id` PK, `name` UNIQUE-active, `description`, `path` (workspace location(s)), `expired_at` |
| `concept` | The classes | `name` UNIQUE-active, `created_at`, `expired_at` |
| `representation` | Physical forms of a concept (table, DAG node, cache, event) | `concept_id` FK, `label`, `schema_name`, `table_name`, `owning_subsystem_id` FK, `owner`, `raw_metadata` jsonb |
| `representation_relationship` | Fidelity/lineage between two forms of the *same* concept | `from/to_representation_id` FKs, `relationship_type`, `effective_at`; CHECK `from <> to` |
| `consumer_operation` | Who touches a representation and how | `representation_id` FK, `consumer_name`, `operation`, `effective_at` |
| `identity_strategy` | What identity means for a concept (asked once) | `concept_id` FK UNIQUE-active, `canonical_key_description` |
| `representation_identity` | How a representation expresses its concept's identity | `representation_id` FK UNIQUE-active, `identity_strategy_id` FK, `identity_expression` |
| `snapshot` | A per-baseline judgment record | `version`, `parent_id` self-FK, `status` (default `draft`), `created_by` |
| `snapshot_observation` | Per-baseline judgment on one representation | `snapshot_id` + `representation_id` FKs (pair UNIQUE-active), `lifecycle_state`, `is_completed_fix`, `audit_reason`, `safe_to_retire` |
| `drift_finding` | A finding against a specific observation | `observation_id` FK, `severity`, `detected_at`, `resolved_at` |
| `concept_relationship` | Legal pipeline shape between classes | `from/to_concept_id` FKs, `relationship_type` (FK → vocabulary), `path` (`green`/`red`), `effective_at` |
| `relationship_type` | **Vocabulary of legal edge types** (the legend's lexicon) | `name` UNIQUE (FK-referenced, never reused), `description`, `scope` (`concept`/`representation`/`both`), `created_at` |

**Integrity:** 16 FKs (all enforced — this is a low-write curated graph) +
5 **partial unique indexes on active rows** (`WHERE expired_at IS NULL`):
`owning_subsystem(name)`, `concept(name)`, `identity_strategy(concept_id)`,
`representation_identity(representation_id)`,
`snapshot_observation(snapshot_id, representation_id)`.
Active-only uniqueness is what makes append-only versioning legal (an expired
row no longer blocks re-use of its natural key).

**Shared vocabularies:**

| Vocabulary | Where | Notes |
|------------|-------|-------|
| Relationship types | `relationship_type` table (V060 + V061) | **29 types, FK-enforced** on `concept_relationship` + `representation_relationship` — only defined types are legal edges. 6 concept pipeline (`produces`, `spawns`, `member_of`, `transforms_into`, `basis_of`, `provenance_of`), 4 representation-fidelity (`equivalent`, `derived`, `partial`, `legacy`), 14 cross-domain (`defines`, `implements`, `projects`, `derives_from`, `validates`, `constrains`, `governs`, `supersedes`, `observes`, `mediates`, `interprets`, `depends_on_decision`, `evidences`, `questions`), 5 operational between representations (`calls`, `consumes`, `writes`, `reads`, `uses`; `produces` broadened to cover representation-level producing). Resolves the "shared vocabulary" + "Consumes/Produces between representations" open questions in `semantics-db.md` |
| `consumer_operation.operation` | text column | `reads`, `writes`, `observes`, `emits`, `projects`, `owns` |
| `snapshot_observation.lifecycle_state` | text column | `active`, `deprecated`, `migrating`, `legacy-frozen`, `expired` |

---

## Stored Procedures (37)

All live in `semantics.*`. App writes should go **through these procs**, not raw DML.

| Family | Count | Pattern |
|--------|-------|---------|
| `add_<table>(...)` | 12 | Plain `INSERT … RETURNING *`; uuid auto-generated via `COALESCE(p_id, gen_random_uuid())`; `p_*` params all defaulted (NULL) |
| `soft_delete_<table>(p_id)` | 12 | `SET expired_at = NOW() WHERE expired_at IS NULL`; returns `integer` rows updated (0 = already gone — idempotent) |
| `update_<table>(p_id, …)` | 12 | **Append-only replace:** expire the active row, insert a fresh version with a new uuid, atomically; raises `no active row with id …` if nothing active. `update_owning_subsystem` takes `p_new_id` (smallint key is caller-supplied); `update_relationship_type` takes `p_new_name` (its identity is its name, `idCol='name'`) |
| `resolve_drift_finding(p_id, p_resolved_at DEFAULT NOW())` | 1 | Sets `resolved_at` on active + currently-unresolved findings; returns count (idempotent). **Expire ≠ resolve** — resolving keeps the row in the graph |

Named-parameter calls are recommended (e.g. `semantics.add_concept(p_name => 'WorkRequest')`).
`smallint` params (`add_owning_subsystem`, `owning_subsystem_id`) require an explicit
cast: `p_id => 1::smallint`.

Unlike the nebula SCD4 pattern, these procs are safe inside transactions
(no `recorded_on_dt` PK collision issue).

---

## Seed Data (V059)

| Lookup | Rows | Contents |
|--------|------|----------|
| `owning_subsystem` | 16 | nebula, conduit, assembly, tackle, cascade, harness, wind, harvest, **peb → "Persistent Engineering Brain"** (V062), knowledge, vision, terrain, timeclock, address-tts, bitemporal-api (no path yet — no source dir), semantics; **`path` backfilled for 15** (V062) |
| `concept` | 11 | Harvest, SegmentSet, Candidate, IntentRecord, Requirement, Specification, ImplementationPlan, WorkRequest, Agenda, Question, Asset |
| `concept_relationship` | 12 (3 green / 3 red / 6 unpathed) | Harvest→SegmentSet→Candidate→IntentRecord→Requirement→Specification→ImplementationPlan→WorkRequest + `spawns`/`basis_of`/`provenance_of` (see `semantics-db.md` chain) |
| `identity_strategy` | 6 | WorkRequest→`entity_key`, ImplementationPlan→`plan_number`, Requirement→`requirement_id`, Candidate→candidate UUID, IntentRecord→intent_record UUID, Asset→`canonical_asset_id` (identity root) |
| `relationship_type` | 29 (V060 + V061) | 6 concept + 4 representation + 14 cross-domain + 5 operational (calls/consumes/writes/reads/uses); each with a definition; FK-enforced as the only legal edge types |

Deliberately **not** seeded yet: `representation` / `representation_relationship` /
`consumer_operation` (the doc's Implementation-Plan example: WRP DAG node,
work_request table, Planner cache; Wind/Orb/Drift consumers) and
`representation_identity` — those need representation rows first.

---

## Migration Chain

| Migration | What it does | Status |
|-----------|-------------|--------|
| `sql/semantics.sql` | Base DDL (11 tables, 14 FKs) | applied both hosts |
| `V055__semantics_bitemporal.sql` | SCD Type 4 bitemporal overlay (nebula pattern) | **reverted by V057** — kept as honest history |
| `V056__representation_identity_system_time_only.sql` | Dropped valid time on the `representation_identity` lookup table | **superseded by V057** |
| `V057__semantics_design_model.sql` | Design-faithful rebuild: plain tables, 14 FKs restored, `expired_at` soft-delete, 33 procs, active-only partial unique indexes | **current** |
| `V058__semantics_resolve_drift_finding.sql` | `resolve_drift_finding` proc (drift lifecycle) | **current** |
| `V059__semantics_seed_lookup.sql` | Seeds the lookup layer (16 / 11 / 12 / 6) | **current** |
| `V060__semantics_relationship_vocabulary.sql` | `relationship_type` vocabulary (24 types) + proc trio + FK enforcement from both relationship tables | **current** |
| `V061__semantics_operational_relationships.sql` | 5 operational representation-scope types (calls/consumes/writes/reads/uses); `produces` broadened to `both` — "we can say these are true between any two representations" | **current** |
| `V062__semantics_owning_subsystem_path.sql` | `owning_subsystem.path` column + procs with `p_path`; PEB → "Persistent Engineering Brain"; path backfill (15/16) | **current** |

Commits: `52efd89` (V055) · `9ca6dae` (semantics.sql + V056 + V057) ·
`00d74c3` (V058) · `6dab22b` (V059) · V060–V062 (this change set).

**V057 is destructive on purpose:** it `DROP SCHEMA semantics CASCADE`s and
rebuilds, and refuses to run if any row exists. Later migrations are additive.

---

## How to Apply

```bash
# Local (primary — pgvector_db, PG 17):
cat nexus/sql/V061__semantics_operational_relationships.sql \
  | docker exec -i pgvector_db psql -U pguser -d nexus -v ON_ERROR_STOP=1

# Backup (Strontium, 172.16.30.2 — keep at parity):
export PGPASSWORD=pgpass
psql -h strontium -p 5432 -U pguser -d nexus -v ON_ERROR_STOP=1 \
  -f nexus/sql/V061__semantics_operational_relationships.sql
```

Every migration is idempotent (V057 via its empty-check guard; V059 via
`ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`), so re-application is safe.

---

## Design Notes & Caveats

- **Expire ≠ delete ≠ resolve.** `soft_delete_*` sets `expired_at` (row retained,
  hidden from active queries). `update_*` expires + inserts a new version (new
  uuid; old row retained so existing references stay valid). `resolve_drift_finding`
  sets `resolved_at` without expiring.
- **No views, no triggers, no temporal columns** here — that's the nebula SCD4
  discipline, deliberately *not* imported (see V057). Queries filter active rows
  with `WHERE expired_at IS NULL`.
- **`concept_relationship` is the legend; `cascade.lineage_edges` is the map.**
  Instance-level edges may later cite a class-level rule via a nullable FK on
  `cascade.lineage_edges` (proposed, not yet built).
- **Asset parentage is deliberately unbuilt** until canonical Asset identity lands.
- Concept/edge seed data is curated — extend via new migrations, and keep
  Strontium at parity whenever the schema or seed changes.
