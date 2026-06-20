# MRA Plans — WRP Architecture

**Source:** Model Role Assignment (ChatGPT transcript), harvested via rover.
**Processing status:** Raw chunks from transcript → re-chunked into hierarchical structure.

These documents represent the architectural vision for the Work Request Pipeline
as a three-layer intent-to-work compiler system. They were extracted from a chat
transcript about model role assignments and the convergence toward a
crystallization-runtime architecture.

## Structure

```
mra-plans/
├── README.md                          ← this file
├── principles/                        ← architectural insights that ground the design
│   ├── 001-wrp-as-intent-compiler.md             WRP is a compiler, not an executor
│   └── 005-crystallization-runtime-codependency.md  Why L1 and L3 need each other
├── architecture/                      ← the formal three-layer model
│   └── 004-three-layer-system-model.md           Layer definitions, contracts, and flow
└── primitives/                        ← implementable Layer 3 specifications
    ├── 003-progressive-epistemic-instrumentation.md  Catalog of all primitives (parent)
    ├── 007-circuit-breakers-trust-management.md     Circuit breaker state machine
    ├── 008-receipts-proof-of-execution.md           Receipt schema and semantics
    ├── 009-plan-reset-drifted-intent.md             Plan Reset lifecycle
    ├── 010-session-review-state-audit.md            Session Review schema
    └── 002-scaffold-ui-behavioral-spec.md          Cross-cutting UI spec surface
```

## Reading Order

1. **Principles (why)**
   - Start with `005` — the central insight that makes the architecture necessary
   - Then `001` — what WRP actually is (a compiler, not an executor)

2. **Architecture (what)**
   - `004` — the three-layer model that everything else references

3. **Primitives (how)**
   - `003` — the catalog of all instrumentation primitives
   - Then any deep-dive: `007` (circuit breakers), `008` (receipts), `009` (plan reset),
     `010` (session review)
   - `002` — cross-cutting UI spec (references all primitives)

## Inheritance

- `001` merges original chunks 001, 006, and Layer 1 of 004
- `005` is original chunk 005, refined
- `004` consolidates original chunk 004 with formal layer contracts
- `003` is the parent document for primitives 007–010 and 002

## Status

All documents carry status `Agreed` — meaning the architectural insight was
validated in the source conversation. None are implemented yet.
Implementation priority and sequencing are undetermined.
