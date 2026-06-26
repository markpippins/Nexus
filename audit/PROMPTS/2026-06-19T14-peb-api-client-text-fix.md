---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: fix PebApiClient response parsing

**Question / request:**

> Fix `PebApiClient.submitTransaction` to use `response.text()` on the happy
> path — currently `response.json()` parses plain-text kernel responses and
> yields spurious `{error:true,admission_result:"error",...}` even when the
> kernel succeeds.

**State at start:**

- `PebApiClient.submitTransaction` (TypeScript, in
  `typescript/peb-mcp/src/api/apiClient.ts`) sent `Accept: application/json`
  and called `response.json()` on the kernel's `ResponseEntity<String>` body
  ('Mutation processed', 'Violation recorded as REJECTED'). The JSON parser
  threw on every text response, which the existing try/catch in
  `submitTransaction` swallowed as a `{error: true, admission_result: "error",
  message: "Unexpected token 'M'..."}` object — every successful MCP tool
  call surfaced as a fake error to the agent.
- The buggy behavior had been confirming itself at every MCP smoke run
  since the bridge work first went end-to-end three turns ago: kernel rows
  landed in `peb_transactions` and `peb_violations` even while the TS facet
  reported failures.

**Goal of this turn:**

Read the success body as text, drop the JSON expectation, update the
`Accept` header so the server's content-type negotiation matches the
client's parser, and trim trailing whitespace so downstream MCP tool
handlers see clean strings.
