> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# PEB Intent

This document records the high-level goals and purposes of the system.
It is part of the authoritative context of the Persistent Engineering Brain.

## Core Goals
- Maintain a deterministic pipeline for agentic execution.
- Prevent autonomous drift by grounding all decisions in the PEB state.
- Enable safe cognitive escalation when uncertainty or architectural gaps are encountered.
