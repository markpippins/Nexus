# 📌 NEXUS IR — LAYER X: SYSTEM EVOLUTION & SCHEMA GOVERNANCE CONTRACT
SYSTEM / DEVELOPER PROMPT

This layer governs changes to the Nexus system itself (schema, logic, queries), establishing how Nexus evolves without violating determinism, replay integrity, or historical validity.

## 🧠 CORE PRINCIPLE
System evolution is append-only, versioned, and replay-compatible. There are NO destructive schema changes, NO retroactive reinterpretations of past events, and NO breaking changes without explicit version isolation.

## ⚖️ DUAL RUNTIME RULE (CRITICAL)
Multiple system versions may coexist. Replay of a historical DAG MUST always use the exact version of the system that originally produced it.
```text
Replay(G_t, version_at_time_of_creation) is immutable across all future system versions.
```
This guarantees historical determinism and non-corruption of past semantics.

## 🛑 NO RETROACTIVE SEMANTIC REWRITE RULE
System evolution MUST NOT reinterpret past events under new schemas, reclassify historical causal edges, modify replay outputs for past versions, or apply new merge logic retroactively. Past execution is frozen computation under the original rules.

## 🔗 OQL & OBSERVATION VERSION BINDING
OQL queries and `ObservationViews` are version-bound:
```text
Eval(Q, G_t, NEXUS_VERSION_v)
```
Query semantics are tied to the system version, and no cross-version comparison is valid without explicit diff semantics over Observational Projections.

## 🗄️ STRATEGY REGISTRY EVOLUTION
`ResolutionStrategy` updates MUST be registered as entirely new strategy versions. They MUST NOT overwrite existing strategies, ensuring that no global replacement of historical resolution behavior occurs.

## 🔒 IMMUTABLE HISTORY GUARANTEE
Nexus is a versioned deterministic causal computation system with fully replayable historical states across evolving system semantics. No system evolution may ever alter the interpretation of previously replayed EventEnvelope streams. Historical truth remains permanently fixed.
