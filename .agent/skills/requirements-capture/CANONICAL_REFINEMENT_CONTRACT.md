# Canonical Refinement Contract (CRC) v1

## Core Definition

A refinement is an authoritative replacement of one or more semantic dimensions of a Requirement, expressed as a new assertion event.

A refinement does not modify the past. It publishes a new interpretation.

---

## 1. Requirement Identity

A Requirement has a stable identity:

`REQ_ID = immutable`

Example: `REQ-001` remains `REQ-001` forever.

Refinement never creates a new requirement. It evolves meaning.

---

## 2. Refinement Is Snapshot-Based

Each `REQ_REFINED` event represents:

> "Given everything known so far, this is now true."

Not:
- patch
- delta
- mutation
- merge

### Event Shape

```json
REQ_REFINED {
  "event_id": "...",
  "timestamp": "...",
  "req_id": "REQ-001",
  "intent": "...",
  "constraints": [...],
  "artifacts": [...],
  "structure": {...},
  "rationale": "...",
  "acceptance": [...],
  "status_hint": "draft | proposed | review",
  "supersedes": ["EVENT-123"]
}
```

---

## 3. Field Semantics (The Critical Rule)

Every semantic field obeys:

| Field State | Meaning |
|---|---|
| Field omitted | preserve previous value |
| Field present | fully replace prior value |
| Field present and empty | explicitly clear |

This rule MUST NEVER change.

### Example

Previous projection:

```
constraints: ["must use PostgreSQL", "HIPAA compliant"]
```

Event:

```json
REQ_REFINED {
  "constraints": ["must use PostgreSQL"]
}
```

Result:

```
constraints: ["must use PostgreSQL"]
```

HIPAA constraint removed intentionally. No delete event needed.

---

## 4. Refinement Dimensions

A Requirement is composed of orthogonal semantic dimensions.

Recommended canonical set:

| Dimension | Meaning |
|---|---|
| `intent` | Human-readable purpose |
| `constraints` | Non-negotiable limits |
| `artifacts` | Linked files/resources |
| `structure` | Machine-readable model |
| `rationale` | Why decisions exist |
| `acceptance` | Validation criteria |
| `status_hint` | Author's suggested lifecycle position (`draft \| proposed \| review`) |

Agents may refine one dimension at a time.

---

## 4a. Scope Immutability Rule

`intent_scope` is set at requirement creation and is **immutable under refinement**.

| Scope | What it represents |
|---|---|
| `problem` | Real-world need or pain being solved |
| `capability` | System ability that must exist |
| `behavior` | Observable system behavior |
| `implementation` | Specific technical approach |
| `experiment` | Exploratory hypothesis |

### Why

`intent_scope` answers one invariant question:

> At what level of reality does this requirement make a promise?

Not what it says. Not how it's implemented. But where its intent lives.

### Enforcement

A refinement MUST NOT change `intent_scope`. If the scope must change, the requirement is superseded (`REQ_SUPERSEDED`) and a new requirement is created at the correct scope level.

### Examples (different scopes, different requirements)

| Scope | Expression |
|---|---|
| **problem** | Users cannot understand requirement history. |
| **capability** | System preserves deterministic requirement evolution. |
| **behavior** | Requirements display a complete event timeline. |
| **implementation** | Reducer rebuilds state from append-only log. |
| **experiment** | Try graph projection for requirement causality. |

These are not duplicates. They are different layers of intent.

### What this prevents

- requirement identity drift
- silent architectural rewrites
- accidental philosophy breaks

---

## 5. Reducer Law

Reducer behavior is intentionally boring:

```python
for event in ordered_events:
    if event.type == REQ_REFINED:
        for field in payload:
            requirement[field] = payload[field]
```

- No merging.
- No interpretation.
- No reconciliation.

The reducer does not think.

---

## 6. Projection Rule

The `RequirementNode` is always derived:

```
RequirementNode = latest projection of all REQ_* events
```

There is no stored mutable requirement object. Only projection.

---

## 7. Supersession Semantics

Refinement implies semantic supersession.

Optional field:

```json
"supersedes": ["EVENT-123"]
```

`supersedes` is an optional set of event identifiers indicating which prior semantic assertions this refinement intentionally replaces. It SHALL NOT affect reducer projection and exists solely for semantic lineage and reasoning.

Used for:
- audit trails
- reasoning
- agent explanation

But reducer correctness must not depend on it. Ordering alone defines truth.

---

## 8. Multi-Agent Safety Rule

Agents MUST:
- Read current projection
- Produce full reasoning
- Emit new refinement snapshot

Agents MUST NOT:
- assume exclusive ownership
- append blindly
- depend on local memory

This prevents divergence.

---

## 9. Refinement Is Reversible

Because refinements are assertions:

- You never undo.
- You refine again.

Correction example:

```
REQ_REFINED → mistake
REQ_REFINED → corrected understanding
```

History stays intact.

---

## 10. Refinement vs State Transition

Important separation:

| Concept | Mechanism |
|---|---|
| Meaning evolves | `REQ_REFINED` |
| Lifecycle evolves | `REQ_SUPERSEDED`, `REQ_SPLIT`, `REQ_MERGED`, `REQ_INVALIDATED`, `REQ_DUPLICATE_OF`, `REQ_IMPLEMENTED`, `REQ_TESTED` |
| Failure occurs | `FAILURE_EVENT` |

Never mix these. This prevents architectural collapse later.

---

## 11. Determinism Invariant

Given the same ordered event log, you MUST obtain an identical `RequirementNode` projection.

If any refinement rule breaks this → system violation.

---

## 12. Canonical Mental Model

Think:

```
Requirement = Wikipedia Page
Refinement = New Revision
```

Not edits. Not patches.

Revisions.

The event log is revision history.

---

## 13. The One Rule Future You Must Protect

If anyone proposes:

- partial merges
- collaborative append lists
- automatic reconciliation
- reducer intelligence

🚨 Stop immediately.

---

## 14. One-Sentence Contract

A refinement is an authoritative replacement of specified requirement dimensions, producing a new deterministic projection without mutating prior history.
