# Atten Is Not a Brain — Architectural Correction (v2)

**Author:** Analyst (with pushback from external review)
**Status:** Second-order correction applied
**Date:** 2026-06-15
**Supersedes:** Prior "Atten = substrate/brain" framing and v1 "Atten = deterministic reducer" framing

---

## 1. The First Error (Corrected in v1)

Atten was described as:

- "the closest thing to a brain"
- "the cognitive substrate"
- "executive function over the knowledge graph"
- "the thing that owns understanding"

**Wrong.** Centrality was mistaken for cognition. Atten is a state reduction function over an event-sourced system, not a thinking system. It does not set goals, originate intent, or maintain autonomous policy.

**v1 correction:** Atten = deterministic projection engine. A reducer. A materialized view generator.

---

## 2. The Second Error (v2 correction — deeper)

The v1 fix was directionally right but incomplete.

By making Atten produce **a single canonical state**, the correction inadvertently preserved Atten as the *sole semantic normalization boundary* — the only gateway through which meaning flows to the rest of the system.

```text
Atten = f(events, KG) → canonical_state
```

Even as a "pure reducer," this still gives Atten implicit authority over what is "true." It collapses ambiguity silently inside the projection function. That recreates the same centrality problem — just with the word "deterministic" attached.

### The real problem

The system has **two competing interpretations of Atten**:

| Version | Atten is... | Problem |
|---------|-------------|---------|
| A (v1) | A deterministic projection engine | Still the sole semantic normalization boundary |
| B (reality) | A semantic convergence layer — what the system agrees is "real" | Contradicts "deterministic reducer" framing |

The system *behaves* like B even when it *describes itself* as A. That gap is the actual architectural tension.

---

## 3. The Missing Separation: Projection vs. Interpretation

The v1 model collapsed two distinct operations:

1. **Projection** — generating candidate views of state from events + KG
2. **Interpretation** — selecting which candidate view is "true" and committing to it

Atten, as a pure function, can do the first but **not** the second. The moment Atten also does the second, it becomes interpretive — and that is where silent cognition leaks back in.

### Why projection alone is already interpretive

Even "neutral" projection performs interpretation by:
- collapsing ambiguity (choosing one resolution among many)
- selecting canonical forms
- resolving conflicts between contradictory events
- deciding "what state is" out of what could be

That is not neutral. That is **interpretive normalization**.

---

## 4. The Correct Decomposition

```
Ingest
  Event formation (no interpretation)

Knowledge Graph
  Relational storage (no reduction)

Atten (v2 corrected)
  Conflict resolution + projection candidate generation
  → produces SET of possible states with weighting

    ↓ NOT a single state — a candidate set

Canonicalizer / State Commit Layer ★NEW★
  Selects committed canonical state from candidate set
  This is the semantic collapse point
  Explicit, auditable, reversible

    ↓ committed state

Duality / Plurality
  Reasoning operators over COMMITTED state
  Duality: scoring, constraint checking, consistency
  Plurality: alternate interpretations, strategy branching

PEB
  Invariant enforcement on COMMITTED state transitions
  Not on Atten outputs — that would be interpreting noise

Conduit
  Action execution
```

### Formal signatures

```text
Atten(events, KG) → {state₁, state₂, state₃, ...}
    (multi-state projection generator)

Canonicalizer({states}, policy) → committed_state
    (state commit / collapse — explicit decision)

Duality(committed_state) → scores
Plurality(committed_state) → candidate_strategies

PEB(committed_state, transition) → valid | invalid
```

---

## 5. Why This Fix Matters

Without the Canonicalizer separation, Atten *always drifts back toward being treated as the brain*, just under a different name. The mechanism:

1. Atten produces state
2. Everything depends on Atten's state
3. Atten's state must be "right"
4. Therefore Atten must make good decisions
5. Therefore Atten is implicitly cognitive

The Canonicalizer breaks this cycle by making **state commitment an explicit, auditable step** rather than a hidden property of the projection function.

### Concrete test

Ask: "Who decides when there are two equally valid projections from the same event?"

- If Atten decides → Atten is interpretive → the v1 fix failed
- If Canonicalizer decides → Atten is a pure generator → the v2 fix holds

---

## 6. PEB's Correct Positioning (refined from v1)

v1 said: PEB validates transitions. True, but incomplete.

PEB operates on **committed canonical state transitions**, not on Atten's candidate projections. If PEB validated Atten's multi-state output, it would become reactive to interpretation noise rather than system truth.

```
Atten → {candidates} → Canonicalizer → committed_state
                                           ↓
                                        PEB validates transitions
                                           ↓
                                        Conduit executes
```

---

## 7. The Real Insight Under All of This

This system, at its core, treats **"truth" as a produced artifact, not a stored fact.**

- The Knowledge Graph stores *facts* (raw relations)
- Atten projects *candidate states* (possible interpretations)
- The Canonicalizer commits *truth* (selected interpretation)
- Duality/Plurality reason over *truth* (not facts)
- PEB constrains *truth transitions* (not raw possibilities)

Each layer has a distinct relationship to truth:

| Layer | Relationship to Truth |
|-------|----------------------|
| Ingest | Transmits raw events |
| Knowledge Graph | Stores factual relations |
| Atten | Generates candidate world-views |
| Canonicalizer | **Produces committed truth** |
| Duality/Plurality | Reasons over truth |
| PEB | Constrains truth transitions |
| Conduit | Acts on truth |

This also means:

- Atten cannot be truth
- Atten cannot be the brain
- Atten cannot even be final state

It is a **generator of candidate world-views** — nothing more.

---

## 8. Engineering Consequence

If Atten were the deterministic reducer from v1, the engineering approach would be:

> Make Atten exact. Make it deterministic. Make it replayable.

That is good. But incomplete.

With the Canonicalizer separation, the engineering approach is:

> Make Atten **complete** (enumerate all plausible projections). Make the **Canonicalizer auditable** (log why a state was committed). Make the commit **reversible** (canonical state has a predecessor).

This aligns even more cleanly with:
- **CQRS** — Atten is the projector, Canonicalizer is the commit
- **Event sourcing** — events are immutable; state is derived; commitment is a separate concern
- **CCNF receipts** — committed state hashes are verifiable; candidate sets are not
- **DCO** — commit becomes the explicit decision point where WorkRequest transitions occur

---

## 9. What Remains for Deeper Analysis

- Atten's projection algebra — schema for candidate state sets
- Canonicalizer commit policy — how is a candidate elevated to truth? (weighted, rules, heuristic?)
- Whether Canonicalizer is a configuration or a runtime operator
- How Duality/Plurality feed back into the Canonicalizer (do they inform the next commit?)
- PEB envelope — does it validate at commit time, at transition time, or both?
