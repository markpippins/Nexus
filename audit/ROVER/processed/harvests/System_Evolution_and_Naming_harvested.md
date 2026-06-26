# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/System Evolution and Naming.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. WDICC v0.1 — WorkRequest DAG Ingestion + Constraint Compilation Pipeline
**Status:** `Specified`

### Architectural Intent
Define WDICC as an executable pipeline for converting raw artifacts (prompts, transcripts, specs, plans) into structured WorkRequest DAGs. The pipeline: Ingestion (accept raw artifact) → Extraction (identify work items, constraints, dependencies) → Compilation (build typed DAG nodes with constraint expressions) → Validation (verify structural invariants) → Emission (output serialized WorkRequest DAG). This is the bridge between unstructured conversational intent and the deterministic WRP pipeline.

### Requirements & Acceptance Criteria
- [ ] Ingestion must accept: prompts, transcripts, specs, plans as raw artifacts
- [ ] Extraction must identify: work items, constraints, dependencies from unstructured text
- [ ] Compilation must produce: typed DAG nodes with constraint expressions
- [ ] Validation must verify: structural invariants (no cycles, constraint consistency)
- [ ] Emission must output: serialized WorkRequest DAG in WRP-compatible format

---

## 2. SemanticProjection and SemanticProjectionBuilder — Concrete Implementation
**Status:** `Proposed`

### Architectural Intent
Implement SemanticProjection as a formal type representing a projected view of canonical semantic state, and SemanticProjectionBuilder as the factory that constructs projections from IR. This is the implementation counterpart to the Projection API contract defined in the Knowledge Graph Performance Concerns transcript — it turns the abstract contract (4 invariant getters, 6 derived projections, 2 control surfaces) into concrete Python types.

### Requirements & Acceptance Criteria
- [ ] SemanticProjection: typed representation of a projected view with source IR, projection type, timestamp, and projected fields
- [ ] SemanticProjectionBuilder: factory that accepts IR state and produces typed projections
- [ ] Must align with Projection API contract: 4 invariant getters, 6 derived projections, 2 control surfaces
- [ ] Projections must be pure, deterministic, and cacheable

---

## 3. Three Layers of Determinism — Importer, Replay, and Mutation Determinism
**Status:** `Agreed`

### Architectural Intent
Formally define three distinct layers of determinism in the system: (1) Importer Determinism — same raw artifact always produces the same IR; (2) Replay Determinism — same IR + same state always produces the same execution trace; (3) Mutation Determinism — same mutation applied to same state always produces the same resulting state. Each layer has its own verification contracts and failure modes. This prevents the common failure mode of conflating 'the system is deterministic' into a single untestable claim.

### Requirements & Acceptance Criteria
- [ ] Importer Determinism: hash(raw_artifact) → same IR, verified by golden file tests
- [ ] Replay Determinism: same IR + state snapshot → same execution trace, verified by CER replay
- [ ] Mutation Determinism: same mutation + state → same resulting state, verified by state hash comparison
- [ ] Each layer must have independent verification — failure in one layer must not cascade

---

## 4. LOSM as Dual-Mode Cognitive OS — Discovery Mode vs Runtime Mode
**Status:** `Proposed`

### Architectural Intent
Formalize LOSM as a dual-mode cognitive operating system: Discovery Mode (speculative ontology building, exploring namespace, establishing semantic relationships) and Runtime Mode (operating within established ontology, executing known workflows, enforcing established constraints). The mode switch is a governed transition — you cannot accidentally mutate ontology during runtime, and you cannot accidentally execute during discovery. This is the OS-level expression of the observation-vs-interpretation boundary.

### Requirements & Acceptance Criteria
- [ ] Discovery Mode: speculative, ontology-building, namespace exploration, semantic relationship establishment
- [ ] Runtime Mode: operational, ontology-respecting, workflow execution, constraint enforcement
- [ ] Mode switch must be a governed transition with explicit state change
- [ ] Runtime must refuse ontology mutations; Discovery must refuse execution commands
- [ ] Must align with Steward's separation of observation (anyone can write) from interpretation (Steward-governed)

---
