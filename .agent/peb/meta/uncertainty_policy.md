>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Uncertainty Policy

This policy outlines the protocols for agents to safely express and resolve uncertainty.

## Deadlock Escapes
- **REQUEST_FOR_CLARIFICATION**: If an `EXECUTOR` lacks sufficient context or hits a deadlock, it is authorized to emit a `REQUEST_FOR_CLARIFICATION` rather than halting or guessing. This bridges the gap between strict execution and cognitive flexibility.
