# Steward — Knowledge Graph Governor

**Status:** Proposed | **Area:** Steward / KG | **Date:** 2026-06-18

## Default Backend

Postgres is the default KG backend. The `PostgresAdapter` stores graph data in relational tables using an adjacency list model with recursive CTEs for traversal. This is sufficient for Phase 1 graph operations and avoids introducing a separate graph database dependency before it's warranted.

Other adapters (Neo4j, NetworkX) exist behind the `GraphAdapter` abstraction and can be swapped in non-breakingly when native graph features are needed.

## Core Principle

```
Steward is the sole writer to the Knowledge Graph.
```

Everything else (Kernel, Workers, AG-UI, DAG Runtime, MCP Transport) is **read-only** with respect to KG state.

## Role

```
Kernel  governs process.
Steward governs belief.
```

Steward is not the Knowledge Graph itself. Steward is the **Knowledge Graph Governor** — a validation and mutation authority that ensures all KG changes are auditable, policy-compliant, and ontologically valid.

## Responsibilities

1. **Validate** — check proposals against ontology constraints
2. **Classify** — determine the nature of the proposed change
3. **Mutate** — apply approved changes to the KG
4. **Audit** — emit mutation receipts for every change

## Architecture

```
proposal.kg.*           (from Workers via MessageBox MCP)
      ↓
┌──────────────────┐
│   Steward        │
│  ┌────────────┐  │
│  │ Validation  │  │
│  │ Engine      │  │
│  └─────┬──────┘  │
│        ↓         │
│  ┌────────────┐  │
│  │ Mutation   │  │
│  │ Policy     │  │
│  └─────┬──────┘  │
│        ↓         │
│  ┌────────────┐  │
│  │ Mutation   │  │
│  │ Engine     │  │
│  └─────┬──────┘  │
└────────┼─────────┘
         ↓
kg.mutation.applied / rejected / disputed
         ↓
    Knowledge Graph
```

## Event Families

### Incoming (via MessageBox MCP)
- `proposal.*` — KG mutation proposals from Workers
- `receipt.*` — execution receipts that may trigger derived proposals

### Outgoing (via MessageBox MCP)
- `kg.mutation.applied` — mutation accepted and applied
- `kg.mutation.rejected` — mutation rejected by policy or validation
- `kg.mutation.disputed` — mutation requires human review

## Proposal Flow

```
Worker Receipt
      ↓
Proposal (proposal.kg.*)
      ↓
Steward.ValidationEngine
      ↓
    [ontology check: node type, relationship, cardinality, required fields]
      ↓
Steward.MutationPolicy
      ↓
    [auto-approve if confidence > .95]
    [human review if entity merge]
    [reject if ontology violation]
      ↓
Steward.MutationEngine
      ↓
MutationReceipt (kg.mutation.*)
```

## Package Structure

```
packages/steward/
├── src/
│   ├── service/
│   │   ├── Steward.ts              — main runtime loop
│   │   ├── MutationEngine.ts       — applies mutations to KG
│   │   └── ValidationEngine.ts     — ontology constraint checks
│   │
│   ├── proposals/
│   │   ├── Proposal.ts             — proposal model & types
│   │   ├── ProposalStore.ts        — durable proposal storage
│   │   └── ProposalReducer.ts      — proposal lifecycle state machine
│   │
│   ├── mutations/
│   │   ├── Mutation.ts             — mutation model & types
│   │   ├── MutationReceipt.ts      — receipt emitted per mutation
│   │   └── MutationPolicy.ts       — policy engine (auto/human/reject)
│   │
│   ├── graph/
│   │   ├── GraphAdapter.ts         — abstract graph interface
│   │   └── adapters/
│   │       ├── PostgresAdapter.ts   — default (relational graph schema)
│   │       ├── NetworkXAdapter.ts   — analysis workloads
│   │       ├── Neo4jAdapter.ts      — future (native graph when needed)
│   │       └── InMemoryAdapter.ts
│   │
│   └── index.ts
│
└── __tests__/
```

## Graph Adapter Interface

Steward must never depend on a specific graph database. The `GraphAdapter` abstracts:

```typescript
interface GraphAdapter {
  createNode(type: string, props: Record<string, unknown>): NodeRef
  updateNode(ref: NodeRef, props: Record<string, unknown>): void
  deleteNode(ref: NodeRef): void
  createRelationship(from: NodeRef, to: NodeRef, type: string, props: Record<string, unknown>): RelRef
  query(query: GraphQuery): QueryResult
  snapshot(): GraphSnapshot
}
```

Default implementation: `PostgresAdapter` (adjacency list with recursive CTEs for traversal).

Also available: `NetworkXAdapter` (analysis), `Neo4jAdapter` (future native graph), `InMemoryAdapter` (tests).

## Mutation Receipts

Every mutation produces a `MutationReceipt`:

```typescript
interface MutationReceipt {
  id: string
  proposalRef: string
  sourceReceiptRef: string      // links back to the evidence
  mutationType: 'create' | 'update' | 'delete' | 'merge' | 'reclassify'
  before: GraphSnapshot         // state before mutation
  after: GraphSnapshot          // state after mutation
  appliedAt: timestamp
  policy: 'auto' | 'reviewed' | 'forced'
  approvedBy?: string           // human reviewer if applicable
}
```

## Replay

Because every mutation produces a receipt with before/after snapshots, the full graph state can be reconstructed by replaying mutation receipts in order. This enables:
- Deterministic graph state recovery
- Point-in-time queries
- Audit trail for every KG change

## Steward Runtime Loop

```
loop:
  proposal = await subscribe('proposal.kg.*')
  validationResult = ValidationEngine.validate(proposal)
  if validationResult.rejected:
    emit('kg.mutation.rejected', { proposal, reason })
    continue

  policy = MutationPolicy.evaluate(proposal, validationResult)
  if policy.requiresReview:
    emit('kg.mutation.disputed', { proposal, validationResult })
    continue    // wait for human review

  mutation = MutationEngine.apply(proposal)
  receipt = MutationReceipt.from(mutation)
  emit('kg.mutation.applied', receipt)
```

## Integration with MessageBox

Steward subscribes to `proposal.*` through MessageBox MCP. It uses the same semantic message taxonomy — it just specializes in the `proposal` and `kg.mutation.*` families.
