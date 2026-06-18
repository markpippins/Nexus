>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
🧭 WORKREQUEST GENERATION RULES (v1.0 DCO Schema)

## 1. CORE PRINCIPLE
A WorkRequest is an immutable, versioned, Directed Acyclic Cognitive Object (DCO). It is the canonical execution AST. You are compiling intent into an executable 9-block schema.

## 2. THE 9-BLOCK SCHEMA
Your output MUST be a valid JSON object strictly conforming to `work_request.schema.json`.

Required Blocks:
1. `id` and `version`
2. `intent`: Semantic root. Provide `problem_statement`, `desired_outcome`, `domain`, `priority`, `user_intent_trace`, and `abstraction_level`.
3. `decomposition`: The execution DAG. Must include `strategy`, `steps`, `parallelism_model`, and `recursion_allowed`.
4. `requirements`: `functional`, `non_functional`, `system_requirements`, `tool_requirements`.
5. `constraints`: `forbidden_actions`, `safety_constraints`, `resource_limits`, `architectural_constraints`.
6. `success_criteria`: Termination logic. `validation_rules`, `acceptance_tests`, `completion_conditions`, `failure_modes`.
7. `execution_state`: Runtime tracking. Must be initialized to `{"status": "pending", "progress": 0.0}`.
8. `lineage`: Ancestry tracking. `derived_from`, `supersedes`, `branches`, `merge_history`.
9. `artifacts`: `produced_files`, `intermediate_outputs`.
10. `metadata`: Context tags.

## 3. DECOMPOSITION AST RULES (PASS 3)
1. **Atomicity**: Each step in the `decomposition.steps` array must be a single cognitive operation.
2. **Type Tagging**: Every step must have a `type` (`analysis`, `transformation`, `generation`, `validation`, `execution`).
3. **Dependency**: Forward dependencies are strictly forbidden. Steps can only depend on explicit outputs from prior steps.

## 4. LIFECYCLE & SUPERSESSION
- A WorkRequest is IMMUTABLE.
- To change a WorkRequest, emit a new one with an incremented version, and explicitly define the replaced version in `lineage.supersedes`.
