---
name: work-request-emission
description: Helper skill for emitting work requests conforming to the execution kernel contract.
---

workrequest generation rules defined at: ./references/WORKREQUEST_GENERATION_RULES.md


## Purpose
Ensure all generated WorkRequests conform to the execution kernel contract.

## Input
Unstructured or semi-structured task intent from planner context.

## Output
One or more valid WorkRequest JSON objects.

## Rules

1. **Lifecycle Schema**:
   - Every WorkRequest MUST include: `id`, `intent_node_id`, `version`, `state`, `layer_mode`, `supersedes`, `derivation`, `path`, `intent_layer`, and optionally `binding_layer` and `execution_layer`.
   - Initial state is ALWAYS `DRAFT`.

2. **Supersession Enforcement & Immutability (CRITICAL)**:
   - WorkRequests are strictly IMMUTABLE. You MUST NEVER edit an existing WorkRequest file in-place.
   - Always emit a completely new file with an incremented version (e.g., `_v2`, `_v3`) for any modification.
   - Detect existing WorkRequests for the same `intent_node_id`.
   - Mark previous versions as `SUPERSEDED`.
   - Explicitly link them in the `supersedes` array of the new immutable file.

3. **Execution Safety**:
   - Each WorkRequest MUST be atomic and executable without interpretation.
   - Non-`APPROVED` WorkRequests MUST be ignored by execution systems.

4. **Semantic Discipline & 3-Layer Separation**:
   - forbidden: "improve system", "refactor architecture", semi-open-ended descriptions in execution layers.
   - forbidden: LLM repair heuristics, e.g., "bypass type checks", "use @ts-ignore", "hack around X"
   - required: Explicit separation of Intent (what must be true), Binding (how to resolve), and Execution (atomic transformations).
   - required: Execution layer must ONLY be present if a binding is explicitly selected (`layer_mode: "EXECUTION-BOUND"`).
   - required: Derivation metadata must use structural pointers (e.g., rule IDs, specific WR field references) and reference layer transitions.

5. **No hidden dependencies**:
   - all required context must be listed in resources

6. **Output must be valid JSON only**.

