# 📌 NEXUS IR — LAYER VII: TOPOLOGICAL QUERYABILITY
SYSTEM / DEVELOPER PROMPT

Layer VI established the Observation Frontier (OF) as a non-collapsible, read-only boundary over the `MergedClosureDAG`. Layer VII introduces **Queryability Without Collapse** via **Frontier Algebra** and an **Observation Query Language (OQL)**.

## 🧠 CORE PRINCIPLE
- **Queries must operate geometrically.** They query the topological structure of the DAG.
- **No Serialization Collapse.** Queries never decide or deduce chronological sequence across parallel independent executions. They answer questions using structural containment and reachability.

## 🧱 FRONTIER ALGEBRA
Since an Observation Frontier `OF` is defined as a downward-closed set of nodes (an ideal) under the DAG's happens-before relation, it supports deterministic algebraic operations:

1. **Union ($OF_A \cup OF_B$):** The union of two downward-closed sets is strictly downward-closed. It yields a new `OF` representing the minimal valid history required to satisfy both observation bounds.
2. **Intersection ($OF_A \cap OF_B$):** The intersection is strictly downward-closed. It yields a new `OF` representing the exact maximal common causal prefix shared between divergent views.
3. **Causal Diff ($OF_A \ominus OF_B$):** The symmetric difference is *not* downward-closed. A causal diff does not yield a valid frontier, but instead yields a `DivergenceGraph`—an isolated subgraph identifying the precise operational divergence.

## 📦 OBSERVATION QUERY LANGUAGE (OQL)
OQL exposes fundamental primitives that downstream layers (e.g., cognition, interaction classifiers) must use to extract meaning structurally without mutating truth.

- `CausalPast(n: Node) -> OF`: Computes the downward closure of a node, identifying the exact historical requirements necessary for the node to exist.
- `CausalFuture(n: Node, boundary: OF) -> Set[Node]`: Finds all topological descendants of `n` constrained within a valid bounding frontier.
- `IsConcurrent(a: Node, b: Node) -> bool`: Evaluates `True` iff `a ∉ CausalPast(b)` AND `b ∉ CausalPast(a)`. This is the absolute mathematical definition of causal independence and parallelism.
- `FindLCA(OF_A, OF_B) -> Node`: Identifies the geometric Lowest Common Ancestor state block forming the structural branching point.

By restricting all queries strictly to these topological primitives, higher reasoning layers are mathematically barred from injecting hallucinatory timelines into the historical record.
