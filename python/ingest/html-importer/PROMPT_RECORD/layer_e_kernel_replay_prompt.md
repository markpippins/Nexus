# 📌 NEXUS IR — KERNEL REPLAY EQUIVALENCE SPEC
SYSTEM / DEVELOPER PROMPT

You are extending the Nexus Kernel with deterministic replay guarantees.
The Kernel must ensure that LIVE execution and REPLAY execution are functionally equivalent at the level of TransitionRequests and Trajectory FSM state transitions.

## 🧠 CORE PRINCIPLE
Replay is not simulation. Replay is re-execution of a deterministic transition pipeline.
No probabilistic behavior is allowed to affect outcomes.

## 1. REPLAY EQUIVALENCE DEFINITION
Two executions are equivalent if:
`Kernel.run(batch, mode="LIVE") ≡ Kernel.run(batch, mode="REPLAY")`
AND produce identical:
- TransitionRequest sequences
- Layer C decisions
- FSM state transitions
- final Trajectory state

## 2. HARD DETERMINISM RULES
**❌ NO NON-DETERMINISTIC INPUTS:** timestamps, random functions, environment state, external queries, async ambiguities.
**✔ ONLY IR-DEFINED STATE:** IR_EventEnvelope stream, schema_version, ConstraintNode snapshot, stored PolicySnapshot.

## 3. LAYER C REPLAY CONTRACT
Layer C MUST operate with explicit policy bindings:
**🟢 STRICT REPLAY MODE**: uses frozen policy snapshot. Produces identical decisions to original execution.
**🧪 AUDIT MODE**: recomputes using current policy. Used ONLY for divergence analysis.

## 4. TRANSITION SYNTHESIZER REPLAY RULE
TransitionSynthesizer MUST be a pure function over `IR_EventEnvelope`.
`TransitionRequests = f(IR_EventEnvelope_batch)`

## 5. FSM DETERMINISM RULE
Trajectory FSM MUST:
- accept TransitionRequest sequence
- apply transitions in strict order
- never reorder events
- never infer missing transitions

## 6. ORDERING GUARANTEE (CRITICAL)
Kernel MUST enforce: identical ordering of events -> identical ordering of transition requests -> identical FSM transitions.
If ordering differs: REPLAY INVALID.

## 7. STATE SNAPSHOT RULE
Kernel MUST store in trace: trajectory_state checkpoints, constraints, policy version hash, schema_version hash.

## 8. KERNEL REPLAY PIPELINE
IR_EventEnvelope stream
        ↓
TransitionSynthesizer (pure)
        ↓
TransitionRequest stream
        ↓
Layer C (policy_snapshot_vX explicitly)
        ↓
FSM deterministic apply
        ↓
Trajectory snapshot reconstruction

## 9. REPLAY VALIDATION FUNCTION
`Kernel.validate_replay(live_trace, replay_trace) -> ReplayValidationResult`
**VALIDATION CRITERIA**
✔ EXACT MATCH REQUIRED: TransitionRequest list, Layer C decisions, FSM state sequences.
❌ FAILURE CONDITIONS: any divergence in transition ordering, decisions, or FSM endpoints.

## 11. CRITICAL DESIGN GUARANTEE
Kernel is a pure function over: `(IR_EventEnvelope_stream, policy_snapshot, schema_snapshot) -> deterministic execution trace`
