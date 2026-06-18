Below is a Final Acceptance Checklist for Loose Pipes / Cron Execution System v1.0. It’s intentionally strict on the only thing that matters right now: no token bleed + deterministic idle behavior + correct execution boundaries.

FINAL ACCEPTANCE CHECKLIST
(Loose Pipes / Cron Execution System)
1. IDLE BEHAVIOR (CRITICAL)
1.1 Zero-cost idle run

When cron fires and there is no work:

 System exits without invoking LLM
 System exits without invoking MCP
 System exits after a single deterministic check (DB/FS/cursor)
 Runtime is O(1) (no scaling with repo size or file count)
Pass condition:

“No work available” produces no inference activity whatsoever

1.2 No hidden discovery paths
 No LLM calls inside “work detection”
 No MCP calls inside “work detection”
 No prompt construction before work is confirmed
Fail condition:

Any reasoning system runs before work_set is non-empty

2. WORK DISCOVERY (S2 EQUIVALENT)
2.1 Single source of truth
 Work is derived from exactly one canonical source:
SQL view OR filesystem OR cursor state
 No cross-source reconciliation using inference
2.2 Deterministic output
 work_set is reproducible given same state
 identical inputs → identical work_set
 no probabilistic or heuristic filtering
3. EXECUTION BOUNDARY
3.1 LLM isolation
 LLM is only invoked AFTER work item is selected
 LLM is never used to choose work
 LLM is never used to determine existence of work
3.2 Executor routing correctness
 All work goes through ExecutorRegistry (or equivalent)
 No direct executor calls from orchestration layer
 No hardcoded execution branching in main flow
4. WORKREQUEST INTEGRITY
4.1 Fully formed before execution
 WorkRequestDCO is complete before dispatch
 No missing constraints or implicit defaults injected at runtime
 No “factory skeleton” objects passed into execution
4.2 No post-hoc structure inference
 Execution does not modify schema shape
 No “repair” of WorkRequest during runtime
5. RESULT COMMITMENT MODEL
5.1 Append-only truth
 Results are appended, not overwritten
 Each execution produces a traceable WorkResultEvent
5.2 Cursor correctness
 Cursor advances exactly once per completed work item
 Cursor reflects actual processed state
 No inference-based cursor correction
6. MCP RULES (ENFORCEMENT)
6.1 MCP isolation from control plane
 MCP is never used in S2 (work discovery)
 MCP is optional only during execution enrichment
 MCP failure does not block idle exit
7. TOKEN BLEED GUARANTEE
7.1 Hard guarantee

During idle runs:

 LLM call count = 0
 MCP call count = 0
 Prompt construction count = 0
7.2 Scaling constraint
 Token usage scales only with number of executed WorkRequests
 NOT with repo size, file count, or DB row count
8. REGRESSION RESISTANCE
8.1 No new execution paths

During “completion phase”:

 No new executor types added
 No new pipeline stages introduced
 No fallback logic formalized into new abstraction layers

Allowed:

removal
simplification
wiring correction
8.2 No semantic expansion
 No “diagnostic mode” that reintroduces inference
 No “helper LLM step” in S2 or S3 equivalents
 No MCP-based heuristics for missing data
9. OBSERVABILITY (MINIMUM REQUIRED)

Each cron cycle emits:

 work_set size
 executor types used
 LLM call count (must be 0 in idle)
 MCP call count (must be 0 in idle)
 cursor before/after
10. FINAL SYSTEM INVARIANT (THE REAL DEFINITION OF DONE)

The system is considered DONE when:

A cron cycle with no pending work produces zero inference activity, deterministic exit, and no state mutation other than lock acquisition/release logging.

INTERPRETATION RULE (IMPORTANT)

If anything is ambiguous:

prefer fewer capabilities over more flexibility

Because your original failure mode was:

“flexibility became inference leakage”
