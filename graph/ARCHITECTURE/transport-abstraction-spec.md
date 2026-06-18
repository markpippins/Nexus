# Transport Provider Abstraction

**Status:** Proposed | **Area:** MessageBox / MCP | **Date:** 2026-06-18

## Default Configuration

| Layer | Provider | Rationale |
|-------|----------|-----------|
| Transport | NATS | Distributed pub/sub with JetStream replay |
| Ledger | Postgres | Durable, queryable event log; single dependency shared with KG |
| KG | Postgres (GraphAdapter) | Avoids separate graph DB for Phase 1 |

All production deployments use Postgres for the ledger. SQLite is scoped to CI and single-binary edge scenarios only.

## Rationale

MessageBox currently binds transport and persistence into a single implementation. To support distributed deployment, these concerns must be separated. This document defines the transport provider abstraction and the initial NATS provider specification.

## TransportProvider Interface

```typescript
interface TransportProvider {
  name: string

  // Publish a message to a subject
  publish(subject: string, message: MCPMessage): Promise<void>

  // Subscribe to a subject pattern (supports wildcards)
  subscribe(pattern: string, handler: MessageHandler, opts?: SubscribeOptions): Subscription

  // Request/reply semantics
  request(subject: string, payload: unknown, opts?: RequestOptions): Promise<MCPMessage>

  // Register a reply handler
  reply(pattern: string, handler: RequestHandler): void

  // Lifecycle
  connect(config: TransportConfig): Promise<void>
  disconnect(): Promise<void>
}

type MessageHandler = (message: MCPMessage) => Promise<void>
type RequestHandler = (req: MCPRequest) => Promise<MCPMessage>

interface SubscribeOptions {
  queue?: string          // consumer group name
  maxDelivery?: number    // for at-least-once
}

interface RequestOptions {
  timeout: number         // ms
  maxReplies?: number
}
```

## LedgerProvider Interface

```typescript
interface LedgerProvider {
  name: string

  // Append a message to the ledger, returning its position
  append(stream: string, message: MCPMessage): Promise<Position>

  // Read messages from a position forward
  read(stream: string, from: Position, limit?: number): AsyncIterable<MCPMessage>

  // Replay a range of messages
  replay(stream: string, from: Position, to?: Position): AsyncIterable<MCPMessage>

  // Get a point-in-time snapshot of stream state
  snapshot(stream: string): Promise<LedgerSnapshot>

  // Lifecycle
  connect(config: LedgerConfig): Promise<void>
  disconnect(): Promise<void>
}

type Position = string | number  // provider-specific (e.g., NATS sequence, Postgres LSN/xid)
```

## Subject Mapping

The semantic message subject maps directly to transport subjects. For V1, no transformation is needed:

```
LOSM Subject:          intent.workrequest.execute
NATS Subject:          intent.workrequest.execute
Redis Stream Key:     intent:workrequest:execute
```

## NATS Provider Specification

### Package

```
packages/messagebox-nats/
├── src/
│   ├── NATSProvider.ts        — TransportProvider implementation
│   ├── SubjectMapper.ts       — subject ↔ NATS subject mapping
│   ├── NATSReplayAdapter.ts   — replay from NATS JetStream
│   └── config.ts              — connection config types
├── __tests__/
└── package.json
```

### Responsibilities

```typescript
class NATSProvider implements TransportProvider {
  async publish(subject: string, message: MCPMessage): Promise<void> {
    // nc.publish(subject, serialize(message))
    // Optionally write to JetStream for persistence
  }

  async subscribe(pattern: string, handler: MessageHandler, opts?: SubscribeOptions): Promise<Subscription> {
    // nc.subscribe(pattern, { queue: opts?.queue, callback: handler })
  }

  async request(subject: string, payload: unknown, opts?: RequestOptions): Promise<MCPMessage> {
    // nc.request(subject, serialize(payload), { timeout: opts?.timeout })
  }

  reply(pattern: string, handler: RequestHandler): void {
    // nc.subscribe(pattern, { callback: handler })
  }
}
```

### Subject Mapping (V1 — direct mapping)

```typescript
// LOSM subject → NATS subject
function mapSubject(losmSubject: string): string {
  return losmSubject  // 1:1 for V1
}
```

NATS wildcards (`>`, `*`) align naturally with LOSM semantic patterns:

| Semantic Pattern | NATS Pattern | Meaning |
|-----------------|--------------|---------|
| `intent.*` | `intent.*` | All desires |
| `command.*` | `command.*` | All obligations |
| `event.*` | `event.*` | All observations |
| `receipt.*` | `receipt.*` | All evidence |
| `proposal.kg.*` | `proposal.kg.*` | All KG proposals |

## Redis Provider Specification

### Package

```
packages/messagebox-redis/
├── src/
│   ├── RedisTransportProvider.ts
│   └── config.ts
├── __tests__/
└── package.json
```

### Stream Structure

Two options for V1 (choose one):

**Option A: Single stream**
```
Stream: mcp-events
```
All message types go to one stream, partitioned by message type field.

**Option B: Per-semantic-type streams**
```
Stream: intent-stream
Stream: command-stream
Stream: receipt-stream
```

### Publish

```typescript
async publish(subject: string, message: MCPMessage): Promise<void> {
  const stream = determineStream(message.type)
  await redis.xAdd(stream, '*', serialize(message))
}
```

### Consume

```typescript
async subscribe(pattern: string, handler: MessageHandler): Promise<void> {
  const stream = determineStreamFromPattern(pattern)
  // redis.xReadGroup() with consumer group
}
```

## Provider Composition

An application can use multiple providers simultaneously:

- **Development**: Postgres ledger + local transport (or NATS if testing distributed flows)
- **Production**: NATS transport + Postgres ledger (standard)
- **CI / isolated test**: InMemory transport + SQLite ledger
- **Edge / single-binary**: SQLite ledger + local transport

The MessageBox core contract ensures all providers are interchangeable from the consumer's perspective.
