---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: bridge-shape normalization onto the enums

**Question / request:**

> Move the lowercase-to-uppercase violation_type and severity normalization
> off of `PebViolationEngine.ingest` and onto
> `ViolationType.fromMcpValue(String)` /
> `ViolationSeverity.fromMcpValue(String)` factories on the enums
> themselves, so the bridge shape is unit-testable on the enum.

**State at start:**

- `PebViolationEngine.ingest` had a 19-line inline block: trim, uppercase,
  optional `_VIOLATION$` strip, two `try { ViolationType.valueOf(...) } catch
  (IllegalArgumentException) { throw MalformedAdmissionRequestException(...) }`
  wrappers. The bridge shape was scattered between this method and the
  enum-value list.
- A repeated code-reviewer critique flagged the wrapping as: hard to test, easy
  to break with a regex tweak, and inconsistent with the rule that "translation
  logic should live on the enum itself."
- The PebApiClient MCP smoke still surfaced `Unexpected token` JSON errors at
  the *client* layer (a separate, known followup from a prior turn).

**Goal of this turn:**

Move the bridge contract onto `ViolationType` and `ViolationSeverity` as
static factory methods (`fromMcpValue`) that throw
`MalformedAdmissionRequestException` on null/blank/unknown. Update
`PebViolationEngine.ingest` to call those factories and shed the inline
try/catch wrappers.
