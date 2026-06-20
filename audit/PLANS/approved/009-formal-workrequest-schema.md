# Approved Plan: Define Formal WorkRequest and WorkItem Schemas

**Status:** `Agreed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #1

## Architectural Intent
Formal schema definitions for WorkRequest and WorkItem types that define the structure of all work flowing through the pipeline. WorkRequest contains title, summary, work_items, dependencies, constraints, and acceptance_criteria. WorkItem captures individual units of work within a request.

## Requirements & Acceptance Criteria
- [ ] WorkRequest must have: title, summary, work_items[], dependencies[], constraints[], acceptance_criteria[]
- [ ] WorkItem must define individual units of work with clear scope and completion criteria
- [ ] Dependencies must be modeled as typed edges between work items
- [ ] Constraints must capture implementation constraints on work items

## Files Affected
- `nexus/python/conduit/` — WorkRequest type (alignment)
- `nexus/python/rover/schemas.py` — extraction schema alignment

## Dependencies
- Existing conduit-mcp WorkRequest type must be reviewed first

## Unresolved Follow-Ups
- How do work_items relate to the existing WorkRequest type in conduit-mcp?
- Should WorkRequest accept a DAG of work_items or a flat list?
