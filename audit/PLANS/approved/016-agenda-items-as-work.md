# Approved Plan: Recognize Agenda Items as First-Class Work Units

**Status:** `Agreed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #8

## Architectural Intent
The system is already producing actionable structure from transcript processing — Agenda items are work, and the system is already producing a semantic backlog. This recognition elevates the extraction pipeline from 'analysis' to 'production' — the pipeline output IS the work queue.

## Requirements & Acceptance Criteria
- [ ] Agenda items must be actionable as work units
- [ ] The semantic backlog must be a first-class artifact that the pipeline produces
- [ ] Provenance must track which transcripts produced which agenda items

## Files Affected
- `nexus/python/rover/schemas.py` — SemanticBacklog type
- `nexus/python/rover/` — pipeline output alignment

## Dependencies
- Agenda Schema (Plan #013) defines the item format
- Plurality (Plan #014) resolves items into plans

## Unresolved Follow-Ups
- How does a SemanticBacklog integrate with Nebula (the intent marketplace)?
- Should the backlog feed directly into conduit-mcp as work requests?
