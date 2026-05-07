# 📌 NEXUS IR — LAYER XIII: OBSERVABILITY & DIAGNOSTIC INTROSPECTION CONTRACT
SYSTEM / DEVELOPER PROMPT

This layer defines how Nexus exposes internal execution behavior for debugging, auditing, and system analysis. Observability is strictly deterministic introspection over already-computed causal structures. It is NEVER live system interrogation or semantic explanation generation.

## 🧠 CORE PRINCIPLE
Observability artifacts are always derived, never generative. They MUST NOT influence the causal substrate they describe.

## 🗄️ TRACE ARTIFACT TYPES
The system emits strictly deterministic artifacts reproducible across runs:
- **REPLAY TRACE:** Execution steps, topological sorting decisions, dependency activations.
- **MERGE TRACE:** ConflictGroup formations, ResolutionStrategy logic, structural edge insertions.
- **QUERY TRACE:** OQL evaluation steps, dependency pruning, frontier restriction operations.
- **INGESTION TRACE:** Transcript → Envelope structural extraction and segmentation.

## 🛑 NO EXECUTION COUPLING RULE
Observability is purely post-hoc. It MUST NOT modify execution order, influence scheduling, alter merge outcomes, change replay results, or inject causal edges.

## ⚖️ TRACE DETERMINISM & CAUSAL EXPLANATION
```text
Trace(G_t) == Trace(G_t)
```
All explanations are derived exclusively from explicit causal edges, read/write sets, and deterministic strategy decisions. Semantic interpretation, intent inference, or probabilistic modeling are completely forbidden. 

## 🧱 SYSTEM STATE SNAPSHOT MODEL & DIFFERENTIAL OBSERVABILITY
- **Snapshot(G_t):** Captures EventEnvelope state, ClosureSet state, DAG structure, and resolution decisions. Snapshots are immutable.
- **Delta Inspection:** `Diff(G_t, G_t+1)` emits structural changes ONLY (node appends, edge insertions, OQL deltas). Semantic diffing is completely disallowed.

## 🐛 DEBUGGING IS A QUERY PROBLEM
All debugging MUST be expressible as OQL queries over ObservabilityArtifacts. There are no privileged hidden debugging APIs, semantic explanation engines, or counterfactual execution paths.
