# Message Semantic Taxonomy

**Status:** Proposed | **Area:** MessageBox / LOSM | **Date:** 2026-06-18

## Overview

Messages are classified by **semantic role**, not just topic. The semantic role tells you what kind of truth claim the message represents, independent of its transport or subject.

## Taxonomy

```
Message
├── Intent       — desire ("I want this done")
├── Command      — obligation ("do step A")
├── Event        — observation ("step started")
├── Receipt      — evidence ("step completed, hash=..., output=..., duration=...")
├── Proposal     — suggested KG mutation ("create node X with type Y")
└── Projection   — derived state view ("workrequest.current_state")
```

### Intent
- Emitted by: AG-UI, agents, users
- Semantic: **desire**, not yet actionable
- Can be rejected, deferred, or decomposed
- Example subject: `intent.workrequest.execute`

### Command
- Emitted by: Kernel (after validating intent)
- Semantic: **obligation** — the system has decided this should happen
- Carries a specific instruction for a specific handler
- Example subject: `command.step.run`

### Event
- Emitted by: Workers, runtime components
- Semantic: **observation** — something occurred
- Cannot be rejected; it is a fact about what was observed
- May be incomplete or inaccurate (events can lie)
- Example subject: `event.step.started`

### Receipt
- Emitted by: Workers, Kernel, Steward
- Semantic: **evidence** — provable outcome with attestation
- Stronger than an event: carries hash, output references, duration
- Forms the audit trail for replay
- Example subject: `receipt.step.completed`

### Proposal
- Emitted by: Workers (after producing a receipt)
- Semantic: **suggested state change** to the Knowledge Graph
- Never directly mutates the KG — must go through Steward
- Always traceable to a source receipt (why do we believe this?)
- Example subjects:
  ```
  proposal.kg.create
  proposal.kg.update
  proposal.kg.merge
  proposal.kg.reclassify
  proposal.kg.delete
  ```

### Projection
- Emitted by: Steward, Kernel, or other state holders
- Semantic: **derived view** of current state
- Not a first-class fact; recomputed from Receipts
- Example subject: `projection.workrequest.state`

## Subject Naming Convention

```
<semantic-role>.<domain>.<action>[.<qualifier>]
```

Examples:
```
intent.workrequest.execute
command.step.run
event.step.started
receipt.step.completed
proposal.kg.create
projection.workrequest.state
```

## Why This Matters

Classic messaging systems (NATS, Kafka) classify primarily by topic. This taxonomy layers ontological meaning on top of transport routing. The same subject structure can map 1:1 onto NATS subjects, Redis stream keys, or database tables — the transport does not care about the semantics, only the routing.

## Relationship to Existing Systems

| Concept | NATS | Kafka | LOSM Equivalent |
|---------|------|-------|-----------------|
| Pub/sub | Subject | Topic | Semantic role + subject |
| Request/reply | Service API | — | Intent → Receipt flow |
| Exactly-once | — | Idempotent producer | Receipt with hash |
| Stream replay | JetStream | Consumer groups | Ledger provider replay |
