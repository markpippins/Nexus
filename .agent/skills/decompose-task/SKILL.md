>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: decompose-task
description: PASS 3 (Expansion Semantics) of the Nexus Kernel Compiler. Generates a strict Directed Acyclic Graph (DAG) representing cognitive execution steps.
---

## Purpose
Convert intent into a strictly valid `DecompositionBlock` (execution DAG) representing a stateful cognitive execution graph, totally independent of downstream execution semantics.

## Input
- `intent` (IntentBlock)
- `requirements` (RequirementsBlock)
- `constraints` (ConstraintBlock)

## Output
A valid `DecompositionBlock` injected into the WorkRequest DCO.

## Rules (Expansion Semantics)

1. **DAG Requirement (No Cycles)**: Output must be a pure DAG. No cycles. All dependencies must be explicit `step_id` references.
2. **Atomicity Rule**: Each step must be exactly one cognitive operation. No combined actions (e.g., "analyze and implement" is invalid).
3. **Type Tagging Rule**: Every step must be tagged with exactly one type: `analysis`, `transformation`, `generation`, `validation`, `execution`.
4. **Dependency Rule**: No forward dependencies. Steps can only rely on explicit outputs from prior steps. No implicit "global context".
5. **Closure Rule**: Every step must be executable with its declared inputs ONLY.
6. **Branching Requirement**: If abstraction level $\ge$ system, the DAG MUST contain $\ge$ 2 independent branches.
7. **Parallelism Requirement**: If $\ge$ 3 steps exist, there must be at least one non-sequential dependency structure (no pure linear chains allowed unless explicitly justified).
8. **Separation Rule**: `analysis` $\rightarrow$ `execution` and `generation` $\rightarrow$ `execution` must NEVER be directly adjacent. They require at least one intermediate `transformation` or `validation` node.
9. **Constraint-Induced Branching**: If multiple constraint groups exist, at least one step must exist per constraint group (constraints materialize into structure).