# 🧱 NEXUS COMPILER CONTRACT SHEET (v1)

This is the architectural invariant document.
It must be used to validate outputs, detect semantic drift early, prevent "smart-sounding corruption," and enforce layer boundaries mechanically.

## 1. CORE SYSTEM TYPE

**Nexus is:**
A deterministic event-sourced causal compiler over a partially ordered DAG.

**It is NOT:**
- an AI reasoning system
- a semantic graph system
- a probabilistic inference engine

## 2. LAYERED ARCHITECTURE (NON-NEGOTIABLE)

**Layer I — Event Truth**
- **Input:** `IR_EventEnvelope`
- **Properties:** immutable, ordered, versioned
- **Rule:** never modified post-creation

**Layer II — ReplayEngine**
- **Input:** Event stream
- **Output:** `ClosureSet(T)`
- **Rule:** deterministic reduction only
- **Forbidden:** interpretation, inference

**Layer III — InteractionClassifier**
- **Input:** Replay output
- **Output:** annotations only
- **Rule:** metadata overlay only
- **Forbidden:** structural modification

**Layer IV — ContextAssembler**
- **Input:** `ClosureSet`
- **Output:** execution context projection
- **Rule:** projection only, no mutation

**Layer V — Concept Merge Engine**
- **Input:** multiple `ClosureSets`
- **Output:** `MergedClosureDAG`
- **Allowed:**
  - read/write set collision detection
  - interference graph construction
  - connected component extraction
  - minimal causal edge injection (only via `ResolutionStrategy`)
- **Forbidden:**
  - semantic similarity
  - conceptual reasoning
  - intent inference
  - probabilistic conflict resolution

**Layer VI — Observation Without Authority**
- **Input:** `MergedClosureDAG`
- **Output:** `ObservationView` (read-only slice)
- **Rule:**
  - produces downward-closed causal frontiers only
- **Forbidden:**
  - DAG mutation
  - resolution calls
  - ordering decisions

**Layer VII — OQL (Query Layer)**
- **Allowed:**
  - graph traversal queries
  - reachability queries
  - frontier algebra (union/intersection)
  - concurrency checks
- **Forbidden:**
  - execution planning
  - state modification
  - semantic interpretation

## 3. GLOBAL INVARIANTS (SYSTEM-WIDE)

**G1 — Determinism**
Same input `EventEnvelope` stream → identical `ClosureSets` → identical `MergedDAG` → identical `ObservationViews`

**G2 — Structural Purity**
No layer above Layer II may:
- modify Event Truth
- rewrite history
- collapse nodes

**G3 — Causal Integrity**
All dependencies must satisfy:
- if (a → b) exists then a must precede b in all valid topological sorts

**G4 — No Semantic Authority in Structural Layers**
Layers I–VI:
- MUST NOT use meaning, intent, similarity, or interpretation as decision inputs
- Only allowed inputs: read/write sets, graph structure, explicit metadata fields

**G5 — Metadata is not semantics**
Fields like:
- `actor_id`
- `confidence`
- `reason`
are deterministic selectors, NOT semantic reasoning signals.

## 4. DRIFT DETECTION RULES (IMPORTANT)

If any output contains:
🚫 "context-aware" → likely semantic contamination
🚫 "intent-based resolution" → invalid Layer V behavior
🚫 "conceptual similarity" → forbidden in merge layer
🚫 "semantic evaluation" → invalid anywhere below Layer VI
🚫 "meaning-based ordering" → catastrophic violation

## 5. VALIDATION CHECKLIST (FOR OUTPUTS)

For any generated design or code:
Must pass:
- [ ] No semantic reasoning in Layers I–VI
- [ ] All merges based only on read/write set intersections
- [ ] All observation slices downward-closed
- [ ] No total ordering assumptions
- [ ] No probabilistic conflict resolution
- [ ] Metadata used only as deterministic selector
- [ ] DAG remains acyclic unless explicitly defined otherwise

## 6. ONE-LINE SYSTEM DEFINITION

Nexus is a deterministic causal compiler that preserves full event history while allowing only structure-preserving transformations over a partially ordered execution graph.
