---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: harden createdAt default via entity-level @PrePersist

**Question / request:**

> Move `PebTransaction.createdAt` default-fill out of
> `PebGovernanceEngine.processForPath` into a `@PrePersist` callback on the
> entity, so future INSERT paths that bypass the engine don't hit the same
> NOT NULL violation.

**State at start:**

- `PebGovernanceEngine.processForPath` had a 4-line inline block:
  `if (request.getCreatedAt() == null) request.setCreatedAt(Instant.now());`.
  It covered the current dispatch path, but it was scoped to one method — any
  future repository call site that bypassed the engine would hit `NOT NULL`
  on `peb_transactions.created_at`.
- A repeated code-reviewer critique flagged this as fragile, with two
  recommended hardening paths (both noted but not yet acted on):
  1. A `@PrePersist` callback on `PebTransaction` itself.
  2. Hibernate's `@CreationTimestamp` annotation (which overwrites caller
     timestamps — different semantics, not a drop-in).

**Goal of this turn:**

Move the default onto the entity as a JPA lifecycle callback that fires
before every INSERT, regardless of which service/repository call site drives
the write.
