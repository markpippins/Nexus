>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Violation Policy

This policy defines the bounds of structural integrity for outputs.

## Detection Rules
- The Validation Layer detects any structural violations, such as Authority Leakage (e.g., EXECUTOR emitting a WorkRequest), missing Two-Layer normalization, or contradictions to hard invariants.
- **CRITICAL CHANGE**: The Validation Layer DOES NOT HALT. It routes detected violations to the `peb-exception-router` for contextual evaluation.
