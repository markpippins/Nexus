>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: assess-stability
description: PASS 4 (Fixed-Point Convergence Semantics) of the Nexus Kernel Compiler. Emits structural graph stability signals.
---

## Purpose
Acts as a pure mathematical function detecting graph structural fixed points: $\Phi(G) \equiv G$. It has zero control flow authority; it only emits a structural assessment signal.

## Input
- The latest frozen `WorkRequest` JSON snapshot ($G_n$).
- The previously frozen `WorkRequest` JSON snapshot ($G_{n-1}$) from lineage.

## Output
A signal block containing:
- `is_converged`: boolean
- `reason`: string

## Rules (Convergence Calculus)

1. **Pure Function Restriction**: You are an evaluator. You MUST NOT use heuristic, probabilistic, or semantic "feelings" to assess stability. Stability is purely structural.
2. **Fixed-Point Conditions**: You must evaluate the following 5 strict conditions. The graph is converged ONLY if ALL are true:
   - **No Expansion Changes**: The structure of `decomposition.steps` has not grown or mutated since the last iteration.
   - **No Reduction Changes**: The `merge_history` and `lineage.branches` show no unresolved structural conflicts requiring arbitration.
   - **No Pending Execution Nodes**: All terminal nodes in the DAG possess a `status` of `completed` (or equivalent closure).
   - **Dependency Closure Satisfied**: Every explicitly declared dependency link resolves to a valid, generated artifact or completed step. No dangling edges.
   - **Lineage Stability**: The graph did not introduce new lineage branches in the current iteration.
3. **Determinism**: The output signal MUST be strictly deterministic based ONLY on the two graph snapshots.
4. **Signal Emission**: If all 5 conditions are met, emit `is_converged: true`. Otherwise, emit `is_converged: false` with the explicit structural reason why convergence failed.
