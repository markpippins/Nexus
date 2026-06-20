# 008 — Receipts as Proof-of-Execution

**Status:** `Agreed`
**Source:** Model Role Assignment (ChatGPT transcript). Part of the Layer 3 primitive set; parent: `003-progressive-epistemic-instrumentation.md`.

## Architectural Intent

Receipts provide **proof of completion** that is stronger than an agent's claim of completion. An agent saying "done" is not evidence. A receipt, with embedded verification artifacts, is. Receipts bind the execution output to the WorkRequest, creating an auditable link between intent and outcome.

## Requirements & Acceptance Criteria

- [ ] Every completed WorkRequest produces exactly one receipt
- [ ] Receipts are immutable and cryptographically verifiable (content hash)
- [ ] Receipt contains: WorkRequest reference, execution trace, output artifact hash, verification status
- [ ] Receipts can be validated independently — no need to re-execute
- [ ] Failed executions produce receipts with failure reason (not "no receipt")
- [ ] Receipts are queryable by WorkRequest ID, agent, time range, and status

## Receipt Schema

```
Receipt {
  receipt_id: str
  work_request_id: str
  agent_id: str
  started_at: timestamp
  completed_at: timestamp
  status: COMPLETED | FAILED | TIMED_OUT | KILLED
  output_artifact_hash: str?
  execution_trace: str
  verification_status: VERIFIED | UNVERIFIED | DISPUTED
  content_hash: str          // hash of all above fields
}
```

## Implementation Notes

- Receipts live in the Observability/Safety Layer (Layer 3)
- Receipt generation is mandatory — the Execution Layer cannot skip it
- Content hash enables tamper detection
- Receipts feed into the session review and audit trail
- Receipts are distinct from conduit-mcp's current ticket/receipt system — this spec extends that concept with stronger verification

## Unresolved Follow-Ups

- What hashing algorithm for content_hash?
- Should receipts be stored in a separate database or alongside WorkRequests?
- How do receipts interact with POE (Proof of Execution) in the Intent Layer?
