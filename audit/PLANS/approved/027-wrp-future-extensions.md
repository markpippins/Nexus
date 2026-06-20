# Proposed Plan: WRP Future Extensions — DAG, Multi-Tenant, Probabilistic

**Status:** `Proposed`
**Source:** Harvested from `Semantic IR v0.1 Overview.html`
**Harvest Ref:** `semantic-ir-wrp-harvested.md` candidate #3

## Architectural Intent
Three expansions beyond WRP v1.0: (A) Multi-tenant WRP — many kernels sharing event space with tenant isolation, (B) Hierarchical WRP — WorkRequest DAGs as nested runtimes with recursive kernel invocation, (C) Probabilistic WRP — non-deterministic policy execution with sampling. The most natural next step is WRP DAG extension (WorkRequestDAG + nested execution + recursive kernel invocation), transforming from flat pipeline to recursive cognitive system.

## Requirements & Acceptance Criteria
- [ ] WRP DAG: WorkRequest decomposition into sub-workflows, each with own WRP lifecycle
- [ ] Multi-tenant: Shared event space with kernel isolation per tenant
- [ ] Probabilistic: Non-deterministic policy execution with sampling support
- [ ] All extensions must preserve core WRP invariants: determinism, append-only, freeze boundary

## Files Affected
- TBD — depends on WRP v1.0 final structure

## Dependencies
- WRP v1.0 (Plan #025) must be running first
- WRP Migration (Plan #026) must be complete

## Unresolved Follow-Ups
- Should WRP DAG be planned now or deferred until WRP v1.0 is running?
- Does the current event schema support tenant_id?
