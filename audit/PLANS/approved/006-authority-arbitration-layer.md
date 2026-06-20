# Approved Plan: Define Authority Arbitration Layer (AAL) Between Envelope and CEI

**Status:** `Proposed`
**Source:** Harvested from `CCNF Normalization vs Parsing.html`
**Harvest Ref:** `ccnf-normalization-vs-parsing-harvested.md` #2

## Architectural Intent
The system currently has multiple ontologies but no authority arbitration layer, causing the model to resolve ambiguity by picking the most coherent ontology (Nexus) instead of the most contextually scoped one. The AAL sits between Envelope → CEI and provides explicit context scoping at ingestion time, span-level provenance tags for origin domain, and priority-weighted CEI formation that respects domain priority: LOCAL_REPO overrides GLOBAL_KNOWLEDGE for structural decisions.

## Requirements & Acceptance Criteria
- [ ] CONTEXT_SCOPE must be introduced at INTAKE as a first-class token specifying workspace_root and authority_map with domain weights
- [ ] Span must include an origin_domain field: LOCAL_REPO | IMPORTED_ARCH | GLOBAL_KNOWLEDGE
- [ ] CEI formation must respect domain priority: LOCAL_REPO spans override GLOBAL_KNOWLEDGE spans for structural decisions
- [ ] 'Plan mode' must be redefined as a bounded operator operating only on LOCAL_REPO spans, current envelope set, and explicitly imported context roots
- [ ] Nexus (imported architecture) must become advisory, not controlling, in non-Nexus contexts

## Files Affected
- `nexus/python/cascade/` — Span/Envelope/CEI pipeline (AAL integration point)
- `nexus/python/cascade/schemas.py` — Envelope schema (add context_scope field)

## Dependencies
- Span/Envelope pipeline must be operational
- Span classifier must be stable before AAL integration

## Unresolved Follow-Ups
- Exact schema for authority_map — Dict[str, float] or more structured?
- How does AAL interact with the existing risk governance model?
- Should AAL be a separate layer or integrated into the existing Envelope schema?
