# Open Questions and Agenda Integration

**Date:** 2026-07-17
**Status:** Implemented (Migrations 035-037)

## Overview

This document describes the open questions and agenda integration schema, which provides a decision control plane around Requirements. The system tracks uncertainty, deliberation, and resolution before work proceeds to implementation.

## Architecture

### Three Graphs

1. **Requirement Graph** — Parent-child relationships via `parent_id`
   - "What are we trying to accomplish?"

2. **Question Graph** — Open questions linked to requirements
   - "What prevents us from proceeding?"

3. **Execution Graph** — Work requests and verification
   - "Can we safely construct this?"

### Two-Level Ripple Assessment

1. **Planner-level (pre-greenlight)** — Lightweight requirement readiness check
   - If deep analysis is needed → requirement is automatically RED
   - Output: greenlight OR open questions + agenda

2. **Validation-level (post-implementation, pre-conduit)** — Full ripple assessment
   - Works with DCO (implementation details exist)
   - Output: verified OR rejected

## Schema

### Tables Created

#### `nebula.open_questions`
Tracks questions that arise during requirement analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| requirement_id | UUID | Link to requirement |
| title | TEXT | Question title |
| description | TEXT | Question details |
| category | TEXT | AMBIGUITY, MISSING_INFO, CONFLICT, SCOPE, DEPENDENCY |
| status | TEXT | OPEN, IN_DELIBERATION, RESOLVED, WONT_FIX, DEFERRED |
| blocking | BOOLEAN | If TRUE, requirement cannot complete |
| resolution | TEXT | How it was resolved |
| resolved_by | TEXT | Role that resolved it |
| created_by | TEXT | Role that identified it |

#### `nebula.agenda_item_questions`
Links open questions to existing agenda_items for deliberation.

#### `nebula.deliberation_participants`
Tracks which roles participated in deliberating open questions.

#### `nebula.requirement_verifications`
Tracks verification by Engineer, Topologist, and Architect before Work Request enters conduit.

#### `nebula.roles`
Role definitions with capabilities, constraints, and cron configuration.

### Functions Created

| Function | Purpose |
|----------|---------|
| `has_open_questions(req_id)` | Recursive check: does requirement OR any descendant have blocking questions? |
| `get_blocking_questions(req_id)` | Returns all blocking questions with source tracking |
| `get_requirement_readiness_v2(req_id)` | Detailed breakdown including inherited questions |
| `can_complete_requirement(req_id)` | Boolean: can this requirement move to Done? |
| `can_transition_status(req_id, new_status)` | Validates status transitions against blocking questions |
| `is_fully_verified(req_id, wr_id)` | Boolean: have all roles approved this Work Request? |
| `can_role_perform(role_name, action)` | Validates if a role can perform a specific action |

### Views Created

| View | Purpose |
|------|---------|
| `v_requirements_with_questions` | Requirements with question counts |
| `v_requirements_full_status` | Requirements with inherited question counts |
| `v_requirement_dag_status` | Full DAG with inherited blocking status |
| `v_open_questions_with_context` | Open questions with requirement context |
| `v_role_capabilities` | Role capabilities matrix |

## Flow

### Requirement Lifecycle

```
Harvest Candidate → Requirement (ToDo)
        ↓
Planner evaluates (lightweight)
        ↓
    ┌─────────────┐
    │ Clear enough? │
    └─────────────┘
        ↓           ↓
       YES         NO
        ↓           ↓
    Greenlight    Decompose/Clarify
        ↓           ↓
    InProgress   Open Questions
        ↓           ↓
    Architect     Agenda
        ↓           ↓
    Spec + Plan   Deliberation
        ↓           ↓
    DCO created   Questions resolved
        ↓           ↓
    Engineer      → back to Planner
        ↓
    Implementation
        ↓
    Validation (full ripple assessment)
        ↓
    ┌─────────────┐
    │ Satisfies?    │
    └─────────────┘
        ↓           ↓
       YES         NO
        ↓           ↓
    Conduit       Rejected
        ↓           ↓
    Builder       Changes needed
```

### Roll-up Logic

A requirement is blocked if:
1. It has a blocking open question, OR
2. Any of its children has a blocking open question

This is enforced via `has_open_questions(req_id)` which recursively checks the requirement DAG.

### Status Flow

Valid transitions:
- Backlog → ToDo (always allowed)
- ToDo → InProgress (only if no blocking questions)
- ToDo → Blocked (always allowed - Planner creating agenda)
- Blocked → ToDo (only if no blocking questions)
- InProgress → Done (only if no blocking questions)
- InProgress → Blocked (new questions arise)

## Role Capabilities

| Role | Greenlight | Questions | Agendas | Resolve | Verify | Cron |
|------|------------|-----------|---------|---------|--------|------|
| planner | ✓ | ✓ | ✓ | ✓ | · | */30 |
| architect | · | ✓ | · | ✓ | ✓ | · |
| analyst | · | ✓ | · | ✓ | · | */15 |
| engineer | · | · | · | ✓ | · | · |
| topologist | · | · | · | ✓ | · | · |
| reviewer | · | · | · | · | · | · |
| inspector | · | ✓ | · | ✓ | · | ✓ |
| builder | · | · | · | · | · | · |

## Integration Points

### With Requirements
- Reads: `nebula.requirements` (ToDo status)
- Writes: `nebula.open_questions`, `nebula.agendas`
- Calls: `nebula.has_open_questions()`, `nebula.can_transition_status()`

### With Conduit
- Reads: `nebula.implementation_plans`
- Writes: Assessments for plan readiness

### With Assembly
- Posts: Agenda topics for deliberation
- Reads: Role responses and decisions

## Next Steps

1. Build Planner cron process
2. Add ripple assessment function to schema
3. Integrate with nebula-ui (show open questions on requirements)
