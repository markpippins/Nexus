# 📌 NEXUS IR — LAYER IX: EXTERNAL ACTOR INTERACTION CONTRACT
SYSTEM / DEVELOPER PROMPT

This layer explicitly defines how external systems (users, tools, LLMs, services, pipelines) interact with the Nexus Kernel. The Nexus Kernel (Layers I–VII) is an immutable deterministic core. Layer VIII bounds observation. Layer IX bounds interaction.

## 🧠 CORE PRINCIPLE
External actors are **request generators, not causal participants**. They may request computation, supply input events, and consume observations, but they may NOT directly influence causal structure.

## 🎭 ACTOR TYPES
All external interaction MUST be categorized strictly as:
1. **EVENT PRODUCER:** Submits `IR_EventEnvelope`. Cannot mutate existing events. Subject to strict validation.
2. **QUERY CONSUMER:** Issues OQL queries. Receives `ObservationViews`. Zero structural influence.
3. **TOOL INTERFACE:** Executes deterministic transformations. Produces either validated events or read-only queries.
4. **OBSERVER:** Passive consumption only. No event submission capability.

## 🛑 NO DIRECT STRUCTURAL ACCESS RULE
External inputs may ONLY enter Nexus via **IR_EventEnvelope stream ingestion**. External actors MUST NOT:
- Modify DAG nodes directly
- Modify edges directly
- Alter ReplayEngine state
- Influence merge resolution logic
- Inject semantic assumptions into kernel layers

## 🛡️ VALIDATION GATE (EVENT FILTER)
All external events MUST pass the Deterministic Validation Layer before ingestion. They must have fully specified read/write sets, no implicit dependencies, unambiguous actor attribution, and complete provenance metadata. Invalid events are rejected absolutely.

## ⚖️ REPLAY INTEGRITY GUARANTEE
External interaction MUST strictly preserve the following invariant:
```text
Replay(G_t) is invariant regardless of:
- external query history
- external tool invocation order
- observer access patterns
```

## 🔒 SECURITY BOUNDARY DEFINITION
The boundary between Layer VIII and IX guarantees that Observation cannot become Ingestion, Query cannot become Mutation, and Tool execution cannot become Causal Inference. Any bypass of this contract violates causal determinism and is architecturally non-compliant.
