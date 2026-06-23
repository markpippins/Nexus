> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Active Episode (Thought Context)

This is the Cognitive RAM. It represents short-lived working memory for the ongoing session.
Unlike the PEB (Long-Term Memory), this context is ephemeral and tracks active reasoning trajectories across immediate sequential steps.

## Current Reasoning Trajectory
- Initializing the Thought Context structure.
- Separating short-term memory from long-term PEB storage.
