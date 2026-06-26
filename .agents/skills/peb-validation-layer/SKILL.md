> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# peb-validation-layer

## Purpose
Evaluates structural integrity of outputs. Ensures adherence to `work_request.schema.json` format and Two-Layer Normalization. **It does not halt.**

## Input
- Raw LLM output
- `role` 

## Output
- If parsing succeeds and validates successfully against `/home/codex/dev/nexus/.agents/schema/work_request.schema.json`: Proceeds.
- If structural violations exist (Schema mismatch, missing JSON, Authority Leakage): Generates a violation signal and routes to `peb-exception-router`.
