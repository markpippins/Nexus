# ADR-003 Implementation Summary (Updated)

## Migration 024

**File**: `nexus/typescript/nebula-srv/migrations/024-observations-assessments.sql`

### Tables Created (6 total)

| # | Table | Schema | Purpose |
|---|-------|--------|---------|
| 1 | `observations` | nebula | Records trigger events — what happened |
| 2 | `assessments` | nebula | Captures automated analysis — what we think |
| 3 | *(constraint dropped)* | — | agenda_items.source_type no longer CHECK-constrained |
| 4 | `specifications` | nebula | Versioned spec revisions (create/revise/merge/split/retire) |
| 5 | `work_requests` | nebula | Canonical business-layer work request |
| 6 | `active_specifications` | nebula (view) | Current active specification revisions |

### Architecture Decisions Enforced

| Decision | Rationale |
|----------|-----------|
| **`nebula.work_requests`** (not `nexus.`) | Follows established pattern: requirements, plans in nebula. A new `nexus` schema would fragment the business layer. |
| **Conduit owns execution projection** | `conduit.work_requests` becomes the runtime object, linked via `nexus_work_request_id`. conduit does not own the business meaning. |
| **No spec revision trigger** | "Agenda → specified" is a business event, not a data mutation. Must go through kernel: `AgendaStatusChanged → Assessment → SpecificationRevisionCreated → Event recorded` |
| **`create_plan()` ≠ `create_implementation_plan()`** | First is conduit-internal plan tracking. Second is the pipeline-level business record. Different aggregates, different tools. |
| **Assessment outcome is not always an Agenda** | Added `forum_post_id` outcome (informational) — awareness vs. agreement. See Amendment below. |

### Amendment: Assessment Outcome Model (2026-07-07)

Per `assessments.md` analysis, assessments now route to **two distinct output paths**:

```
Observation
    ↓
Assessment
    ├── informational → forum_post_id (awareness — "something interesting happened")
    └── needs_deliberation → agenda_id (agreement — "the organization needs to decide")
```

Four outcomes:

| outcome | meaning | link |
|---------|---------|------|
| `auto_resolved` | System handled it | `auto_resolve_plan_id` |
| `needs_deliberation` | Organizational decision required | `agenda_id` |
| `informational` | Awareness signal only | `forum_post_id` |
| `rejected` | Trigger invalid or below threshold | (none) |

The KG determines which path: "does this cross a decision boundary?"
Criteria: affects approved spec, violates policy, multiple systems affected,
confidence below threshold, conflicting evidence, no prior decision.

### Naming Convention

```
nebula.implementation_plan  →  becomes  →  nebula.work_request (canonical business record)
                                              ↓ dispatched via runtime_submit_work_request()
                                         conduit.work_request (runtime execution object)
                                              ↓ tracked via
                                         conduit.work_request_events (state transitions)
```

### What Needs a Separate Migration (Conduit Schema)

`conduit.work_requests` needs a new column to link back:
```sql
ALTER TABLE conduit.work_requests
  ADD COLUMN nexus_work_request_id uuid REFERENCES nebula.work_requests(id);
```
This is NOT in migration 024 — conduit schema is managed separately.

### Implementation Order

1. Apply Migration 024 (nebula schema)
2. Add `nexus_work_request_id` to conduit.work_requests (conduit migration)
3. Wire assessment into the pipeline (new pipeline stage)
4. Build event-driven spec revision creation (kernel integration)
5. KG sync layer (longest-term item)
