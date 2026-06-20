# Approved Plan: Generate Implementation Plan for Structural Risk Governance (Plan #003)

**Status:** `Proposed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #7

## Architectural Intent
A concrete implementation plan JSON for structural risk governance, directly implementing Plan #003 (Structural Risk Management as Governance Substrate). Includes impl_plan_id, created_at, author_model_id, plan_id references, requirements, and files affected. Shows the system beginning to self-generate implementation plans from its own architecture.

## Requirements & Acceptance Criteria
- [ ] Implementation plan must reference its parent architecture plan (plan-structural-risk-governance)
- [ ] Must include explicit file paths affected
- [ ] Must include concrete requirements traceable to the architecture plan
- [ ] Risk Blocker Schema must be a typed artifact that routes itself through the governance graph

## Files Affected
- `nexus/python/rover/` — implementation plan generation
- `nexus/audit/PLANS/approved/003-structural-risk-management.md` — parent plan

## Dependencies
- Plan #003 (Structural Risk Management) defines the architecture being implemented
- Eval, NLP Projection, and Plurality must be operational to generate full plans

## Unresolved Follow-Ups
- Should self-generated implementation plans be stored alongside human-authored ones?
- What is the review process for self-generated plans?
