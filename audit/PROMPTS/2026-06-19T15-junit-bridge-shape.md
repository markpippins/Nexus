---
project: nexus
session: peb-kernel-execution-evening
---

# Prompt: junit test class locking the bridge shape

**Question / request:**

> Add a small junit class on pebble-domain that locks the bridge shape:
> assertEquals for the canonical MCP canonical-typos rcl_violation,
> authority_leakage, hard, soft, plus assertThrows on null / blank / unknown.
> This converts the cross-codebase bug we just fixed into a runnable contract.

**State at start:**

- `ViolationType.fromMcpValue(String)` and
  `ViolationSeverity.fromMcpValue(String)` had been moved onto the enums so
  the MCP-facade bridge logic lives next to the values and doesn't need the
  kernel to spin up to test.
- `peb-domain` did not yet have any test sources; its `pom.xml` had no
  test-scoped dependency, so `mvn test` would have empty test scope.
- The bug class this guards against: prior to the bridge refactor,
  PebApiClient caused every successful MCP-submitted violation to land as
  422 because `ViolationType.valueOf("authority_leakage")` is case-sensitive
  — the lowercase canonical MCP-typos were rejected at kernel admission.

**Goal of this turn:**

Add a JUnit Jupiter test class on pebble-domain that asserts the canonical
MCP canonical-typos map onto the Java enum values, plus the rejection paths
for null, blank, and unknown inputs. Wire up the test infrastructure
(spring-boot-starter-test scope=test) so `mvn -pl peb-domain test` runs
cleanly.
