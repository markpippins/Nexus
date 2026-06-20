---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: narrow 422 mapping to a typed exception

**Question / request:**

> Add a typed `MalformedAdmissionRequestException` so the `@ExceptionHandler`
> doesn't accidentally swallow programmer-bug `IllegalArgumentException` from
> future code paths as 422.

**State at start:**

- A prior code-reviewer critique flagged that catching the broad `IllegalArgumentException`
  parent would silently translate any future IAE throw into HTTP 422, hiding
  genuine kernel/db/programmer failures.
- The current `AdmissionControllerFacade` had one
  `@ExceptionHandler(IllegalArgumentException.class)` that caught every IAE
  from anywhere in the controller's stack.
- The `PebViolationEngine.ingest` was the only legitimate IAE source today —
  it raises IAE for missing fields, unknown enum values, etc.

**Goal of this turn:**

Introduce a typed `MalformedAdmissionRequestException`, have
`PebViolationEngine` raise it instead of bare `IllegalArgumentException`, and
narrow the controller's `@ExceptionHandler` to that specific type so any
unrelated IAE — including future programmer bugs — bubbles up to 500.
