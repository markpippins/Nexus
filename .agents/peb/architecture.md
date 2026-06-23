> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Architecture

This document records the system structure facts and components.

## Pipeline Architecture

- The system operates as a Cognitive Runtime, transitioning from raw WorkRequests through requirements capture, PEB context binding, role-constrained reasoning, validation, reflection, and knowledge formation.
- The pipeline execution is strictly managed via `.agents/skill-pipeline.json`.
- State transitions and execution steps must be verified against this architecture document.
