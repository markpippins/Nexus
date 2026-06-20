---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: violations should be first class

**Session:** peb-kernel-execution-evening

**Question / request:**

> Is the prior code-reviewer critique resolved (denial-path audit trail; HTTP 200 vs 422
> for denial; REPORT_VIOLATION missing first-class `peb_violations` row) — and
> violations should be first class.

**State at start:**

- Smoke test 3 hours earlier had confirmed the kernel end-to-end against Postgres +
  Flyway. Denial-path audit-trail fix had been applied. The remaining open
  critique was: `peb_report_violation` only wrote to `peb_transactions`, despite
  `PebViolation` existing as a domain entity.

**Goal of this turn:**

Implement first-class violation ingestion so that any successful
`peb_report_violation` writes a row in `peb_violations` structured by
`violation_type` / `severity`, and so that malformed reports come back as
HTTP 422 instead of HTTP 500.
