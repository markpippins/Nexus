# MessageBox MCP + Steward Phase 1

**Project:** nexus
**Plan Number:** 0115
**Status:** proposed

## Goal

Implement the MessageBox semantic message taxonomy, split transport from ledger in the MessageBox core, and build the Steward component as the Knowledge Graph governor.

This is Phase 1 of the architecture described in `graph/ARCHITECTURE/`. It covers the core abstractions, the semantic message model, the TransportProvider/LedgerProvider split in messagebox-core, and the Steward service with validation and proposal processing.

## Files Affected

### New files
- `packages/messagebox-core/src/types.ts` — MCPMessage, semantic role types
- `packages/messagebox-core/src/TransportProvider.ts` — transport interface
- `packages/messagebox-core/src/LedgerProvider.ts` — ledger/persistence interface
- `packages/messagebox-core/src/index.ts` — barrel exports
- `packages/messagebox-nats/src/NATSProvider.ts` — NATS transport implementation
- `packages/messagebox-nats/src/config.ts` — NATS connection config
- `packages/messagebox-nats/src/index.ts`
- `packages/messagebox-redis/src/RedisTransportProvider.ts` — Redis transport implementation
- `packages/messagebox-redis/src/config.ts`
- `packages/messagebox-redis/src/index.ts`
- `packages/steward/src/service/Steward.ts` — main runtime loop
- `packages/steward/src/service/ValidationEngine.ts` — ontology constraints
- `packages/steward/src/proposals/Proposal.ts` — proposal model
- `packages/steward/src/proposals/ProposalStore.ts` — proposal storage
- `packages/steward/src/mutations/Mutation.ts` — mutation model
- `packages/steward/src/mutations/MutationReceipt.ts` — mutation receipt
- `packages/steward/src/mutations/MutationPolicy.ts` — policy engine
- `packages/steward/src/graph/GraphAdapter.ts` — abstract graph interface
- `packages/steward/src/graph/adapters/PostgresAdapter.ts` — Postgres-backed graph (default)
- `packages/steward/src/index.ts`

### Modified files
- `packages/messagebox-core/package.json` — add dependencies if needed

## Postgres Schema (Ledger)

The Postgres ledger uses a single table with per-stream ordering:

```sql
CREATE TABLE ledger_events (
  id          BIGSERIAL PRIMARY KEY,
  stream      TEXT NOT NULL,          -- partition key (workrequestId)
  position    BIGINT NOT NULL,        -- monotonically increasing per stream
  message_id  TEXT NOT NULL UNIQUE,   -- ULID/UUIDv7
  type        TEXT NOT NULL,          -- semantic role
  subject     TEXT NOT NULL,
  timestamp   BIGINT NOT NULL,
  source      TEXT NOT NULL,
  trace_id    TEXT NOT NULL,
  payload     JSONB NOT NULL,
  signature   TEXT,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stream, position)
);

CREATE INDEX idx_ledger_stream ON ledger_events(stream, position);
```

Replay uses `SELECT ... FROM ledger_events WHERE stream = $1 AND position >= $2 ORDER BY position`.

## Postgres Schema (Graph — PostgresAdapter)

The KG graph uses an adjacency list model with recursive CTEs:

```sql
CREATE TABLE graph_nodes (
  ref       TEXT PRIMARY KEY,          -- ULID node reference
  type      TEXT NOT NULL,             -- e.g., 'entity', 'concept', 'artifact'
  props     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE graph_edges (
  id         BIGSERIAL PRIMARY KEY,
  from_ref   TEXT NOT NULL REFERENCES graph_nodes(ref),
  to_ref     TEXT NOT NULL REFERENCES graph_nodes(ref),
  type       TEXT NOT NULL,             -- e.g., 'depends_on', 'produces', 'instance_of'
  props      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_graph_edges_from ON graph_edges(from_ref);
CREATE INDEX idx_graph_edges_to   ON graph_edges(to_ref);
```

Recursive traversal:

```sql
WITH RECURSIVE traverse AS (
  SELECT ref, type, props, 0 AS depth
  FROM graph_nodes WHERE ref = $1
  UNION ALL
  SELECT n.ref, n.type, n.props, t.depth + 1
  FROM traverse t
  JOIN graph_edges e ON e.from_ref = t.ref
  JOIN graph_nodes n ON n.ref = e.to_ref
  WHERE t.depth < $2
)
SELECT * FROM traverse;
```

## Acceptance Criteria

- [ ] `MCPMessage` type defined with all six semantic roles (intent, command, event, receipt, proposal, projection)
- [ ] `TransportProvider` interface defined with publish/subscribe/request/reply
- [ ] `LedgerProvider` interface defined with append/read/replay/snapshot
- [ ] Postgres ledger provider implements `LedgerProvider` with the schema above (default backend)
- [ ] NATS provider implements `TransportProvider` with 1:1 subject mapping
- [ ] Redis provider implements `TransportProvider` using streams
- [ ] Steward runtime loop subscribes to `proposal.*` and processes through ValidationEngine → MutationPolicy → MutationEngine
- [ ] ValidationEngine performs ontology checks (node type, relationship, cardinality, required fields)
- [ ] MutationPolicy supports auto-approve (>0.95 confidence), human-review, and reject policies
- [ ] Every mutation produces a `MutationReceipt` with before/after graph snapshots
- [ ] `PostgresAdapter` implements `GraphAdapter` using the adjacency list schema + recursive CTEs above
- [ ] `GraphAdapter` interface abstracts KG backend (Postgres default, Neo4j optional future)
- [ ] All providers pass a shared integration test suite
- [ ] SQLite provider (dev/edge only) implemented for CI and single-binary scenarios where Postgres is unavailable

## Dependencies

- none
