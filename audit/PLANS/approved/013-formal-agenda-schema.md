# Approved Plan: Define Formal Agenda Schema with Conceptual Maps

**Status:** `Proposed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #5

## Architectural Intent
An Agenda schema that captures not just items but the conceptual map connecting them, unresolved intent, ontology issues, and constraint issues. The Agenda is the intermediate structure between raw transcript content and formal plans — it's what Plurality deliberates on.

## Requirements & Acceptance Criteria
- [ ] Agenda must include: items (AgendaItem[]), conceptual_map, unresolved_intent[], unresolved_ontology[], unresolved_constraints[]
- [ ] ConceptualMap must capture relationships between agenda items and their ontology grounding
- [ ] Unresolved intent, ontology, and constraint issues must be tracked as open items on the agenda

## Files Affected
- `nexus/python/rover/schemas.py` — Agenda type definitions
- `nexus/python/rover/` — pipeline stage alignment

## Dependencies
- NLP Projection Schema (Plan #011) feeds into Agenda formation
- Eval Inference Rulebook (Plan #012) produces the input for Agenda

## Unresolved Follow-Ups
- Does Agenda exist as a persistent artifact or a transient processing stage?
- How does Agenda relate to the existing SpecificationAgenda schema in rover?
