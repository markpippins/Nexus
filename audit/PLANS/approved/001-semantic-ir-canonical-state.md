# Approved Plan: Define Semantic IR as the Canonical Semantic State

**Status:** `Agreed`
**Source:** Harvested from `Reviewing LOSM Risk Management System.html`
**Harvest Ref:** `losm-risk-management-harvested.md` #2

## Architectural Intent
Establish Semantic IR (SemanticConcept, ResolveEdge, Trajectory, ProvenanceBundle, SemanticMutation) as the unified, lossless, replay-independent semantic state surface that replaces the three overlapping representations (replay kernel world, graph mutation world, semantic IR world) with a single canonical representation. SemanticProjection is the filtered view of Semantic IR for a specific purpose.

## Requirements & Acceptance Criteria
- [ ] Semantic IR must be deterministic and replayable even if envelopes or kernel change
- [ ] Semantic IR must unify all models (LLM, DSL interpreter, planner, reducer) under one semantic worldview
- [ ] SemanticProjection must be the 'view' of Semantic IR that WorkingSet consumes
- [ ] Every concept and edge must have provenance for full attribution
- [ ] Risk Blockers and Ambiguity Signatures must operate on Semantic IR, not raw text
- [ ] Semantic IR → WorkflowIntent → ExecutionRequest must be the syscall boundary

## Files Affected
- `nexus/python/nbk/` — Semantic IR schema definitions
- `nexus/python/cascade/` — potential integration point for IR consumption

## Dependencies
- NBK kernel must be stable (frozen before IR work begins)
- SemanticProjection and SemanticProjectionBuilder depend on IR definition

## Unresolved Follow-Ups
- Need to define formal Semantic IR Schema, SemanticProjection Schema, Graph Mutation Vocabulary, and WorkflowIntent ABI
- Should the conceptual structure be exactly: concepts + resolve_edges + trajectories + provenance + optional mutations?
