---
name: requirements-capture
description: Records the current state of requirements as an append-only event log in .pipeline/REQUIREMENTS_CAPTURE_RECORD.
---

# Requirements Capture Skill: Formal Spec v1

## 1. SYSTEM OVERVIEW
This system is an event-sourced requirements engine.

### 1.1 System Boundary

requirements-capture is a **domain-modeling-only** subsystem. It operates within the `ExecutionState` context established by the control plane. See [`REQUIREMENTS_CAPTURE_BOUNDARY.md`](../../docs/REQUIREMENTS_CAPTURE_BOUNDARY.md) for the full specification.

**Non-negotiable rule**: `requirements-capture` never decides *how* execution happens. It only decides *what work exists*.

| Question | Answered by |
|---|---|
| *What kind of run is this?* | `normalize-intent` |
| *Where does it go?* | `mode-router` |
| *What work exists?* | `requirements-capture` |

**Hard constraints (F1–F3):**
- F1 — No intent inference: MUST NOT infer autonomy level, safety mode, execution mode, or routing preference
- F2 — No structural execution influence: MUST NOT choose validators, change execution order, inject stages, or alter pipeline topology
- F3 — No control feedback: MUST NOT cause `ExecutionState ← requirements-capture output`. `ExecutionState` is read-only

**Input rules:**
- MAY consume: conversation history, artifacts, prior execution events, domain context, user requirements statements
- MAY read `ExecutionState` as read-only context
- MAY NOT consume: `PIPELINE_INTENT.yaml`, routing configuration, mode selection logic, `ExecutionState` mutation authority

**Output rules:**
- MAY emit: `WorkRequestGraph`, `RequirementEvents`, `RequirementAnnotations`
- MUST NOT emit: routing hints, execution modes, validator directives, pipeline stage decisions

**Dependency direction:**
- Allowed: `requirements-capture → execution types`
- Forbidden: `requirements-capture → control-plane modules` (normalize-intent, mode-router, etc.)

**Core Principle**
All requirement state is derived deterministically from an append-only event log. There is no mutable requirement state.

## 2. STORAGE MODEL
### 2.1 Event Log (Source of Truth)
- Directory: `.pipeline/REQUIREMENTS_CAPTURE_RECORD/`
- Append-only JSON files
- Each file contains exactly one event
- File names are opaque and ordering-safe (timestamp + sequence or monotonic ID)

### 2.2 Derived Artifacts (Regenerated)
These are NOT authoritative and MUST be fully regenerated from events:
- `REQUIREMENTS_INDEX.json`
- `REQUIREMENTS_GRAPH.json`
- `REQUIREMENTS_TO_DATE.md`
- `/active/` (optional projection)
- `/historical/` (optional projection)

## 3. CORE DATA MODEL
### 3.1 Requirement Identity
- `RequirementID = string` (format: `REQ-YYYYMMDD-NNN`)
- Immutable
- Never reused
- Never versioned

### 3.2 Event Schema (base type)
```json
{
  "event_id": "string",
  "type": "REQ_*",
  "req_id": "RequirementID",
  "timestamp": "ISO-8601",
  "payload": {}
}
```

## 4. CANONICAL EVENT SET
### 4.1 REQ_CREATED
```json
{
  "type": "REQ_CREATED",
  "req_id": "REQ-001",
  "payload": {
    "intent": "string",
    "implementation_hint": "string",
    "type": "functional | architectural | constraint | workflow | research | hypothesis | decision | failure",
    "narrative": "string (markdown)",
    "structure": {
      "entities": [
        {
          "name": "string",
          "type": "string",
          "props": {}
        }
      ],
      "relations": [
        {
          "source": "string",
          "target": "string",
          "type": "string"
        }
      ]
    },
    "constraints": ["string"],
    "artifacts": [
      {
        "path": "string",
        "description": "string",
        "type": "string"
      }
    ],
    "intent_scope": "problem | capability | behavior | implementation | experiment"
  }
}
```

### 4.2 REQ_REFINED
```json
{
  "type": "REQ_REFINED",
  "req_id": "REQ-001",
  "payload": {
    "intent": "string?",
    "implementation_hint": "string?",
    "confidence": "number (0.0–1.0)?",
    "narrative": "string (markdown)?",
    "structure": {
      "entities": [
        {
          "name": "string",
          "type": "string",
          "props": {}
        }
      ],
      "relations": [
        {
          "source": "string",
          "target": "string",
          "type": "string"
        }
      ]
    },
    "constraints": ["string"],
    "artifacts": [
      {
        "path": "string",
        "description": "string",
        "type": "string"
      }
    ],
    "rationale": "string?",
    "acceptance": ["string"],
    "status_hint": "draft | proposed | review",
    "supersedes": ["EVENT-ID"]
  }
}
```

**Refinement semantics**: All array and object fields are authoritative replacements.
- Field absent in payload → keep previous value (no change)
- Field present in payload → replace fully (not a diff or merge, not incremental)
- Empty array (`[]`) or empty object (`{}`) → explicit clear

This means `REQ_REFINED { "constraints": [...] }` replaces constraints only, while `REQ_REFINED { "constraints": [] }` explicitly clears them. You do not need to send every field on every refinement.

See [`CANONICAL_REFINEMENT_CONTRACT.md`](./CANONICAL_REFINEMENT_CONTRACT.md) for the full Canonical Refinement Contract — the definitive spec governing reducer law, field semantics, multi-agent safety, and the determinism invariant.

### 4.3 REQ_SUPERSEDED
```json
{
  "type": "REQ_SUPERSEDED",
  "req_id": "REQ-001",
  "payload": {
    "superseded_by": ["REQ-010"],
    "reason": "string"
  }
}
```

### 4.4 REQ_SPLIT
```json
{
  "type": "REQ_SPLIT",
  "req_id": "REQ-001",
  "payload": {
    "children": ["REQ-002", "REQ-003"],
    "mapping": {
      "REQ-002": "string",
      "REQ-003": "string"
    }
  }
}
```

### 4.5 REQ_MERGED
```json
{
  "type": "REQ_MERGED",
  "req_id": "REQ-NEW-OR-CANONICAL",
  "payload": {
    "req_ids": ["REQ-002", "REQ-003"]
  }
}
```

### 4.6 REQ_INVALIDATED
```json
{
  "type": "REQ_INVALIDATED",
  "req_id": "REQ-003",
  "payload": {
    "reason": "string"
  }
}
```

### 4.7 REQ_DUPLICATE_OF
```json
{
  "type": "REQ_DUPLICATE_OF",
  "req_id": "REQ-003",
  "payload": {
    "duplicate_of": "REQ-001"
  }
}
```

### 4.8 REQ_IMPLEMENTED
```json
{
  "type": "REQ_IMPLEMENTED",
  "req_id": "REQ-002",
  "payload": {
    "implementation_ref": "string"
  }
}
```

### 4.9 REQ_TESTED
```json
{
  "type": "REQ_TESTED",
  "req_id": "REQ-002",
  "payload": {
    "result": "pass | fail"
  }
}
```

## 5. STATE SPACE & ACTIVE SET RULE
Each requirement has exactly one computed state.

**Terminal states**: `SUPERSEDED`, `SPLIT`, `MERGED`, `INVALIDATED`, `ALIAS`  
**Non-terminal states**: `ACTIVE`, `IMPLEMENTED`, `TESTED` (can optionally be terminal depending on policy)

### ACTIVE DEFINITION
A node is ACTIVE iff `STATE == ACTIVE`.
A requirement is ACTIVE iff it is:
- not terminal
- not alias
- not superseded
- not invalidated
- not merged-away
- not split parent terminal

## 6. EVENT → STATE TRANSITION TABLE (REDUCER CORE)
*For the complete programmatic architecture and validation logic of the reducer function, see [REDUCER_CONTRACT.md](./REDUCER_CONTRACT.md).*
### 6.1 Valid Transitions
- **REQ_CREATED**: `∅ → ACTIVE` (Create node, set metadata, add to INDEX)
- **REQ_REFINED**: `ANY → SAME` (MAY NOT change state, but MAY trigger recomputation flags in INDEX reducer to prevent state changes via metadata drift. No graph changes)
- **REQ_SUPERSEDED**: `ACTIVE → SUPERSEDED` (Mark terminal, create edges → superseding nodes. MUST reference ≥1 valid req_id)
- **REQ_SPLIT**: `ACTIVE → SPLIT` (Parent becomes terminal, edges parent → children. Children become ACTIVE)
- **REQ_MERGED**: `ACTIVE + ACTIVE → MERGED + ACTIVE` (Sources become MERGED, target becomes ACTIVE, edges sources → target)
- **REQ_INVALIDATED**: `ACTIVE → INVALIDATED` (Remove from ACTIVE projection, preserve in history)
- **REQ_DUPLICATE_OF**: `ANY (except ALIAS) → ALIAS` (Collapse into canonical node in INDEX view, create alias edge. MUST specify duplicate_of)
- **REQ_IMPLEMENTED**: `ACTIVE → IMPLEMENTED` (Attach implementation reference, move out of ACTIVE set)
- **REQ_TESTED**: `IMPLEMENTED → TESTED` (Attach test result. Optional policy: FAIL → ACTIVE to reopen)

### 6.2 Invalid Transitions (Strict Rules)
These MUST be rejected:
- `SUPERSEDED → ACTIVE`
- `INVALIDATED → ACTIVE` (unless explicit REOPEN event added later)
- `ALIAS → ACTIVE`
- `MERGED → ACTIVE`
- `SPLIT → ACTIVE` (parent only; children are separate nodes)

### 6.3 Index Derivation Rule
For each requirement ID:
`state = ACTIVE`
Iterate chronologically over events. Apply the transitions above. Return final state. INDEX is always fully regenerated from event log. No incremental updates allowed.

## 7. GRAPH TRANSITION RULES
*For the complete causal mapping and edge derivation logic, see [GRAPH_SEMANTICS.md](./GRAPH_SEMANTICS.md).*
### 7.1 Edge creation rules
- **SPLIT**: parent → children
- **MERGED**: sources → target
- **SUPERSEDED**: source → superseding
- **DUPLICATE**: node → canonical

### 7.2 Edge persistence rule
Edges are derived only from events, never stored directly. **Key Invariant: GRAPH is a pure function of an event prefix; no historical edge mutation is allowed.** This ensures replay is deterministic and edges do not oscillate. Graph must be fully reconstructable from events.

## 8. DERIVED ARTIFACT SPECS
### 8.1 INDEX.json
```json
{
  "REQ-001": {
    "state": "active",
    "intent": "...",
    "implementation_hint": "...",
    "confidence": 0.7,
    "narrative": "...",
    "structure": {
      "entities": [],
      "relations": []
    },
    "constraints": [],
    "artifacts": [],
    "rationale": "...",
    "acceptance": [],
    "status_hint": "draft",
    "intent_scope": "behavior",
    "lineage": {
      "parents": [],
      "children": [],
      "aliases": [],
      "superseded_by": [],
      "merged_into": []
    }
  }
}
```

### 8.2 GRAPH.json
```json
{
  "nodes": ["REQ-001", "REQ-002"],
  "edges": [
    {
      "from": "REQ-001",
      "to": "REQ-002",
      "type": "split | merge | supersede | duplicate"
    }
  ]
}
```

### 8.3 TO_DATE.md
Human-readable projection of INDEX. Must include:
- ACTIVE list grouped by type/state
- Terminal states summary
- Recent transitions (optional log excerpt)

## 9. FOLDER RULES (IMPORTANT)
`/active` and `/historical` are OPTIONAL projections only.
- MUST be regenerated from INDEX
- MUST NOT be source of truth
- MUST NOT contain independent state

## 10. SYSTEM INVARIANTS
These must ALWAYS hold:
- **I1 — Determinism**: Same event log ⇒ same INDEX every time.
- **I2 — Single active identity**: No duplicate ACTIVE nodes for same logical requirement.
- **I3 — Event immutability**: Events are append-only. No event is ever modified or deleted.
- **I4 — No backward transitions**: State transitions must follow table only.
- **I5 — Graph derivability**: Graph must be fully reconstructable from events. All derived artifacts are functions of events only.
- **I6 — No dual truth**: Only CAPTURE_RECORD is authoritative.
- **I7 — Identity binding**: Every event MUST reference exactly one canonical REQ_ID that exists or is created in the same event stream. This prevents orphan events, implicit node creation during logic, and hidden identity forks.

## 11. IMPLEMENTATION NOTE (Python mapping suggestion)
This maps cleanly to:
```python
TRANSITIONS = {
    "REQ_CREATED": created_handler,
    "REQ_REFINED": refine_handler,
    "REQ_SUPERSEDED": supersede_handler,
    "REQ_SPLIT": split_handler,
    "REQ_MERGED": merge_handler,
    "REQ_INVALIDATED": invalidate_handler,
    "REQ_DUPLICATE_OF": duplicate_handler,
    "REQ_IMPLEMENTED": implemented_handler,
    "REQ_TESTED": tested_handler,
}
```
Each handler returns: updated node state, graph mutations (derived, not stored), and metadata updates.

## 12. SYSTEM ARCHITECTURE LAYERS
At this point, the system is a closed loop composed of 8 discrete layers:
1. **Event layer**: append-only semantic history (defined in this `SKILL.md`)
2. **Reducer layer**: deterministic state + graph construction (defined in [`REDUCER_CONTRACT.md`](./REDUCER_CONTRACT.md))
3. **Projection layer**: `INDEX`, `GRAPH`, `TO_DATE` (defined in [`GRAPH_SEMANTICS.md`](./GRAPH_SEMANTICS.md))
4. **Query layer**: composable reasoning interface (defined in [`QUERY_DSL.md`](./QUERY_DSL.md))
5. **Execution layer**: deterministic task projection + scheduling (defined in [`EXECUTION_BINDING.md`](./EXECUTION_BINDING.md))
6. **Conflict Resolution layer**: deterministic ambiguity resolution + blocking logic (defined in [`CONFLICT_RESOLUTION.md`](./CONFLICT_RESOLUTION.md))
7. **Multi-agent layer**: concurrent proposal system + deterministic arbitration (defined in [`MULTI_AGENT_COORDINATION.md`](./MULTI_AGENT_COORDINATION.md))
8. **Failure layer**: structured failure representation + deterministic recovery (defined in [`FAILURE_SEMANTICS.md`](./FAILURE_SEMANTICS.md))

## 13. SYSTEM FORMULA
```text
AGENTS (parallel)
  → propose events
    → ARBITRATION (total order)
      → EVENT LOG (single truth)
        → REDUCER
          → INDEX + GRAPH
            → QUERY DSL
              → EXECUTION
                → CONFLICT SYSTEM
                  → FAILURE DETECTION
                    → FAILURE GRAPH
                      → EVENTS
                        → AGENTS
```

## 14. SUMMARY
The system supports concurrent multi-agent reasoning by restricting agents to stateless event proposal, enforcing a deterministic arbitration layer that linearizes all outputs into a single event log, and representing all failures as first-class event-sourced graph data, preserving a globally consistent, deterministic, and failure-safe requirement graph under parallel execution.