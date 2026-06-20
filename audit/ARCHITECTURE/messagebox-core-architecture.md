# MessageBox Core Architecture

**Status:** Proposed | **Area:** MessageBox / MCP | **Date:** 2026-06-18

## Related Architecture Documents

| Document | Relationship |
|---|---|
| [`message-semantic-taxonomy.md`](./message-semantic-taxonomy.md) | Semantic role classification (Intent/Command/Event/Receipt/Proposal/Projection) |
| [`transport-abstraction-spec.md`](./transport-abstraction-spec.md) | TransportProvider and LedgerProvider interfaces; NATS/Redis specs |
| [`steward-spec.md`](./steward-spec.md) | Knowledge Graph Governor — sole KG writer, consumes proposals via MessageBox |
| [`conduit-hang-remediation.md`](./conduit-hang-remediation.md) | Conduit hang cycle fixes affecting model dispatch |

## Default Stack (Production)

```
Transport:    NATS
Ledger:       Postgres
KG Backend:   Postgres (via GraphAdapter with adjacency list + CTEs)
```

SQLite is used only in CI, isolated test, or single-binary edge deployments where Postgres is unavailable. All production and multi-node configurations default to Postgres.

## Architecture Layering

```
LOSM-IR
   ↓
WorkRequest IR
   ↓
Message Semantics (Intent/Command/Event/Receipt/Proposal/Projection)
   ↓
MessageBox MCP (Canonical Messaging Semantics)
   ↓
Transport Provider ────────── Ledger Provider
    ├── NATS                      ├── Postgres (default)
    ├── Redis                     ├── EventStoreDB
    ├── WebSocket                 ├── SQLite (dev/edge only)
    └── Local InMemory            └── (in-memory)
```

## Key Insight

```
MessageBox = Canonical Messaging Semantics

NATS       = One possible transport
```

NATS is not the architecture. NATS is an implementation target — just like OpenAPI became a target in the TypeSpec ecosystem. The semantic center of gravity lives in MessageBox.

## Current State (Today — being migrated)

```
AG-UI
   ↓
MessageBox
   ↓
SQLite Event Log        ← transitioning to Postgres
   ↓
Kernel
```

## Distributed Target (Future)

```
                 MessageBox MCP
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    Postgres       NATS Bus      Redis Streams
    (Ledger)       (Transport)   (Transport)
        │              │              │
        └──────────────┼──────────────┘
                       │
                  MCP Runtime
```

**Critical constraints:**
- Kernel never sees NATS directly — only through MessageBox
- Steward never sees Redis directly — only through MessageBox

## Core Contract

Every message follows the semantic taxonomy:

```
Intent | Command | Event | Receipt | Proposal | Projection
```

The transport does not care about semantics — only routing. The ledger does not care about semantics — only ordering and persistence.

## Provider Abstraction

### TransportProvider

```typescript
interface TransportProvider {
  publish(message: MCPMessage): Promise<void>
  subscribe(topic: string, handler: MessageHandler): Subscription
  request(topic: string, payload: unknown, opts?: RequestOptions): Promise<MCPMessage>
  reply(topic: string, handler: RequestHandler): void
}
```

### LedgerProvider

```typescript
interface LedgerProvider {
  append(message: MCPMessage): Promise<Position>
  read(from: Position, limit?: number): AsyncIterable<MCPMessage>
  replay(from: Position, to?: Position): AsyncIterable<MCPMessage>
  snapshot(): Promise<LedgerSnapshot>
}
```

## Distributed Event Identity

Every event requires:

```typescript
interface MCPMessage {
  id: string           // globally unique (ULID or UUIDv7)
  type: string         // semantic role (intent|command|event|receipt|proposal|projection)
  subject: string      // fully qualified subject (e.g., "intent.workrequest.execute")
  timestamp: number    // unix ms (node-local wall clock)
  source: string       // node identity that produced this message
  traceId: string      // correlation across production chains
  payload: unknown
  signature?: string   // optional cryptographic attestation (receipts)
}
```

## Ordering Model

**Do NOT attempt:** Global ordering across all nodes.

**Instead use:** Per-stream ordering.

### Partition Key

```
workrequestId  ────  natural partition key
```

Everything related to `WR-123` routes together. This gives:
- Deterministic replay per work request
- Deterministic execution per work request
- Natural sharding across work requests

### Ordering Scope

| Scope | Ordered? | Basis |
|-------|----------|-------|
| Within a single workrequest | Yes | workrequestId |
| Across workrequests | No | N/A |
| System-wide | No | N/A |

## Failure Model

### At-Least-Once (initial)
- Duplicate events are possible
- Consumers must be idempotent
- Receipt model naturally supports idempotency (by id)

### Exactly-Once (future)
- Not worth pursuing initially
- Receipt-based idempotency is sufficient

## Split Transport from Ledger

Right now MessageBox combines transport and persistence. Distributed systems should separate them:

| Layer | Role | Default | Alternatives |
|-------|------|---------|-------------|
| Transport | Live message delivery | NATS | Redis Streams, WebSocket, Local InMemory |
| Ledger | Historical truth, replay | Postgres | EventStoreDB, SQLite (dev/edge only) |

### Boot Sequence

```
1. Load Snapshot    (from Ledger)
2. Replay Ledger   (catch up to present)
3. Attach Live     (subscribe to Transport for new messages)
```

This is the same pattern as the existing SQLite-based replay, generalized and with Postgres as the default ledger backend.

## Package Layout

```
packages/
├── messagebox-core/         — interfaces, types, MCPMessage model
├── messagebox-postgres/     — Postgres ledger provider (default)
├── messagebox-nats/         — NATS transport provider (default)
├── messagebox-redis/        — Redis Streams transport provider
├── messagebox-sqlite/       — SQLite transport + ledger (dev/edge only)
└── messagebox-replay/       — replay orchestrator (snapshot + catch-up)
```

## System Responsibility Map

| Component | Governs | Produces | Consumes |
|-----------|---------|----------|----------|
| Conduit | Routing | — | All |
| Vector | Observation | Events | All |
| Kernel | Execution Process | Commands, Events, Receipts | Intent, Command, Receipt |
| Steward | Knowledge / Belief | Receipts, KG Mutations | Proposals, Receipts |
| MessageBox | Semantic Transport | — | All (carries) |
