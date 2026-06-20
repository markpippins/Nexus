# 010 — Session Review & State Audit

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Part of the Layer 3 primitive set; parent: `003-progressive-epistemic-instrumentation.md`.

## Architectural Intent

Session Review provides **reconstructible history** of agentic execution. Unlike logs (which are point-in-time), session review captures the full state of a work session — intent, execution decisions, environment, and outcomes — so that any past session can be understood, audited, and learned from.

## Requirements & Acceptance Criteria

- [ ] Every session produces a review artifact containing: session metadata, WorkRequests processed, receipts generated, circuit breaker events, token costs, and timeline
- [ ] Review artifact is immutable once session closes
- [ ] Review can be rendered as human-readable Markdown and machine-readable JSON
- [ ] Sessions are queryable by: date range, agent, plan, status, cost
- [ ] Review includes all state transitions (not just final state)
- [ ] Failed sessions produce reviews with diagnostic context (not just "session failed")

## Session Review Schema

```
SessionReview {
  session_id: str
  agent_id: str
  started_at: timestamp
  ended_at: timestamp
  status: COMPLETED | FAILED | KILLED | TIMED_OUT
  work_requests: [{id, status, receipt_ref}]
  circuit_breaker_events: [{breaker_id, state_change, timestamp}]
  token_usage: {input, output, total, cost}
  timeline: [{timestamp, event_type, detail}]
  summary: str               // human-readable narrative
}
```

## Implementation Notes

- Session review aggregates data from all three layers
- Reviews are the primary artifact for human oversight of agentic work
- Token tracking within reviews exposes real cost — no more invisible spending
- Reviews feed into the Scaffold UI's session history view
- conduit-mcp's existing `sessions` table and `/sessions` endpoints are a partial implementation

## Unresolved Follow-Ups

- How long should session reviews be retained?
- Should reviews support diffing (compare two sessions)?
- Can reviews be used to train better intent compilation?
