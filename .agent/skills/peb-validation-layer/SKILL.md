# peb-validation-layer

## Purpose
Evaluates structural integrity of outputs according to Two-Layer Normalization and basic role boundaries. **It does not halt.**

## Input
- Raw LLM output
- `role` 

## Output
- If parsing succeeds (valid `STRUCTURED RESULT` JSON block) and boundaries are intact: Proceeds.
- If structural violations exist (missing JSON, Authority Leakage): Generates a violation signal and routes to `peb-exception-router`.
