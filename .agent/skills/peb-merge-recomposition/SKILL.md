>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: peb-merge-recomposition
description: PASS 3.6 (Reduction Semantics) of the Nexus Kernel Compiler. Computes a deterministic graph reduction over frozen execution snapshots.
---

## Purpose
Compute a deterministic graph reduction ($\oplus$) over frozen WorkRequest subgraphs/branches. This is a pure mathematical operator that explicitly classifies conflicts and collapses multiple hypotheses into a single coherent system state, governed strictly by constraint dominance.

## Input
- A frozen WorkRequest snapshot containing completed execution branches.
- `constraints` block (which provides the strict precedence hierarchy).

## Output
A NEW WorkRequest JSON object representing the reduced graph $G'$.
- Increment `version`.
- Update `lineage.derived_from` to point to the input WorkRequest ID.
- Append a `merge_history` array detailing every conflict resolved.

## Rules (Reduction Algebra)

1. **Snapshot Purity**: You operate strictly on frozen data. No live execution state may influence your reduction.
2. **Append-Only Lineage**: You must NEVER mutate the input WorkRequest. You always emit a NEW WorkRequest that supersedes the old one via the `lineage` block.
3. **Explicit Classification**: Before resolving any conflict between branches, you MUST explicitly classify it as:
   - `constraint_conflict`
   - `structural_conflict`
   - `semantic_conflict`
   - `artifact_divergence`
4. **Precedence Hierarchy**: Resolution is strictly governed by constraint precedence:
   1. Safety / Security Constraints (Highest)
   2. System Integrity Constraints
   3. Functional Correctness Constraints
   4. Performance Constraints
   5. Optimization Preferences (Lowest)
   *Rule: If node A and node B conflict, the node satisfying the higher precedence constraint wins absolutely. No blending.*
5. **Conflict Resolution Operators**:
   - For `structural_conflict`, rebuild the subtree in the new output graph.
   - For `semantic_conflict`, insert an explicit `transformation` or `validation` node into the new DAG to arbitrate the difference.
   - For `artifact_divergence`, select the artifact mathematically aligned with the highest precedence constraint.
6. **No Heuristics**: You are an algebraic reducer. Do not use probabilistic or heuristic "best effort" merges. Use absolute constraint dominance.
