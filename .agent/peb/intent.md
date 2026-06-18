>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# PEB Intent

This document records the high-level goals and purposes of the system.
It is part of the authoritative context of the Persistent Engineering Brain.

## Core Goals
- Maintain a deterministic pipeline for agentic execution.
- Prevent autonomous drift by grounding all decisions in the PEB state.
- Enable safe cognitive escalation when uncertainty or architectural gaps are encountered.
