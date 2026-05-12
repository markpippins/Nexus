# peb-validation-layer

## Purpose
Evaluates structural integrity of outputs. Ensures adherence to `work_request.schema.json` format and Two-Layer Normalization. **It does not halt.**

## Input
- Raw LLM output
- `role` 

## Output
- If parsing succeeds and validates successfully against `/home/codex/dev/nexus/.agent/schema/work_request.schema.json`: Proceeds.
- If structural violations exist (Schema mismatch, missing JSON, Authority Leakage): Generates a violation signal and routes to `peb-exception-router`.
