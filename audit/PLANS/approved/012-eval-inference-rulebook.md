# Approved Plan: Define Eval Inference Rulebook for NLP Projection Processing

**Status:** `Proposed`
**Source:** Harvested from `NLP Output from Chat Transcripts.html`
**Harvest Ref:** `nlp-output-harvested.md` #4

## Architectural Intent
The Eval Inference Rulebook defines how Eval transforms NLP projections over DocLang into segments, trajectories, and candidate objects. Key rules include: split segments when meaning diverges, discard segments that are noise, promote segments that carry structural or semantic weight, and segment boundaries are final only after Eval processes them (Eval must treat topics as segmentation hints, not final boundaries).

## Requirements & Acceptance Criteria
- [ ] Eval must treat topics as segmentation hints — not finalize segment boundaries
- [ ] Eval must split segments when meaning diverges between adjacent content
- [ ] Eval must discard segments that are noise
- [ ] Eval must promote segments that carry structural or semantic weight
- [ ] Segment boundaries are tentative until Eval finalizes them

## Files Affected
- `nexus/python/rover/` — Eval processing stage
- `nexus/python/cascade/` — potential overlap with span segmenter

## Dependencies
- NLP Projection Schema (Plan #011) defines Eval's input format
- Span Classifier Baseline (Plan #005) provides diagnostic context

## Unresolved Follow-Ups
- How does Eval differ from the existing span segmenter?
- Should Eval replace or augment the current cascade span classifier?
