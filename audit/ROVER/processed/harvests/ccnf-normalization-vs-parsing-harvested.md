# Harvested Specification & Code Repository

**Source:** `/home/codex/dev/chats/CCNF Normalization vs Parsing.html`

**Chunks processed:** 10  **Failed:** 0

**Total candidates:** 5

---




## 1. Span Classifier Baseline Measurement — 61-Transcript Census
**Status:** `Agreed`

### Architectural Intent
Empirical measurement of the span segmenter across all 61 ChatGPT transcripts in the repository (1,372 messages, 1,372 spans). Establishes the baseline distribution that reveals structural problems in the span classifier: DISCOURSE dominance at 67.2%, EVENT_CANDIDATE at only 7.6%, and 92.4% of messages containing zero event spans. This is an anchored fact about system state, not a proposal.

### Requirements & Acceptance Criteria
- [ ] Distribution must be reproducible on the same corpus
- [ ] Findings must be preserved as a diagnostic baseline against which future classifier improvements are measured
- [ ] The D/E ratio of 8.9 must serve as a metric to track classifier improvement

### Unresolved Follow-Ups
- Does the baseline need recalibration after any classifier changes?
- Should the classifier be re-run against the full corpus after each ontology change?

---

## 1. Define Authority Arbitration Layer (AAL) Between Envelope and CEI
**Status:** `Proposed`

### Architectural Intent
The system currently has multiple ontologies but no authority arbitration layer, causing the model to resolve ambiguity by picking the most coherent ontology (Nexus) instead of the most contextually scoped one. The AAL sits between Envelope → CEI and provides explicit context scoping at ingestion time, span-level provenance tags for origin domain, and priority-weighted CEI formation that respects domain priority: LOCAL_REPO overrides GLOBAL_KNOWLEDGE for structural decisions.

### Requirements & Acceptance Criteria
- [ ] CONTEXT_SCOPE must be introduced at INTAKE as a first-class token specifying workspace_root and authority_map with domain weights
- [ ] Span must include an origin_domain field: LOCAL_REPO | IMPORTED_ARCH | GLOBAL_KNOWLEDGE
- [ ] CEI formation must respect domain priority: LOCAL_REPO spans override GLOBAL_KNOWLEDGE spans for structural decisions
- [ ] 'Plan mode' must be redefined as a bounded operator operating only on LOCAL_REPO spans, current envelope set, and explicitly imported context roots
- [ ] Nexus (imported architecture) must become advisory, not controlling, in non-Nexus contexts

### Unresolved Follow-Ups
- Exact schema for authority_map — Dict[str, float] or more structured?
- How does AAL interact with the existing risk governance model?
- Should AAL be a separate layer or integrated into the existing Envelope schema?

---



## 1. Formalize Compliance Substrate Contracts for Harness Invariant Enforcement
**Status:** `Proposed`

### Architectural Intent
Harnesses exhibit a spectrum of instructional rigidity vs interpretive autonomy: 'conforming' harnesses treat repo-local rules as hard constraints, while 'nice car' harnesses lock onto strongest internalized schemas and treat local instructions as advisory overrides. Pipeline correctness is not just a data design problem but a compliance substrate problem — if enforcement is not structural, it becomes probabilistic. The 'loose pipes going away' transition must be formalized into a minimal invariant contract that even aggressive harnesses cannot collapse Span/Envelope separation without breaking observable invariants.

### Requirements & Acceptance Criteria
- [ ] Define a minimal invariant contract that all harnesses must satisfy to participate in the pipeline
- [ ] Invariants must be structural (enforced by Span → Envelope → CEI boundaries), not procedural (prompt-based)
- [ ] Contract must survive across harness personalities with different interpretive autonomy levels
- [ ] The contract must define what 'breaking the pipeline' means in terms of observable invariant violation

### Unresolved Follow-Ups
- What are the exact minimal invariants that Span/Envelope separation must preserve?
- How do we detect invariant violation at runtime?
- Should harness compliance be graded (conforming/tolerant/aggressive) or binary?

---

## 1. Redesign Span Event Detection as State-Transition Inference
**Status:** `Proposed`

### Architectural Intent
Current EVENT_CANDIDATE detection is based on narrow imperative verb matching (create, update, build, deploy, validate) which guarantees massive undercounting. The classifier is structurally broken — it is a binary decision system disguised as a multi-class system (IF strong event keyword → EVENT, ELSE → DISCOURSE). The ontology is lexically anchored, not semantically grounded. Event detection must be redesigned as a state-transition inference problem over spans, not a keyword classifier.

### Requirements & Acceptance Criteria
- [ ] Replace EVENT_CANDIDATE keyword rule with state-transition inference detecting: state changes, system transitions, causal relationships, assertions of condition change, actions taken or observed
- [ ] Add EVENT_IMPLICIT span class for implicit events currently forced into DISCOURSE (declarative events, implicit events, conversational eventing/meta-events)
- [ ] Eliminate the 'default-to-DISCOURSE' fallback behavior — everything uncertain must not silently become DISCOURSE
- [ ] Improve span granularity to enable intra-paragraph type separation (currently 0.8 spans/paragraph)

### Unresolved Follow-Ups
- Should state-transition inference be rule-based (extended keyword set + patterns) or model-assisted?
- How does EVENT_IMPLICIT relate to the existing EVENT_CANDIDATE in the span type hierarchy?
- What is the exact algorithm for detecting state transitions across adjacent spans?

---
