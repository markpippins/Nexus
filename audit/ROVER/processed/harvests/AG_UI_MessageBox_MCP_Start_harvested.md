# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/AG-UI MessageBox MCP Start.html
**Model:** DeepSeek V4
**Total candidates:** 5
---
## 1. MessageBox MCP Provider Abstraction — Transport-Independent Semantic Messaging Layer
**Status:** `Agreed`

### Architectural Intent
Define MessageBox as a semantic messaging layer with a pluggable transport provider interface, keeping the kernel and steward transport-agnostic. The MCPProvider interface defines publish(subject, event), subscribe(filter, handler), and replay(query) — transport implementations (SQLite, NATS, Redis, WebSocket) conform to this contract. Critical layering: Kernel never sees NATS; Steward never sees Redis. They only see MessageBox. This preserves the semantic contract as the source of truth while making transport replaceable.

### Requirements & Acceptance Criteria
- [ ] MCPProvider interface: publish(MCPEvent), subscribe(EventFilter, EventHandler), replay(ReplayQuery)
- [ ] Transport and Ledger must be separate layers — NATS is transport (live traffic), SQLite/Postgres is ledger (historical truth)
- [ ] Kernel and Steward must never directly access transport or ledger — only through MessageBox
- [ ] Subject mapping: subject = event.type for V1 — don't over-engineer
- [ ] Message semantics chain must remain: Intent → Command → Event → Receipt → Proposal → Projection

### Harvested Code Artifacts
#### Purpose: MCPProvider interface — transport-agnostic messaging contract
```typescript
interface MCPProvider {
  publish(event: MCPEvent): Promise<void>;
  subscribe(filter: EventFilter, handler: EventHandler): Promise<Unsubscribe>;
  replay(query: ReplayQuery): AsyncIterable<MCPEvent>;
}
```

### Unresolved Follow-Ups
- What is the ReplayQuery schema — time range, event type filter, correlation ID?
- How are multiple providers composed when both transport and ledger are needed?

---

## 2. Distributed Event Identity Model — Correlation, Causation, and Per-Stream Ordering
**Status:** `Agreed`

### Architectural Intent
Define mandatory distributed event identity fields for multi-node execution: id (unique), correlationId (groups related events), causationId (tracks parent event), sequence (per-stream ordering). Do NOT attempt global ordering across all nodes — use per-stream ordering instead (e.g., workrequest-123 is ordered, system-wide is not). Natural partition key is workrequestId — everything related to WR-123 routes together, giving deterministic replay, deterministic execution, and natural sharding.

### Requirements & Acceptance Criteria
- [ ] Every distributed event must include: id, correlationId, causationId (optional), sequence (optional)
- [ ] Ordering model: per-stream ordering only — workrequest-123 is ordered, system-wide is not
- [ ] Partitioning: natural partition key = workrequestId — same WR events route together
- [ ] At-least-once delivery acceptable — use idempotent handlers, not exactly-once
- [ ] Deduplication must use id field for idempotency

### Unresolved Follow-Ups
- How is causationId propagated across multiple hops when event chains span nodes?
- What is the deduplication window — how long are event IDs retained for idempotency?

---

## 3. Message Semantics Stabilization — Intent/Command/Event/Receipt/Proposal Chain
**Status:** `Agreed`

### Architectural Intent
The message semantics have stabilized into a 6-category chain: Intent (what should happen), Command (initiate action), Event (what happened), Receipt (proof of execution), Proposal (suggested change), Projection (derived view). This replaces months of terminology evolution (Event? ServiceRequest? Response? Message?). The shape has stabilized even if exact names evolve. These are the semantic categories that flow through MessageBox — transport doesn't care about semantics.

### Requirements & Acceptance Criteria
- [ ] Message semantics chain: Intent → Command → Event → Receipt → Proposal → Projection
- [ ] Each semantic type must have a defined schema and lifecycle
- [ ] Transport layer must not interpret semantics — it routes opaque envelopes
- [ ] The semantic contract is the source of truth, not the transport
- [ ] New message types must extend this chain, not bypass it

### Unresolved Follow-Ups
- Are these 6 categories formally proven to be the correct set — or are they discovered abstractions needing formal verification?
- What is the dispute-resolution model when Steward (single writer) receives conflicting proposals?

---

## 4. Distributed Kernel — Lease-Based WorkRequest Ownership
**Status:** `Proposed`

### Architectural Intent
Scale the Kernel across nodes using lease-based WorkRequest ownership. Only one Kernel should own a WorkRequest at a time. Introduce lease events: workrequest.claimed and workrequest.released. This intersects with Vector (observation/state awareness) for execution management. This maps directly to NBK's Lease primitive — the distributed kernel is a natural extension of the existing lease model.

### Requirements & Acceptance Criteria
- [ ] Only one Kernel may own a WorkRequest at any given time
- [ ] Lease events: workrequest.claimed, workrequest.released
- [ ] Lease ownership must be deterministic and replayable
- [ ] Kernel A, B, C must not conflict on WorkRequest ownership
- [ ] Steward must remain single writer even in distributed mode — many readers, one writer

### Unresolved Follow-Ups
- What is the lease timeout and renewal protocol for distributed kernels?
- How are orphaned leases (kernel crash) detected and reassigned?

---

## 5. Architecture Compilation Phase — From Discovery to Engineering Artifacts
**Status:** `Agreed`

### Architectural Intent
The system has crossed the threshold from architecture discovery to architecture compilation. Earlier conversations did both simultaneously (discover → challenge → rename → connect → specify in one thread). Now the transcript is decomposable into independent chunks that different models can process without creating contradictions. The major abstractions have stabilized: Message Semantics (Intent/Command/Event/Receipt/Proposal), Knowledge Governance (Steward = Single Writer), Execution (WorkRequest → DAG → Receipts), Runtime Separation (Conduit=routing, Vector=observation, Kernel=process governance, Steward=knowledge governance, MessageBox=semantic transport, LOSM=runtime model).

### Requirements & Acceptance Criteria
- [ ] Transcript must be decomposable into independent chunks for parallel model processing
- [ ] Generated plans should get shorter than the conversation — sign of real abstraction discovery
- [ ] Architecture audit should surface unstated assumptions: ASSUMPTION-NNN with why, where, what breaks if false, required specification
- [ ] BP/architect role produces: SPEC-NNNN Message Semantics, SPEC-NNNN MessageBox MCP, SPEC-NNNN WorkRequest Lifecycle, etc.
- [ ] The exploratory phase is winding down; the build phase is beginning

### Unresolved Follow-Ups
- What are the formal ASSUMPTION-NNN records for the unstated architectural assumptions?
- Which missing specifications are blocking implementation vs can be deferred?

---
