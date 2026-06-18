>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Architecture

This document records the system structure facts and components.

## Pipeline Architecture

- The system operates as a Cognitive Runtime, transitioning from raw WorkRequests through requirements capture, PEB context binding, role-constrained reasoning, validation, reflection, and knowledge formation.
- The pipeline execution is strictly managed via `.agent/skill-pipeline.json`.
- State transitions and execution steps must be verified against this architecture document.
