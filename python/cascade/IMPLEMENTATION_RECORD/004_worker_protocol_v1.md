# 004 - WORKER PROTOCOL (V1)
**Target:** Event Pipeline Execution Contract
**Role:** Nexus Systems Reviewer
**Date:** 2026-05-03

## 1. The Stateless Invariant
The pipeline operates as a purely reactive node devoid of internal sequence memory. It does not track local offsets, "current progress," or hardcode "next steps." It functions strictly as a stateless computation unit.

## 2. Kernel Authority Rule
The Nexus Kernel is the absolute arbiter of reality. The pipeline may only act upon authorized transitions defined explicitly by a topological projection of the Nexus DAG.

## 3. The 4-Phase Execution Loop
1. **Epistemic Sync (Query):** Pipeline queries Nexus via OQL to discover topologically authorized transitions.
2. **Claim (Proposal):** Pipeline submits a `StepRequested` envelope to request formal permission to execute.
3. **Pure Execution (LLM Invocation):** Upon explicit Kernel acknowledgment, the Pipeline invokes the LLM.
4. **Structural Commitment (Write):** Pipeline submits a `StepCompleted` envelope containing the final artifact.

## 4. `read_set` / `write_set` Binding
- **Execution Constraint:** Prompts must be assembled *exclusively* from explicit artifact hashes defined in the approved `read_set`. Reliance on local files or shadow memory is a critical architectural violation.
- **Commit Constraint:** Output artifacts are declared structurally in the `write_set`, with the raw non-deterministic LLM output trapped opaquely within the envelope payload.

## 5. Failure Semantics
Failure handling is inherently stateless:
- **Rejection:** If Nexus rejects an envelope, the pipeline abandons the local attempt and loops back to Epistemic Sync.
- **Crashes:** If a worker dies during execution, the DAG state remains at `EXECUTING_STEP`. Another worker will eventually query the stalled transition and propose an override.

---

## 6. Execution Claim Invariant (Newly Identified)

*Invariant discovered during protocol formalization.*

In a distributed Nexus environment, multiple stateless workers may simultaneously observe the same authorized transition. To preserve determinism and prevent duplicate execution, Nexus must formalize execution ownership.

**Invariant:**
> A transition may only be executed under a valid Kernel-recognized execution claim.

### Required Properties
An execution claim must include:
- `execution_id` — globally unique identifier for the attempt
- `worker_id` — identity of proposing external actor
- `claim_timestamp` — logical time recorded by the Kernel

### Kernel Responsibility
Upon accepting a `StepRequested` envelope:
- the Kernel records the claim
- the transition enters `EXECUTING_STEP`
- competing claims are rejected or resolved deterministically

### Worker Responsibility
Workers never assume ownership locally. They execute only after Kernel acknowledgment of the claim.
