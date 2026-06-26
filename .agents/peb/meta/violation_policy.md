> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
# Violation Policy

This policy defines the bounds of structural integrity for outputs.

## Detection Rules
- The Validation Layer detects any structural violations, such as Authority Leakage (e.g., EXECUTOR emitting a WorkRequest), missing Two-Layer normalization, or contradictions to hard invariants.
- **CRITICAL CHANGE**: The Validation Layer DOES NOT HALT. It routes detected violations to the `peb-exception-router` for contextual evaluation.
