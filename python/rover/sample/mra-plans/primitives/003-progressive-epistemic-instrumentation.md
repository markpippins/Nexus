# 003 — Progressive Epistemic Instrumentation (Primitive Catalog)

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Parent document for all Layer 3 primitives (007–010, 002).

## Architectural Intent

The system's reliability mechanisms were not designed upfront — they were **discovered through execution**. By forcing the system through a persistent UI and database, failures, state transitions, and drift became visible. This "progressive epistemic instrumentation" collectively forms a runtime model of uncertainty, control, and recoverability.

Each primitive addresses a specific failure mode or trust gap that was *observed* during execution, not predicted in design. The methodology: force execution → observe failures → add instrumentation → repeat.

## Requirements & Acceptance Criteria

- [ ] Each instrumentation primitive surfaces a specific dimension of execution reality
- [ ] Instrumentation is additive — each new primitive addresses a discovered failure mode
- [ ] The full instrumentation set provides a complete runtime model of agentic execution
- [ ] No instrumentation should require modification of WRP intent semantics

## Primitive Catalog

| # | Primitive | Purpose | Deep-Dive |
|---|-----------|---------|-----------|
| 1 | **Tickets** | Define precise scope of change | *(conduit-mcp implements this already)* |
| 2 | **Receipts** | Prove completion vs. claims of completion | [`008-receipts-proof-of-execution.md`](008-receipts-proof-of-execution.md) |
| 3 | **Circuit Breakers** | Manage trust in execution; prevent runaway | [`007-circuit-breakers-trust-management.md`](007-circuit-breakers-trust-management.md) |
| 4 | **Kill Switches** | Halt unsafe or pathological behavior | *(covered in 007)* |
| 5 | **Pause/Resume** | Persist state across interruptions | *(conduit-mcp implements this)* |
| 6 | **Pipeline Tracking** | Position work in its lifecycle | *(conduit-mcp implements this)* |
| 7 | **Session Review** | Provide reconstructible history | [`010-session-review-state-audit.md`](010-session-review-state-audit.md) |
| 8 | **Real-time Logs** | Step-by-step observability | *(conduit-mcp implements this)* |
| 9 | **Token Tracking** | Expose real cost of execution | *(conduit-mcp implements this)* |
| 10 | **Plan Reset** | Safely discard corrupted intent | [`009-plan-reset-drifted-intent.md`](009-plan-reset-drifted-intent.md) |
| — | **Scaffold UI** | Behavioral spec surface for all primitives | [`002-scaffold-ui-behavioral-spec.md`](002-scaffold-ui-behavioral-spec.md) |

## Inheritance Notes

- Primitives 1, 3, 5, 6, 8, 9 have partial implementations in conduit-mcp
- Primitives 2, 4, 7, 10 have specifications but no implementation yet (see individual deep-dives)
- The Scaffold UI is cross-cutting — it surfaces all primitives and is the behavioral spec surface (see 002)

## Implementation Notes

- All primitives live in the Observability/Safety Layer (Layer 3)
- Primitives are orthogonal — each solves a distinct problem discovered at runtime
- Instrumentation is additive: new primitives are added as new failure modes are discovered
- These primitives are what turn WRP + Execution into a debuggable, recoverable process

## Unresolved Follow-Ups

- Are there undiscovered instrumentation primitives still needed?
- Should instrumentation be a separate service or embedded in the execution layer?
- See individual deep-dive documents for primitive-specific questions.
