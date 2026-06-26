# Harvested Specification & Code Repository

**Source:** `/home/codex/dev/chats/NLP Output from Chat Transcripts.html`

**Chunks processed:** 28  **Failed:** 0

**Total candidates:** 8 (deduplicated from 15)

---

## 1. Define Formal WorkRequest and WorkItem Schemas
**Status:** `Agreed`

### Architectural Intent
Formal schema definitions for WorkRequest and WorkItem types that define the structure of all work flowing through the pipeline. WorkRequest contains title, summary, work_items, dependencies, constraints, and acceptance_criteria. WorkItem captures individual units of work within a request.

### Requirements & Acceptance Criteria
- [ ] WorkRequest must have: title, summary, work_items[], dependencies[], constraints[], acceptance_criteria[]
- [ ] WorkItem must define individual units of work with clear scope and completion criteria
- [ ] Dependencies must be modeled as typed edges between work items
- [ ] Constraints must capture implementation constraints on work items

### Unresolved Follow-Ups
- How do work_items relate to the existing WorkRequest type in conduit-mcp?
- Should WorkRequest accept a DAG of work_items or a flat list?

---

## 2. Define Formal Plan Schema with Decisions, Commitments, and Ontology
**Status:** `Agreed`

### Architectural Intent
A formal Plan schema that captures not just work items but the decisions made, commitments entered, constraints applied, and ontology references. This elevates a plan from a task list to a complete decision record.

### Requirements & Acceptance Criteria
- [ ] Plan must include: title, summary, decisions[], commitments[], constraints[], ontology reference
- [ ] Decisions must record what was decided and by which reasoning path
- [ ] Commitments must capture what the system commits to doing
- [ ] PlanConstraint must capture scope, resource, and temporal bounds
- [ ] PlanOntology must reference the ontology nodes this plan operates within

### Unresolved Follow-Ups
- How does Plan relate to the conduit-mcp plan model?
- Should Plan be implemented as an extension of conduit-mcp's plan or a separate type?

---

## 3. Define NLP Projection Schema as Formal Eval Input Contract
**Status:** `Agreed`

### Architectural Intent
The NLP Projection Schema is the formal contract describing what NLP/LLM must emit for Eval to consume. It is the compiler-front-end output that defines the structure of transcript-extracted data before Eval processes it into segments, trajectories, and candidate objects. This directly answers open questions about artifact formats in the pipeline.

### Requirements & Acceptance Criteria
- [ ] NLP Projection Schema must define the formal output structure of transcript processing
- [ ] Eval must consume NLP Projections as its input — this is the contract boundary
- [ ] The schema must support all transcript types (ChatGPT, Copilot, others) uniformly
- [ ] Schema must include provenance tracking from source transcript segments

### Unresolved Follow-Ups
- Does NLP Projection Schema subsume or complement the existing rover extraction schemas?
- How does the projection schema handle multi-model outputs (different LLMs producing different projections)?

---

## 4. Define Eval Inference Rulebook for NLP Projection Processing
**Status:** `Proposed`

### Architectural Intent
The Eval Inference Rulebook defines how Eval transforms NLP projections over DocLang into segments, trajectories, and candidate objects. Key rules include: split segments when meaning diverges, discard segments that are noise, promote segments that carry structural or semantic weight, and segment boundaries are final only after Eval processes them (Eval must treat topics as segmentation hints, not final boundaries).

### Requirements & Acceptance Criteria
- [ ] Eval must treat topics as segmentation hints — not finalize segment boundaries
- [ ] Eval must split segments when meaning diverges between adjacent content
- [ ] Eval must discard segments that are noise
- [ ] Eval must promote segments that carry structural or semantic weight
- [ ] Segment boundaries are tentative until Eval finalizes them

### Unresolved Follow-Ups
- How does Eval differ from the existing span segmenter?
- Should Eval replace or augment the current cascade span classifier?

---

## 5. Define Formal Agenda Schema with Conceptual Maps
**Status:** `Proposed`

### Architectural Intent
An Agenda schema that captures not just items but the conceptual map connecting them, unresolved intent, ontology issues, and constraint issues. The Agenda is the intermediate structure between raw transcript content and formal plans — it's what Plurality deliberates on.

### Requirements & Acceptance Criteria
- [ ] Agenda must include: items (AgendaItem[]), conceptual_map, unresolved_intent[], unresolved_ontology[], unresolved_constraints[]
- [ ] ConceptualMap must capture relationships between agenda items and their ontology grounding
- [ ] Unresolved intent, ontology, and constraint issues must be tracked as open items on the agenda

### Unresolved Follow-Ups
- Does Agenda exist as a persistent artifact or a transient processing stage?
- How does Agenda relate to the existing SpecificationAgenda schema in rover?

---

## 6. Define Plurality Deliberation Rules for Agenda-to-Plan Resolution
**Status:** `Proposed`

### Architectural Intent
Plurality is the parliament of meaning where the Agenda gets argued into a Plan. Deliberation rules define how multiple interpretations, objections, and candidate plans are resolved into a single coherent plan. This is the governance layer that makes the system more than a single-pass extraction pipeline.

### Requirements & Acceptance Criteria
- [ ] Plurality must resolve Agenda items into Plans through structured deliberation
- [ ] Deliberation must support multiple competing interpretations of the same transcript content
- [ ] Objections must be first-class citizens with structured rationale
- [ ] Resolution must produce a single coherent plan from multiple candidate interpretations

### Unresolved Follow-Ups
- How does Plurality relate to the existing duality/plurality session concepts?
- Should Plurality produce a single 'winning' plan or maintain multiple competing plans?

---

## 7. Generate Implementation Plan for Structural Risk Governance (Plan #003)
**Status:** `Proposed`

### Architectural Intent
A concrete implementation plan JSON for structural risk governance, directly implementing Plan #003 (Structural Risk Management as Governance Substrate). Includes impl_plan_id, created_at, author_model_id, plan_id references, requirements, and files affected. Shows the system beginning to self-generate implementation plans from its own architecture.

### Requirements & Acceptance Criteria
- [ ] Implementation plan must reference its parent architecture plan (plan-structural-risk-governance)
- [ ] Must include explicit file paths affected
- [ ] Must include concrete requirements traceable to the architecture plan
- [ ] Risk Blocker Schema must be a typed artifact that routes itself through the governance graph

### Unresolved Follow-Ups
- Should self-generated implementation plans be stored alongside human-authored ones?
- What is the review process for self-generated plans?

---

## 8. Recognize Agenda Items as First-Class Work Units
**Status:** `Agreed`

### Architectural Intent
The system is already producing actionable structure from transcript processing — Agenda items are work, and the system is already producing a semantic backlog. This recognition elevates the extraction pipeline from 'analysis' to 'production' — the pipeline output IS the work queue.

### Requirements & Acceptance Criteria
- [ ] Agenda items must be actionable as work units
- [ ] The semantic backlog must be a first-class artifact that the pipeline produces
- [ ] Provenance must track which transcripts produced which agenda items

### Unresolved Follow-Ups
- How does a SemanticBacklog integrate with Nebula (the intent marketplace)?
- Should the backlog feed directly into conduit-mcp as work requests?

---
