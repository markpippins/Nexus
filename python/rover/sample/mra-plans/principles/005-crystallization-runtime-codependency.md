# 005 — Crystallization-Runtime Co-Dependency

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript)

## Architectural Intent

The central architectural insight: the **crystallization layer** (WRP) cannot survive alone. It produces static, idealized intent objects. The surrounding **runtime layer** (observability, safety, correction) is what makes those intent objects viable in a probabilistic, failure-prone execution environment. Neither layer works without the other — they are co-dependent.

This co-dependency is the definition of an **"operating system for agentic execution"** : the crystallization layer provides stable, deterministic work definitions; the runtime layer provides the safety, observability, and recovery mechanisms that make execution in a probabilistic environment survivable.

### Key Distinction

| | Crystallization (Layer 1) | Runtime (Layer 2 + 3) |
|---|---|---|
| **Role** | "What should happen" | "What actually happens" |
| **Nature** | Ideal, static, deterministic | Real, dynamic, probabilistic |
| **Output** | WorkRequest envelopes | Execution receipts + events |
| **Failure mode** | Ambiguous intent | Execution drift, loops, divergence |
| **Recovery** | Recompile | Plan Reset, circuit breakers |

The gap between "what should happen" and "what actually happens" is where all instrumentation lives.

## Requirements & Acceptance Criteria

- [ ] WRP (crystallization) never executes without runtime supervision
- [ ] Runtime layer wraps every execution with circuit breakers, receipts, and logs
- [ ] Failed or corrupted executions are detected by runtime and reported back to intent layer
- [ ] The crystallization layer can regenerate work from the same intent after a runtime failure
- [ ] Runtime layer can trigger Plan Reset when execution reality diverges from intent

## Implementation Notes

- The three-layer model (see `../architecture/004-three-layer-system-model.md`) formalizes this co-dependency
- The Observability/Safety Layer (Layer 3) is what turns WRP + Execution into a debuggable, recoverable process
- Without Layer 3, the system is just "AI + prompts"
- Each instrumentation primitive (see `../primitives/003-progressive-epistemic-instrumentation.md`) addresses a specific dimension of the crystallization-runtime gap

## Unresolved Follow-Ups

- How does the runtime layer communicate failure back to the crystallization layer?
- What is the recovery protocol when execution reality diverges from intent?
- Should there be a feedback loop that improves intent compilation based on runtime data?
