# 📌 NEXUS IR — LAYER VII EXTENSION: INCREMENTAL EVALUATION MODEL
SYSTEM / DEVELOPER PROMPT

This specification defines how OQL maintains correctness under changes to the underlying causal DAG (G). G remains immutable per historical version but may evolve via new appended EventEnvelopes, producing `G_t+1`.

## 🧠 CORE PRINCIPLE
OQL evaluation is version-stable and delta-aware. It is never recomputed globally unless required.

## 🧱 INCREMENTAL EVALUATION RULE
For any query `Q`:
```text
Eval(Q, G_t+1) = Eval(Q, G_t) ⊕ Delta(Q, ΔG)
```
Where:
- `ΔG` = structural difference induced by new events.
- `⊕` = set update operator constrained by DAG validity rules.

## 🎯 DELTA SCOPE CONSTRAINT
Only nodes reachable from newly added EventEnvelopes or affected read/write set collisions may influence recomputation. No global recomputation is allowed unless `ΔG` touches the full dependency closure of `Q`.

**Frontier Stability Rule:**
If an Observation Frontier `OF` is topologically unaffected by `ΔG`:
`Eval(OF, G_t+1) == Eval(OF, G_t)`

## 🗄️ CACHE SAFETY RULE (CRITICAL)
Any cached evaluation result MUST include:
1. DAG version identifier (`G_t`)
2. Dependency footprint (set of nodes accessed)
3. Read/write set dependency closure

Cached results are invalidated if and only if any dependency node intersects `ΔG`'s causal closure.

## ⚖️ DETERMINISM INVARIANT
Incremental evaluation must strictly guarantee:
```text
Eval(Q, G_t+1) == full_recompute(Q, G_t+1)
```
Incremental optimization must never alter semantics. Delta evaluation is purely a mathematical performance mechanism, not a streaming or runtime scheduler.
