# 003 - MINIMAL STATELESS WORKER ARCHITECTURE
**Target:** Event Pipeline Execution Loop
**Role:** Nexus Systems Reviewer
**Date:** 2026-05-03

## 1. The Core Architectural Shift
The existing `cascade` relies on a `Dispatcher` that uses `read_offset()` to determine what task to execute next, maintaining a local "shadow state." To become Nexus-compliant, the Pipeline must become a "Stateless Worker." It has no memory of past steps, no internal sequence lists, and no offset trackers.

**Rule:** The Pipeline operates purely as a reactive function of the Nexus `MergedClosureDAG`.

## 2. The Stateless Execution Loop

The traditional sequence (`Vocabulary -> Requirements -> TypeSpec`) is removed from the Pipeline's hardcoded logic. Instead, the loop becomes:

### Phase 1: Epistemic Sync (Querying Nexus)
The Pipeline wakes up and queries the Nexus Kernel via OQL.
- **Action:** `OQL.get_authorized_transitions()`
- **Result:** Nexus looks at the topological frontier of the DAG and returns a list of legally executable state transitions (e.g., "Ready for Requirements Generation").

### Phase 2: Claiming the Work (The Proposal)
The Pipeline selects an authorized transition and proposes execution.
- **Action:** Submits a `StepRequested` envelope to Nexus via `ExternalActorInterface`.
- **Constraint:** The envelope strictly binds the `read_set` to the exact artifact hashes provided by Nexus in Phase 1.
- **Result:** Nexus validates and commits the transition (`state: EXECUTING_STEP`).

### Phase 3: Pure Execution (LLM Invocation)
The Pipeline invokes the LLM.
- **Constraint:** The Pipeline builds the LLM prompt **exclusively** from the data contained in the Nexus-approved `read_set`. It may NOT read local files or use internal memory.
- **Result:** The LLM generates the requested artifact.

### Phase 4: Structural Commitment (The Write)
The Pipeline commits the result back to Nexus.
- **Action:** Submits a `StepCompleted` envelope.
- **Constraint:** The LLM's raw output is locked opaquely in the payload. The artifact is declared in the `write_set`.
- **Result:** Nexus validates the transition (`state: STEP_COMPLETE`), appending the new artifacts to the Spacetime graph.

## 3. Handling Rejections and Failures
Because the worker is stateless, failure recovery is trivial:
- **If Nexus Rejects the Request:** The Pipeline simply abandons the attempt and loops back to Phase 1.
- **If the Pipeline Crashes during Execution:** The DAG remains in `EXECUTING_STEP` indefinitely. Another stateless worker (or a recovery cron) will eventually query Nexus, see a stalled execution, and propose a new `StepRequested` envelope to restart the work.

## 4. Systems Integrity Conclusion
By stripping the Pipeline of its offsets and forcing it to query the DAG for its marching orders, we mathematically eliminate race conditions, sequence desynchronization, and split-brain states. The Pipeline becomes a pure, replaceable computation node acting on behalf of the Kernel.
