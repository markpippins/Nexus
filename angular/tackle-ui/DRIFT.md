# DRIFT.md — tackle-ui Client vs tackle-mcp Mismatches

**Date:** 2026-07-23
**Compared:** `src/app/services/api-config.ts` + service files ↔ `nexus/typescript/tackle-mcp/`
**Status:** Protocol-based (MCP), limited REST surface

---

## Important: MCP Protocol Architecture

Tackle-ui communicates with `tackle-mcp` using the **Model Context Protocol (MCP)**, similar to conduit-mcp. The backend exposes tools via `POST /tools/call` and provides SSE streaming.

---

## Observations

### Client Surface

The tackle-ui client exposes these service areas:
- **AI Config:** `ai-config.service.ts` — likely reads AI model/provider config
- **Roles:** `roles.service.ts` — role and permission management
- **Theme:** `theme.service.ts` — UI theme preferences
- **UI Event Bus:** `ui-event-bus.service.ts` — cross-app event synchronization
- **Toast:** `toast.service.ts` — notification system

### Backend Surface (tackle-mcp)

`tackle-mcp` serves as an MCP server (port 3400) with tools for:
- Procedure card management (`memory_get_procedure`, `memory_get_procedures`)
- Memory operations and role memory
- MCP tool protocol

---

## Drift Analysis

### M1 — Client Services vs Backend Capabilities

| Client Service | Likely Backend | Alignment |
|---|---|---|
| `ai-config.service.ts` | tackle-mcp (via MCP tools) | ❌ Unknown — may need dedicated config endpoints |
| `roles.service.ts` | tackle-mcp | ❌ Unknown — MCP has role memory but not role CRUD |
| `theme.service.ts` | Local storage / event bus | ✅ Client-side preference, no backend needed |

### M2 — Status Field Alignment

Tackle-ui likely reads status from MCP tools. The exact response shapes of `memory_get_procedure` and `memory_get_procedures` are defined by the MCP protocol and should match if the client uses the correct interface.

---

## Summary

| Priority | Area | Notes |
|---|---|---|
| **Low** | Client-server alignment | Tackle-ui is primarily MCP-based with client-side services; full drift analysis requires reading tackle-mcp tool definitions |
| **Low** | ai-config endpoints | AI configuration may be served by a separate service (gemini-srv or similar), not tackle-mcp |
| **None** | Theme/toast services | Client-side only — no backend dependency |
