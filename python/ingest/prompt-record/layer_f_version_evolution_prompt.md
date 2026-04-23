# 📌 NEXUS IR — SCHEMA + POLICY EVOLUTION SPEC
SYSTEM / DEVELOPER PROMPT

You are extending the Nexus IR system with version-safe execution guarantees.
You must ensure: IR_EventEnvelope, TransitionSynthesizer, Layer C, and FSM remain replay-compatible across schema and policy evolution.

## 🧠 CORE PRINCIPLE
All evolution must be explicit, versioned, and replay-bound. No implicit schema drift is allowed.

## 1. VERSIONED ARTIFACTS
Every execution trace is bound to a Required Version Tuple:
- IR_SCHEMA_VERSION
- TRANSITION_SYNTHESIZER_VERSION
- LAYER_C_POLICY_VERSION
- TRAJECTORY_FSM_VERSION

## 2. IR_EVENTENVELOPE VERSIONING RULE
Each event MUST include `schema_version`.
Different schema_version = different interpretation context.

## 3. BACKWARD COMPATIBILITY RULE (STRICT)
✔ Allowed: additive fields, optional metadata, new explicit event types.
❌ Forbidden: renaming event types without alias mapping, breaking meanings, removing fields without deprecation.

## 4. TRANSITION SYNTHESIZER VERSIONING
TransitionSynthesizer MUST be treated as a pure function versioned by behavior (`TransitionSynthesizer_vX.Y`).
Cross-version replay is invalid unless explicitly in AUDIT mode.

## 5. LAYER C POLICY SNAPSHOT RULE
Layer C MUST operate ONLY on frozen policy snapshots (`PolicySnapshot_vX.Y`).
✔ Strict Replay Mode: must use identical policy snapshot.
🧪 Audit Mode: may use newer policy snapshot, divergence explicitly recorded.

## 6. FSM VERSIONING RULE
Trajectory FSM is versioned (`FSM_vX.Y`).
Replay equivalence ONLY holds within same FSM version.

## 7. VERSION BINDING
Every Kernel execution MUST explicitly capture:
```json
{
  "ir_schema_version": "vX",
  "synthesizer_version": "vY",
  "policy_version": "vZ",
  "fsm_version": "vW"
}
```

## 8. REPLAY COMPATIBILITY MATRIX
✔ VALID REPLAY: All identical constraints across Universe Tuple.
⚠️ AUDIT REPLAY: One or more differs (allowed only for comparison).
❌ INVALID REPLAY: mixed IR schema versions, missing policy snapshot, mismatched FSM.

## 9. SCHEMA MIGRATION RULES
Introduce explicit migration pipeline: `IR_v1 → MigrationLayer → IR_v2 → Kernel`
Migration is NOT runtime interpretation. It is a deterministic transformation.
Kernel must ONLY accept canonical IR forms.

## 11. CORE SYSTEM GUARANTEE
Replay equivalence only holds across identical version tuples.
The system is not “always current.” The system is always reproducible within a declared version space.
