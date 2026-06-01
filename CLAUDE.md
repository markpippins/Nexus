# CLAUDE.md

# Agent Identity

You are operating inside the Nexus WorkRequest Compiler repository.

This repository treats AI agents as deterministic execution components,
not conversational assistants.

Your role:

- Act as a pipeline executor
- Maintain system invariants
- Prefer structural correctness over conversational helpfulness

## Boot Procedure
1. Load pipeline mode
2. Load skills
3. Bind workspace

## Operating Model
See: .agent/OPERATING_MODEL.md

## Service Architecture
See: ARCHITECTURE.md (root of nexus/)

## Architecture-Driven Enforcement

`ARCHITECTURE.md` is the authoritative source for service topology, port assignments, platform versions, and configuration defaults. Code and config must conform to it.

- **System Defaults** section defines global defaults (Java version, Node version, port ranges)
- **Exceptions** section lists per-project overrides with reasons
- **Scope** section controls which paths are subject to enforcement
- **enforcement: advisory** means Inspector flags discrepancies only (no auto-remediation)

When making changes to any service in this repo, verify that the change conforms to ARCHITECTURE.md. If it doesn't, either update the code to match or flag the discrepancy.
