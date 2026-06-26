# Approved Plan: Define Formal Plan Schema with Decisions, Commitments, and Ontology

**Status:** `Agreed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #2

## Architectural Intent
A formal Plan schema that captures not just work items but the decisions made, commitments entered, constraints applied, and ontology references. This elevates a plan from a task list to a complete decision record.

## Requirements & Acceptance Criteria
- [ ] Plan must include: title, summary, decisions[], commitments[], constraints[], ontology reference
- [ ] Decisions must record what was decided and by which reasoning path
- [ ] Commitments must capture what the system commits to doing
- [ ] PlanConstraint must capture scope, resource, and temporal bounds
- [ ] PlanOntology must reference the ontology nodes this plan operates within

## Files Affected
- `nexus/python/rover/schemas.py` — Plan type definitions
- `nexus/audit/PLANS/` — plan file format alignment

## Dependencies
- WorkRequest/WorkItem schemas (Plan #009) should be defined first

## Unresolved Follow-Ups
- How does Plan relate to the conduit-mcp plan model?
- Should Plan be implemented as an extension of conduit-mcp's plan or a separate type?
