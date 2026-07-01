# Nebula Knowledge Stratification Ontology

**Status:** Active
**Ontology Version:** 1.0
**Date:** 2026-06-27
**Supersedes:** Inline stratification rules in `AGENTS.md`

---

## 1. Overview

Nebula uses a **two-axis knowledge stratification** to control how agents
access the knowledge graph. Every document and chunk carries two independent
attributes:

- **Axis 1: Abstraction Level (L1–L4)** — How abstract or concrete the content is
- **Axis 2: Visibility Scope** — Which roles can see the content

The formal ontology is defined in `schemas/core/stratification-ontology.json`.

### Guiding Principle

> We distribute **access projections** over a single knowledge graph, not
> distribute the knowledge itself. Every agent sees a filtered view of the
> same graph, tuned to their role's abstraction level and visibility scope.
> Cross-references are the mechanism for expanding that view when context
> demands it.

---

## 2. Abstraction Levels (Axis 1)

| Level | Name | Description | Primary Consumers |
|-------|------|-------------|-------------------|
| **L1** | Raw / operational | Build details, APIs, schemas, method contracts, error codes, config values | Builder |
| **L2** | Structured / intermediate | Subsystem design, DAG semantics, traversal behavior, data models | Builder (secondary), Architect |
| **L3** | Planning / architectural | Why systems exist, migration philosophy, architectural rationale, trade-offs | Architect, Inspector |
| **L4** | Meta / system reasoning | Cross-system doctrine, ontology definitions, role boundaries, governance rules | Architect (opt-in) |

### Rules

1. **Single-primary-level per chunk** — no multi-level ambiguity; a chunk
   targets exactly one level.
2. **Chunks can override document level** when content diverges from the
   parent document's dominant level.
3. **Content nodes own the abstraction level** — cross-reference edges remain
   level-neutral.

---

## 3. ChunkKind Enum (12 Types)

| Value | Description | Typical Level |
|-------|-------------|---------------|
| `OVERVIEW` | High-level summary of a topic or system | L2–L3 |
| `DEFINITION` | Formal definition of a concept, term, or entity | L1–L2 |
| `PROTOCOL_RULE` | Protocol invariant, transition rule, or governance constraint | L3–L4 |
| `DATA_MODEL` | Schema definition, type system, field specification | L1 |
| `ALGORITHM` | Algorithm description, pseudocode, traversal logic | L1–L2 |
| `INVARIANT` | System invariant that must hold across states | L3 |
| `MIGRATION_STEP` | Step in a migration or rollout plan | L2 |
| `ACCEPTANCE_CRITERIA` | Measurable condition for acceptance | L1 |
| `OPEN_QUESTION` | Unresolved question requiring future resolution | L3–L4 |
| `EXAMPLE` | Illustrative example of a concept in use | L1 |
| `RATIONALE` | Design rationale or trade-off analysis | L3 |
| `IMPLEMENTATION_NOTE` | Implementation-specific detail or caveat | L1 |

---

## 4. NormativeStrength Enum

| Value | Description |
|-------|-------------|
| `INFORMATIVE` | For reference only — no compliance required |
| `RECOMMENDED` | Should be followed; deviation requires documented justification |
| `REQUIRED` | Must be followed — violation is a compliance issue |
| `PROHIBITED` | Must not be done — violation is a compliance issue |

---

## 5. Visibility Scopes (Axis 2)

| Scope | Effect |
|-------|--------|
| `builder` | Visible to builder role only |
| `architect` | Visible to architect role only |
| `planner` | Visible to planner role only |
| `reviewer` | Visible to reviewer role only |
| `analyst` | Visible to analyst role only |
| `inspector` | Visible to inspector role only |
| `all` | Visible to all roles |

---

## 6. Per-Role Query Filters

| Role | Level Filter | Visibility Filter | Cross-Reference Expansion |
|------|-------------|-------------------|--------------------------|
| **Builder** | `level ≤ 1` primary, `level ≤ 2` secondary | `scope IN (builder, all)` | Conditional — only when blocked or asked for context |
| **Architect** | `level ≤ 3` primary, `level = 4` allowed | `scope IN (architect, all)` | Default — expanded for design context |
| **Planner** | `level ≤ 2` primary, `level ≤ 3` allowed | `scope IN (planner, all)` | Conditional — only when scoping a plan |
| **Reviewer** | `level ≤ 2` | `scope IN (reviewer, builder, all)` | Conditional — cross-ref to verify implementation matches spec |
| **Inspector** | `level ≤ 3` with preference for normative chunks | `scope IN (all)` | Default — lineage tracing |
| **Analyst** | `level ≤ 3` | `scope IN (analyst, all)` | Default — gap analysis needs full context |

---

## 7. Cross-Reference Semantics

Cross-references are a **conditional expansion operator**, not a default join.
They create edges between artifacts (e.g., Protocol→DAG, DAG→Traversal) that
are traversed only when the agent's context demands it:

- **Builder** starts with a narrow slice (L1, own scope) and expands via
  cross-reference traversal under blocker conditions (e.g., "why does this API
  exist?" → expands to L2 rationale)
- **Architect** starts broader (L2/L3) and uses cross-references to trace
  design lineage
- **Inspector** uses cross-references aggressively for compliance auditing

---

## 8. DDL Integration

This ontology defines the semantic classification rules that the DDL
infrastructure (plans #0161–#0163) implements as database columns.
The following columns are required:

### `nebula_documents` table

| Column | Type | Purpose |
|--------|------|---------|
| `level` | `L1\|L2\|L3\|L4` | Document's dominant abstraction level |
| `visibility_scope` | `TEXT` | Default visibility for document chunks |

### `nebula_chunks` table

| Column | Type | Purpose |
|--------|------|---------|
| `level` | `L1\|L2\|L3\|L4` | Chunk's abstraction level |
| `chunk_kind` | `ChunkKind` | Type of content in this chunk |
| `normative_strength` | `NormativeStrength` | How binding the content is |
| `visibility_scope` | `TEXT` | Role visibility filter |

---

## 9. Relationship to Other Plans

| Plan | Relationship |
|------|-------------|
| #0161–#0163 | DDL infrastructure that implements stratification columns |
| #0174 | Conduit→Nebula Bridge uses stratification to project WRP artifacts |
| #0176 | Review state ontology operates within stratification levels |
| AGENTS.md | Original source of stratification rules (now formalized here) |
