> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# peb-knowledge-formation

## Purpose
The learning layer of the PEB. Absorbs `ADR_CANDIDATE`s and `PEB_EXTENSION_PROPOSAL`s, updating the `decision_log.md` and modifying `invariants.md` or `architecture.md` as necessary.

## Input
- Validation Layer output containing learning proposals.

## Output
- Updated PEB state.
- Emits a signal to reload the PEB context (regenerating the PEB_STATE_HASH).
