---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: collapse partial-state risk into one @Transactional

**Question / request:**

> Combine the audit-row commit and the violation ingest into one @Transactional
> so a DB failure during ingest rolls back the audit row too — closes the
> partial-state concern the reviewer flagged.

**State at start:**

- `PebGovernanceEngine.processForPath` orchestrated three separate
  `@Transactional` boundaries: `PebTransactionEngine.beginTransaction`,
  `PebTransactionEngine.commitTransaction`, and `PebViolationEngine.ingest`.
- A code reviewer in a previous turn flagged the partial-state risk: a DB
  failure or domain-validation error inside `PebViolationEngine.ingest` left
  a committed `peb_transactions` row with no matching `peb_violations` row.
- The malformed `peb_report_violation` smoke path actually demonstrated this:
  it produced 1 audit-only row in `peb_transactions` with no violation row.

**Goal of this turn:**

Collapse the three boundaries into one outer transaction so audit-row commit +
violation-row ingest are atomic. A RuntimeException rolling back propagates
across both writes. Confirm with the running kernel + the MCP smoke.
