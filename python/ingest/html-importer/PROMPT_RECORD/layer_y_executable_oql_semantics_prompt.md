# 📌 NEXUS IR — LAYER VII: EXECUTABLE OQL SEMANTICS
SYSTEM / DEVELOPER PROMPT

Layer VII defines the formal execution model for the Observation Query Language (OQL). 

## 🧠 CORE PRINCIPLE
OQL is a deterministic evaluation system over a partially ordered causal graph. It queries structural reachability constraints, absolutely prohibiting snapshot semantics, serialization, or global time axes.

## 🧱 EVALUATION MODEL & TYPE SYSTEM
All queries evaluate against the `MergedClosureDAG` but are interpreted as transformations over subgraph projections. Every query must return one of the following strictly topological types:
1. `Set[Node]`
2. `Set[Edge]`
3. `ObservationView (OF)` (A downward-closed `Set[Node]`)
4. `DivergenceGraph` (A subgraph isolating structural non-equivalence)

## 📦 STRICT EVALUATION SEMANTICS

1. **`CausalPast(n)`**: `transitive_closure_predecessors(n)`
2. **`CausalFuture(n)`**: `transitive_closure_successors(n)`
3. **`IsConcurrent(a, b)`**: `a ∉ CausalPast(b) AND b ∉ CausalPast(a)` (Defines structural independence).
4. **Frontier Algebra**:
   - `Union(OF_A, OF_B)`: Computes downward closure of the merged sets.
   - `Intersection(OF_A, OF_B)`: Automatically remains a valid OF.
5. **`DivergenceGraph(OF_A, OF_B)`**:
   - This isolates structural non-equivalence: `OF_A Δ OF_B`
   - **Crucial Rule:** It must NOT be a raw symmetric difference. It must include causal boundary nodes (the lowest shared ancestors directly preceding the divergence). 

## 🛑 EXECUTION RULES (INVARIANTS)
1. **No total ordering allowed.** OQL must never produce sorted timelines or linear histories.
2. **All outputs are partial-order preserved.** Results are either downward-closed or explicitly labeled divergence boundaries.
3. **No semantic filtering.** Allowed filters are restricted strictly to structural membership, reachability, and causal dependency.
4. **Closure stability requirement.** Any query `Q(G)` must mathematically guarantee invariance under all valid topological sorts of `G`.
