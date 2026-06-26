---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: run the real peb-mcp client end-to-end

**Question / request:**

> Run the real peb-mcp client against the kernel — use PebApiClient.submitTransaction
> for peb_report_violation (and one other MUTATE path) so we verify the full
> MCP facade -> Spring stack end-to-end, not just hand-rolled JSON.

**State at start:**

- Hand-rolled `curl` smoke tests had already proven cur-path HTTP/JSON works for
  valid + malformed payloads and that first-class violation rows write through
- `peb-mcp/src/api/apiClient.ts` already wraps every MCP tool call in
  `submitTransaction(entityId, toolName, input)` against
  `process.env.PEB_KERNEL_URL/transaction` (default `http://localhost:8080/api/v1/peb`)
- No previous attempt had used *the actual* TypeScript code path — all prior
  smoke tests used `curl` with JSON shaped by hand
- Open code-reviewer followups: createdAt defaulting at the engine layer,
  enum-translation regex inside the ingest path

**Goal of this turn:**

Drive `PebApiClient.submitTransaction` end-to-end from the TS facade against
the live Spring Boot kernel + Postgres, and surface any breakage between
the MCP facade's call shape and the kernel's expected input shape.
