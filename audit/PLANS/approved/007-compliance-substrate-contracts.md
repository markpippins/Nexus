# Approved Plan: Formalize Compliance Substrate Contracts for Harness Invariant Enforcement

**Status:** `Proposed`
**Source:** Harvested from `CCNF Normalization vs Parsing.html`
**Harvest Ref:** `ccnf-normalization-vs-parsing-harvested.md` #3

## Architectural Intent
Harnesses exhibit a spectrum of instructional rigidity vs interpretive autonomy: 'conforming' harnesses treat repo-local rules as hard constraints, while 'nice car' harnesses lock onto strongest internalized schemas and treat local instructions as advisory overrides. Pipeline correctness is not just a data design problem but a compliance substrate problem — if enforcement is not structural, it becomes probabilistic. The 'loose pipes going away' transition must be formalized into a minimal invariant contract that even aggressive harnesses cannot collapse Span/Envelope separation without breaking observable invariants.

## Requirements & Acceptance Criteria
- [ ] Define a minimal invariant contract that all harnesses must satisfy to participate in the pipeline
- [ ] Invariants must be structural (enforced by Span → Envelope → CEI boundaries), not procedural (prompt-based)
- [ ] Contract must survive across harness personalities with different interpretive autonomy levels
- [ ] The contract must define what 'breaking the pipeline' means in terms of observable invariant violation

## Files Affected
- `nexus/python/cascade/` — Span/Envelope/CEI pipeline (invariant enforcement point)
- `nexus/docs/` — contract specification documentation

## Dependencies
- Span/Envelope pipeline must be operational
- AAL (Plan #006) would complement but is not strictly required

## Unresolved Follow-Ups
- What are the exact minimal invariants that Span/Envelope separation must preserve?
- How do we detect invariant violation at runtime?
- Should harness compliance be graded (conforming/tolerant/aggressive) or binary?
