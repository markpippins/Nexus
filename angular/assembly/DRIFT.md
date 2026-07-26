# DRIFT.md — assembly Library vs Backend

**Date:** 2026-07-23
**Compared:** Library code ↔ `nexus/typescript/assembly-srv/` + `nexus/typescript/assembly-mcp/`
**Status:** Shared library — analysis applies to consumers (assembly-ui)

---

## Important: Shared Library

The `assembly` directory is a **shared utility library** consumed by `assembly-ui` (and potentially other apps), not a standalone application. It provides shared types, utilities, and services for the Assembly forum system.

For the actual application drift, see `assembly-ui/DRIFT.md` (if it exists).

---

## Backend Services

| Service | Path | Purpose |
|---|---|---|
| `assembly-srv` | `nexus/typescript/assembly-srv/` | REST API on port 3107 (forums, threads, users) |
| `assembly-mcp` | `nexus/typescript/assembly-mcp/` | JSON-RPC MCP server |

---

## Summary

| Priority | Area | Notes |
|---|---|---|
| **N/A** | Library drift | The `assembly/` directory is a library — drift analysis belongs in its consumer (`assembly-ui`) |
