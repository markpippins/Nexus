# Approved Plan: WRP v1.0 — Formal Protocol Specification

**Status:** `Agreed`
**Source:** Harvested from `Semantic IR v0.1 Overview.html`
**Harvest Ref:** `semantic-ir-wrp-harvested.md` candidate #1

## Architectural Intent
WRP (WorkRequest Protocol) is a versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes. It has 4 canonical artifacts: (1) WorkRequest Schema — versioned JSON schema for the canonical IR contract, (2) WRP Event Schema — base event contract with causation_id/correlation_id + lifecycle events (WRP_INGESTED, WRP_PLANNED, WRP_EXECUTED, WRP_VALIDATED, WRP_CONVERGED), (3) WRP State Machine — 11 states with formal adjacency matrix, (4) WRP API — OpenAPI for Spring↔Python bridge.

## Requirements & Acceptance Criteria
- [ ] WRP must be a typed event-sourced protocol — not an architecture document
- [ ] WorkRequest Schema must have versioned JSON schema with $id
- [ ] WRP Event Schema must have base contract (event_id, wrp_id, type, timestamp, version, causation_id, correlation_id, payload) plus concrete event types
- [ ] WRP State Machine must be single source of truth with 11 states (CREATED→INTAKE→PLANNING→CRITIQUE→SPECIFICATION→EXECUTION→VALIDATION→COMPLETED/FAILED/BLOCKED/CONVERGED) and formal adjacency matrix
- [ ] WRP API must define 4 endpoints: create WorkRequest, emit event, get state, replay
- [ ] 3-level versioning: Protocol version, Event version (additive only), WorkRequest version
- [ ] Cross-system consistency: Spring emits events, Python kernel executes, DB stores, Nexus visualizes

## Files Affected
- `nexus/python/vision/losm-ir/` — WRP state machine integration
- `nexus/python/` — WRP runtime layer (new)

## Dependencies
- MEEP bootstrap (Plan #021) provides the implementation skeleton
- WRP Migration Plan (Plan #026) defines rollout order

## Unresolved Follow-Ups
- Should WRP state machine live in losm-ir or a new losm-wrp package?
- What is the exact causation_id computation rule?
