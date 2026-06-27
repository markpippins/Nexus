# Cross-Reference Relation Type Taxonomy v0.1

**Status:** Active
**Spec Version:** 0.1
**Date:** 2026-06-27
**Plan Reference:** #0175
**Supersedes:** Ad-hoc `rel_type` values in `nebula.cross_references`

---

## 1. Purpose & Scope

This specification defines a **formal enumerated taxonomy** of relation types
for the `nebula.cross_references` table. It replaces the current ad-hoc
free-text `rel_type` strings with a governed enumeration that constrains
which entity types can be connected by which relation types.

### Canonical Artifacts

| Artifact | Location | Format |
|----------|----------|--------|
| Taxonomy Spec | `audit/SPECS/CROSSREF_TAXONOMY.md` | Markdown |
| JSON-LD Ontology | `schemas/relationships/wrp-crossref-taxonomy.jsonld` | JSON-LD |
| TypeScript Enum | `typescript/nebula-srv/src/crossref-taxonomy.ts` | TypeScript |
| Python Enum | `python/absorb/html/crossref_taxonomy.py` | Python |

### References

- WRP Protocol: `audit/SPECS/WRP_PROTOCOL.md`
- WRP Bridge: `audit/SPECS/CONDUIT_WRP_BRIDGE.md` (§7)
- Stratification Ontology: `schemas/core/stratification-ontology.json`
- Existing relationships: `schemas/relationships/*.jsonld`

---

## 2. Core Principles

### I1 — One Registry

> All valid `rel_type` values for `nebula.cross_references` are enumerated
> in exactly one place: the JSON-LD taxonomy file. Any code that reads or
> writes cross-references references this file or its TypeScript/Python
> mirrors.

### I2 — Source/Target Constraints

> Each relation type declares which entity types are valid as source and
> target. For example, `wrp:depends_on` requires both source and target
> to be of type `"plan"`. A cross-reference with mismatched types is
> structurally invalid.

### I3 — Direction is Semantic

> Relation types are directional. If a bidirectional relationship is needed,
> two symmetric relation types are defined (e.g., `sourced_from` and
> `informs`). A single relation type implies a single direction.

### I4 — Prefix Namespacing

> Relation types are namespaced with a prefix indicating their domain:
>
> | Prefix | Domain |
> |--------|--------|
> | `wrp:` | WorkRequest Protocol (plans, WRP states, DAG) |
> | `ag:` | Agent records, sessions, prompts |
> | `kv:` | Knowledge graph entities, harvests |
> | `sys:` | Systems, subsystems, features |

---

## 3. Relation Type Catalog

### 3.1 WRP Domain (`wrp:`)

| rel_type | Source Type | Target Type | Description | Status |
|----------|-------------|-------------|-------------|--------|
| `wrp:depends_on` | `plan` | `plan` | Plan A depends on plan B (B must be complete before A executes). Derived from `plan.dependencies`. | ✅ Implemented |
| `wrp:implements` | `plan` | `work_request` | Plan implements (satisfies) a WorkRequest. | ⏳ Pending |
| `wrp:tracked_by` | `work_request` | `plan` | WorkRequest is tracked by a plan (inverse of implements). | ⏳ Pending |
| `wrp:impacts_system` | `plan` | `system` | Plan affects a system or subsystem (shared files_affected). | ⏳ Pending |
| `wrp:supersedes` | `plan` | `plan` | New plan replaces an older plan (revision chain). | ⏳ Pending |

### 3.2 Agent Domain (`ag:`)

| rel_type | Source Type | Target Type | Description | Status |
|----------|-------------|-------------|-------------|--------|
| `ag:references_plan` | `agent_record` | `plan` | Agent record references a plan in its content. | ✅ Implemented |
| `ag:same_thread_as` | `agent_record` | `agent_record` | Two agent records belong to the same conversation thread. | ✅ Implemented |
| `ag:prompted_by` | `agent_record` | `prompt` | Agent record was produced in response to a prompt. | ✅ Implemented |
| `ag:spawns_plan` | `harvest_candidate` | `plan` | Harvest candidate caused a plan to be spawned. | ✅ Implemented |

### 3.3 Knowledge Domain (`kv:`)

| rel_type | Source Type | Target Type | Description | Status |
|----------|-------------|-------------|-------------|--------|
| `kv:sourced_from` | `knowledge_entity` | `harvest` | Knowledge entity content is sourced from a harvest. | ✅ Implemented |
| `kv:informs` | `harvest` | `knowledge_entity` | Harvest informed the creation of a knowledge entity (inverse of sourced_from). | ✅ Implemented |
| `kv:cross_schema` | `harvest_candidate_embedding` | `knowledge_entity_embedding` | Cross-schema semantic similarity link between vector embeddings. | ✅ Implemented |
| `kv:name_overlap` | `knowledge_entity` | `knowledge_entity` | Keyword overlap between entity names. | ✅ Implemented |
| `kv:description_overlap` | `knowledge_entity` | `knowledge_entity` | Keyword overlap between entity descriptions. | ✅ Implemented |

### 3.4 System Domain (`sys:`)

| rel_type | Source Type | Target Type | Description | Status |
|----------|-------------|-------------|-------------|--------|
| `sys:produces` | `system` | `artifact` | System produces an artifact (document, data, event). | 📋 Planned |
| `sys:consumes` | `system` | `artifact` | System consumes an artifact as input. | 📋 Planned |
| `sys:governed_by` | `system` | `policy` | System is governed by a policy or rule. | 📋 Planned |

### 3.5 Deprecated / Legacy

| rel_type | Replacement | Notes |
|----------|-------------|-------|
| `depends_on` (no prefix) | `wrp:depends_on` | Legacy backfill — kept for historical data, new writes must use `wrp:depends_on` |

---

## 4. Validation Contract

### 4.1 Type Constraint Matrix

Every relation type constrains source and target to a specific entity type.
The entity type is the value stored in `source_type` / `target_type` columns
of `nebula.cross_references`.

### 4.2 Database Enforcement

A CHECK constraint or trigger on `nebula.cross_references` MUST validate:

1. `rel_type` is a member of the enumerated set
2. `source_type` matches the allowed source type for that rel_type
3. `target_type` matches the allowed target type for that rel_type

### 4.3 API Enforcement

The POST `/api/cross-references` endpoint and
`nebula_create_cross_reference` MCP tool MUST validate the relation type
against the taxonomy before inserting.

### 4.4 On Invalid Input

If validation fails, the operation MUST:
- Return a 400-level error with a message identifying the constraint violated
- Not insert the row
- Include the allowed values in the error response

---

## 5. Enumeration Reference

```typescript
enum CrossReferenceType {
  // WRP domain
  WRP_DEPENDS_ON      = "wrp:depends_on",
  WRP_IMPLEMENTS      = "wrp:implements",
  WRP_TRACKED_BY      = "wrp:tracked_by",
  WRP_IMPACTS_SYSTEM  = "wrp:impacts_system",
  WRP_SUPERSEDES      = "wrp:supersedes",

  // Agent domain
  AG_REFERENCES_PLAN  = "ag:references_plan",
  AG_SAME_THREAD_AS   = "ag:same_thread_as",
  AG_PROMPTED_BY      = "ag:prompted_by",
  AG_SPAWNS_PLAN      = "ag:spawns_plan",

  // Knowledge domain
  KV_SOURCED_FROM          = "kv:sourced_from",
  KV_INFORMS               = "kv:informs",
  KV_CROSS_SCHEMA          = "kv:cross_schema",
  KV_NAME_OVERLAP          = "kv:name_overlap",
  KV_DESCRIPTION_OVERLAP   = "kv:description_overlap",
}
```

---

## 6. Implementation Plan

### Phase 1: Taxonomy Definition
1. Write this spec
2. Write JSON-LD ontology
3. Write TypeScript enum + type guard
4. Write Python enum

### Phase 2: Database Enforcement
5. Add CHECK constraint to `nebula.cross_references.rel_type`
6. Add trigger or application-level validation for source/target type constraints
7. Backfill legacy `depends_on` values to `wrp:depends_on`

### Phase 3: Bridge Integration
8. Implement `wrp:implements`, `wrp:tracked_by`, `wrp:impacts_system`, `wrp:supersedes` in conduit-wrp contract
9. Update Python reducer to emit new types
10. Update MCP tool descriptions with taxonomy reference

---

## 7. Relationship to Other Plans

| Plan | Relationship |
|------|-------------|
| #0175 | This specification — the taxonomy itself |
| #0174 | Conduit→Nebula WRP Bridge — consumer of WRP cross-reference types |
| #0176 | Nebula Review State Ontology — may define additional review-specific types |
| #0177 | WRP Document Projection Pipeline — renders cross-references in projections |
| #0165 | WRP v1.1 DAG Data Model — uses `wrp:depends_on` for DAG edges |
