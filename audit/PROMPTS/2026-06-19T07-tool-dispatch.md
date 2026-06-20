---
project: nexus
date: 2026-06-19
session: tool-dispatch
---

## Summary

User asked for the PEB Kernel to dispatch on `transaction.toolName` so that the 9 MCP tools registered by `peb-mcp` (validate vs record vs report-violation etc.) hit distinct admission paths at the Spring Boot REST facade, instead of all 9 unconditionally running `governanceEngine.process(tx)`.

## Full Prompt

> Make AdmissionControllerFacade dispatch on transaction.toolName so the 9 MCP tools map to distinct admission paths (validate vs record vs report-violation etc.)
