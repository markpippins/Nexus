# Approved Plan: Redesign Span Event Detection as State-Transition Inference

**Status:** `Proposed` (diagnosis is `Agreed`)
**Source:** Harvested from `CCNF Normalization vs Parsing.html`
**Harvest Ref:** `ccnf-normalization-vs-parsing-harvested.md` #4

## Architectural Intent
Current EVENT_CANDIDATE detection is based on narrow imperative verb matching (create, update, build, deploy, validate) which guarantees massive undercounting. The classifier is structurally broken — it is a binary decision system disguised as a multi-class system (IF strong event keyword → EVENT, ELSE → DISCOURSE). The ontology is lexically anchored, not semantically grounded. Event detection must be redesigned as a state-transition inference problem over spans, not a keyword classifier.

## Requirements & Acceptance Criteria
- [ ] Replace EVENT_CANDIDATE keyword rule with state-transition inference detecting: state changes, system transitions, causal relationships, assertions of condition change, actions taken or observed
- [ ] Add EVENT_IMPLICIT span class for implicit events currently forced into DISCOURSE (declarative events, implicit events, conversational eventing/meta-events)
- [ ] Eliminate the 'default-to-DISCOURSE' fallback behavior — everything uncertain must not silently become DISCOURSE
- [ ] Improve span granularity to enable intra-paragraph type separation (currently 0.8 spans/paragraph)

## Files Affected
- `nexus/python/cascade/` — span classifier / segmenter
- `nexus/python/cascade/schemas.py` — Span type definitions (add EVENT_IMPLICIT)

## Dependencies
- Span Classifier Baseline (Plan #005) provides the diagnostic baseline to measure against
- Implementation approach (rule-based vs model-assisted) is still open

## Unresolved Follow-Ups
- Should state-transition inference be rule-based (extended keyword set + patterns) or model-assisted?
- How does EVENT_IMPLICIT relate to the existing EVENT_CANDIDATE in the span type hierarchy?
- What is the exact algorithm for detecting state transitions across adjacent spans?
