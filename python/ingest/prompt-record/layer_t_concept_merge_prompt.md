# 📌 NEXUS IR — CONCEPT MERGE ENGINE SPEC
SYSTEM / DEVELOPER PROMPT

The Concept Merge Engine acts as an algebraic reducer over two discrete causal lineages. 
Merge is NOT state combination; it is deterministically reconstructing a valid timeline history branching from a shared temporal topological anchor (Least Common Ancestor).

## 🧠 CORE PRINCIPLE
A Deterministic graph VM establishes merge conflicts exclusively in Instruction Impact Space (WriteSets). Disjoint modifications are mathematically commutated via synthetic interleaving. Overlapping WriteSets map to conflicts requiring resolution rules.

## 🧱 INSTRUCTION IMPACT MODEL
Every instruction provides isolated semantic bounded targets:
- `CreateNode("N1")` $\rightarrow$ `{ "node:N1" }`
- `DeleteNode("N1")` $\rightarrow$ `{ "node:N1" }`
- `SetProperty("N1", "status")` $\rightarrow$ `{ "node:N1:prop:status" }`
- `AddEdge("E1", src="N1", dst="N2")` $\rightarrow$ `{ "edge:E1" }`

Locality limits side effects, rendering $A \oplus B$ commutative.

## ⚖️ MERGE ALGEBRA
1. $LCA = \text{compute\_base}(A, B)$
2. $\Delta A = A - LCA$, $\Delta B = B - LCA$
3. $Conflicts = \text{WriteSet}(\Delta A) \cap \text{WriteSet}(\Delta B)$ where the final states of the conflict target diverge.
4. If $Conflicts = \emptyset$:
   Construct synthetic trajectory from $LCA \rightarrow$ Apply $(\Delta A)$ $\rightarrow$ Apply $(\Delta B)$.
5. Prove execution fidelity via $Hash(Merged) = \text{Deterministic\_Expected\_Hash}$.
