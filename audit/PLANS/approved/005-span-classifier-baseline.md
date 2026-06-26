# Approved Plan: Span Classifier Baseline Measurement — 61-Transcript Census

**Status:** `Agreed`
**Source:** Harvested from `CCNF Normalization vs Parsing.html`
**Harvest Ref:** `ccnf-normalization-vs-parsing-harvested.md` #1

## Architectural Intent
Empirical measurement of the span segmenter across all 61 ChatGPT transcripts in the repository (1,372 messages, 1,372 spans). Establishes the baseline distribution that reveals structural problems in the span classifier: DISCOURSE dominance at 67.2%, EVENT_CANDIDATE at only 7.6%, and 92.4% of messages containing zero event spans. This is an anchored fact about system state to serve as a diagnostic baseline.

## Requirements & Acceptance Criteria
- [ ] Distribution must be reproducible on the same corpus
- [ ] Findings must be preserved as a diagnostic baseline against which future classifier improvements are measured
- [ ] The D/E ratio of 8.9 must serve as a metric to track classifier improvement

## Files Affected
- `nexus/python/cascade/` — span segmenter / classifier location (diagnostic record)
- `nexus/audit/` — baseline measurement preservation

## Dependencies
- None (this is a measurement record, not an implementation)

## Unresolved Follow-Ups
- Does the baseline need recalibration after any classifier changes?
- Should the classifier be re-run against the full corpus after each ontology change?
