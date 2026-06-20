# Approved Plan: Define NLP Projection Schema as Formal Eval Input Contract

**Status:** `Agreed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #3

## Architectural Intent
The NLP Projection Schema is the formal contract describing what NLP/LLM must emit for Eval to consume. It is the compiler-front-end output that defines the structure of transcript-extracted data before Eval processes it into segments, trajectories, and candidate objects. This directly answers open questions about artifact formats in the pipeline.

## Requirements & Acceptance Criteria
- [ ] NLP Projection Schema must define the formal output structure of transcript processing
- [ ] Eval must consume NLP Projections as its input — this is the contract boundary
- [ ] The schema must support all transcript types (ChatGPT, Copilot, others) uniformly
- [ ] Schema must include provenance tracking from source transcript segments

## Files Affected
- `nexus/python/rover/schemas.py` — NLP Projection schema definition
- `nexus/python/rover/` — extraction pipeline alignment

## Dependencies
- WorkRequest/Plan schemas (Plan #009, #010) provide the downstream structure

## Unresolved Follow-Ups
- Does NLP Projection Schema subsume or complement the existing rover extraction schemas?
- How does the projection schema handle multi-model outputs (different LLMs producing different projections)?
