# Nexus Deterministic Causal OS: Work-to-Date Summary

Welcome. This document summarizes the complete architectural state and Python implementation of the Nexus Causal Compiler. The purpose of this system is to ingest raw unstructured transcripts, deterministically map them into a causal Spacetime DAG, resolve conflicting realities without semantic hallucination, and expose the entire graph to boundary-locked topological queries.

## 🏛️ The 14-Layer Architecture

Nexus is formally defined across 14 layers. Each layer boundary strictly guarantees deterministic execution, mathematically locking out probabilistic "LLM guessing," implicit state dependencies, or wall-clock assumptions.

1. **Layers I–VII (Causal Computation Kernel):** Unordered `EventEnvelopes` (IR) are deterministically compiled by a Replay Engine into an immutable `MergedClosureDAG`. The system processes parallel timelines without chronological collapse, navigating them entirely through an Observation Query Language (OQL).
2. **Layer VIII (Observation Isolation):** Observations are rigorously defined as downward-closed frontiers. They are serialized externally as "lossy-to-structure, lossless-to-semantics" read-only projections. No backflow is permitted.
3. **Layer IX (Actor Isolation):** External agents and users cannot mutate the DAG directly. They must submit read/write-declared `IR_EventEnvelopes` into an impenetrable validation gate.
4. **Layer X (Evolution Governance):** The schema (`nexus_version` and `dag_version`) is rigidly bound to the DAG. Replays strictly execute under the version context that originally formed them.
5. **Layer XI (Runtime Execution):** Concurrency is governed logically by write-set topological intersections (not threads/locks).
6. **Layer XII & XII.5 (Ingestion & ISG):** Raw `Transcripts` flow through a pluggable Interaction Semantic Gating (ISG) layer for deterministic lexical tagging (e.g., "Assent"), then into the `IngestionCompiler` where explicit structure is extracted. ISG metadata is strictly isolated from causal `EventEnvelope` ID hashes.
7. **Layer XIII (Observability):** Diagnostic debugging is reduced to geometric OQL queries over already-computed execution traces (`Trace(G_t)`). No live runtime interrogation or simulation is permitted.
8. **Layer XIV (Distributed Deployment):** EventStores operate as append-only, SHA-hashed replicated logs enforcing pure causal consistency.

## 📂 Code Implementation Inventory

The system is executed natively in Python inside this directory:

- `graph_models.py`: Defines the foundational `IR_v2_EventEnvelope` schema, provenance, and universe contexts.
- `ingestion_compiler.py`: Contains the `ISGEngine` and `IngestionCompiler`. Translates `RawTranscript` -> `IR_v2_EventEnvelope`.
- `observation_engine.py`: The core Layer VI & VII engine. Houses the `MergedClosureDAG`, `ObservationSynthesizer` (validates downward closures), and `OQLEngine` (Frontier Algebra including `causal_past`, `causal_diff`, `find_lca`).
- `runtime_engine.py`: Defines the `AppendOnlyEventStore` (Layer XIV Hash checks), `DeterministicValidator` (Layer IX), and `ObservationExternalizer` (Layer VIII).
- `observability_engine.py`: Implements deterministic `SystemSnapshots` and `DiagnosticInspector` (Layer XIII).
- `PROMPT_RECORD/`: Contains the canonical markdown architectural contracts defining all 14 layers constraining this compiler.

## 🚀 Concrete Testing Harness

- `test_end_to_end_runtime.py`: A concrete minimal runtime test harness demonstrating the entire pipeline flowing end-to-end:
  `Transcript → ISG Evaluation → IngestionCompiler (Events) → MiniReplayEngine (DAG construction) → OQL Queries (Extracting Causal Boundaries)`
- `test_observation_engine.py`: Validates the mathematical purity of the `OQLEngine` Frontier Algebra against isolated topological test suites.

## 🔒 Crucial Developer Invariants (Do Not Break)
1. **No Semantic Inferences:** You cannot execute logic like "the user probably meant X so link it to Y." Dependencies must be structurally explicit and defined inside Read/Write sets.
2. **Immutable Graph History:** DAG execution is mathematically locked by versions and hashes. Do not write update or overwrite operations. Debugging requires an OQL query, not a mutation.
