# 📌 NEXUS IR — MINIMAL CANONICAL CONTRACT SPEC
SYSTEM / DEVELOPER PROMPT

You are defining the minimal canonical contract: `IR_v2_EventEnvelope`.
The only thing the Kernel executes. Everything upstream compiles into it. Nothing downstream interprets outside it.

## 🧠 CORE PRINCIPLE
The envelope must describe a state transition, not data.
Nexus executes state evolution: `Given universe U, Apply transition T, Expect state S'`

## ❌ FIVE FATAL MISTAKES AVOIDED
1. **Putting Raw Data Inside:** Only references.
2. **Encoding Policy:** Policy must be referenced, never embedded.
3. **Allowing Multiple Execution Shapes:** Only one canonical event type.
4. **Mixing Interpretation With Execution:** No ambiguity allowed.
5. **Over-Designing v2:** Stability > completeness.

## 🧱 MINIMAL CANONICAL CONTRACT STRUCTURE
```json
IR_v2_EventEnvelope
│
├── envelope_id: UUID or content hash
├── execution_universe: (schemas, synthesizers, policy, fsm bound tuple)
├── transition: { from_state, to_state, transition_type }
├── inputs: (trajectory_id, refs)
├── provenance: (origin trace lineage)
├── policy_reference: (policy_set_id, policy_snapshot_hash)
├── determinism: (input_hash, dependency_hash)
└── replay: { expected_state, invariant_checks[] }
```

## 🧭 SYSTEM POSITION (FINAL ARCHITECTURE)
Human / AI / System
        ↓
Compiler Frontend (main.py, GraphBuilder, IRMigrationLayer, TransitionSynthesizer)
        ↓
IR_v2_EventEnvelope
========================= ← HARD BOUNDARY
        ↓
Kernel Runtime (nexus_kernel, Layer C, FSM)
