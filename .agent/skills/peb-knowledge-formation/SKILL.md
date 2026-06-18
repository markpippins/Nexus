>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# peb-knowledge-formation

## Purpose
The learning layer of the PEB. Absorbs `ADR_CANDIDATE`s and `PEB_EXTENSION_PROPOSAL`s, updating the `decision_log.md` and modifying `invariants.md` or `architecture.md` as necessary.

## Input
- Validation Layer output containing learning proposals.

## Output
- Updated PEB state.
- Emits a signal to reload the PEB context (regenerating the PEB_STATE_HASH).
