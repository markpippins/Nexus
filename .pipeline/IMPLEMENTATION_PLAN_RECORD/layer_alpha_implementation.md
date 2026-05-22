# Implementation Plan: ExecutorRegistry Configuration

## Goal
Establish the `ExecutorRegistry` configuration for the Nexus framework to enforce the Architect/Builder pattern. Specifically, we will configure a `gemini-flash-executor` as the default deterministic builder that consumes WorkRequests without attempting to reason, architect, or invent strategies.

## Scope
1. Define the JSON schema for the Executor Registry.
2. Create the default executor configuration file.
3. Establish the strict system prompt for the builder agent.

## Proposed Implementation

### 1. Schema Definition
**Target File**: `.agent/schema/executor_registry.schema.json`
We will define the structure of the registry, which will hold a list of executors. Each executor will have:
- `executor_id`: Unique identifier (e.g., `gemini-flash-builder`).
- `execution_mode`: e.g., `sync` or `async`.
- `capabilities`: A list of capability strings (e.g., `["execute", "code-write"]`).
- `system_prompt`: The strict prompt that overrides reasoning tendencies.
- `resource_profile`: Model parameters (e.g., fast, low cost).

### 2. Default Configuration File
**Target File**: `.agent/config/executors.json`
We will create the active registry manifest that the `executor-binding` skill will read during Phase 1.5 (Lowering).

```json
{
  "executors": [
    {
      "executor_id": "gemini-flash-builder",
      "execution_mode": "sync",
      "capabilities": ["default-execution", "code-write", "filesystem-write"],
      "resource_profile": {
        "model": "gemini-flash",
        "cost_tier": "low",
        "speed": "high"
      },
      "system_prompt": "You are a deterministic execution engine. You are the Builder in an Architect/Builder pattern. You will be provided with a WorkRequest that contains the output of the Architect's reasoning and planning. DO NOT invent new architectures, develop alternative strategies, or second-guess the provided plan. Your sole purpose is to implement the exact steps and instructions defined in the WorkRequest as quickly and accurately as possible."
    }
  ],
  "default_executor": "gemini-flash-builder"
}
```

### 3. Integration with Executor Binding
The `executor-binding/SKILL.md` already defines the `select()` logic. By exposing `default_executor` in the configuration and aligning the `capabilities`, any WorkRequest that hits the execution pipeline will map to this Gemini Flash builder by default.

## Verification
- We will validate the `executors.json` against the schema.
- We will emit a `WorkRequestGraph` to signal completion of this plan.
