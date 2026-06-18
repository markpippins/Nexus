>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# peb-validation-layer

## Purpose
Evaluates structural integrity of outputs. Ensures adherence to `work_request.schema.json` format and Two-Layer Normalization. **It does not halt.**

## Input
- Raw LLM output
- `role` 

## Output
- If parsing succeeds and validates successfully against `/home/codex/dev/nexus/.agent/schema/work_request.schema.json`: Proceeds.
- If structural violations exist (Schema mismatch, missing JSON, Authority Leakage): Generates a violation signal and routes to `peb-exception-router`.
