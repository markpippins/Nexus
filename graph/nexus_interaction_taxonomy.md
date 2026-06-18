# Nexus IR Interaction Archetype Taxonomy

**Status:** Binding Governance Contract
**Scope:** Universal across all Nexus IR transformation and compilation layers. 

## 1. Core Principle
This taxonomy constitutes a **CLOSED CONTRACT** governing how the deterministic Append-Only Object Registry (IR) is permitted to evolve. 

All past, present, and future interactions within the Nexus environment MUST reduce to one or more of these 9 archetypes. New behaviors that cannot map to this ontology must be rejected as out-of-scope. Interaction types define structural graph evolution pathways—they do not define UI actions, narrative intent, or heuristics.

---

## 2. Interaction Archetypes

### A. Construction Interaction
**Definition:** Generates initial structural graph components natively translating inputs.
- **Includes:** Concept creation, Scope mapping, Trajectory instantiation, Message log appends.
- **Constraint:** Strictly builds new objects cleanly; absolutely no modification of existing stabilized IR graph limits. 
- *Current Pipeline Maps:* `GraphBuilder` (Phase 1-3).

### B. Execution Interaction
**Definition:** Deterministic scaling sequence mapping evaluations traversing established paths natively to materialize structural footprints natively.
- **Includes:** Emitting sequential `TrajectorySnapshots`, expanding internal node tracking parameters.
- **Constraint:** Zero cross-trajectory state mutation boundaries. Logic strictly bounds locally. 
- *Current Pipeline Maps:* `TrajectoryReconstructor` (Phase 4).

### C. Reflection Interaction
**Definition:** Epistemic extraction mappings computing differences between native states pulling structural signals dynamically out of derived executions.
- **Includes:** Deriving `IR_Diff` traces, synthesizing deterministic non-executable `Observation` properties, and detecting structural contradictions natively.
- **Constraint:** Derivations only. Must NEVER modify or overwrite the underlying Graph State directly. 
- *Current Pipeline Maps:* `DiffEngine` (Phase 4.5), `ObservationSynthesizer` (Phase 6).

### D. Reconciliation Interaction
**Definition:** Top-down structural synchronization natively consolidating parallel tracks bounding the Workspace limits into explicit deterministic closures.
- **Includes:** `ClosureSet` computations, `QuestionNode` entailments mapping subsets securely.
- **Constraint:** Operates EXCLUSIVELY on materialized execution footprints (`snapshots`), never directly polling active execution memory sequences.
- *Current Pipeline Maps:* `QuestionResolver` (Phase 4.7).

### E. Revision Interaction
**Definition:** Targeted recalibration mappings resolving explicit structural interpretations mapping prior iterations out abstractly safely.
- **Includes:** Concept rescoping alignments, explicit transition overlays.
- **Constraint:** Deletion is forbidden. Alignments must occur securely mapped through mapped structural modifications extending constraints explicitly over previously established traces natively safely.

### F. Counterfactual Interaction
**Definition:** Sandboxed execution logic scaling speculative paths checking validation assumptions without destroying constraints structurally mapping inputs natively. 
- **Includes:** Speculative `IR_Diff` layers, isolated branch validation checking.
- **Constraint:** Absolutely NO merges cleanly into canonical Workspace structures globally mapping explicitly authorized structural promotions.

### G. Audit Interaction
**Definition:** Validates bounds cleanly across all native footprints mapping explicitly native structural parameters confirming valid dependencies mapping cleanly safely.
- **Includes:** Validating `RESOLVES` relations securely, mapping back `Observation` proofs across previous sequences seamlessly natively safely. 
- **Constraint:** Read-only isolated traversal across historical limits verifying math cleanly safely.

### H. Compression Interaction
**Definition:** Abstract mapping collapsing overlapping redundancy dimensions shrinking footprints logically mathematically natively cleanly. 
- **Includes:** `ContextAssembler` consolidations natively shrinking footprint dimensions mapping explicit equivalence groups securely logically.
- **Constraint:** Lossless structural equivalence REQUIRED. Semantic details mapping natively securely bounding structure exactly.

### I. Constraint Injection Interaction
**Definition:** Pushing parameters driving boundary mapping constraints tracking downstream structural execution paths guiding parameters matching natively. 
- **Includes:** Architectural overrides isolating environments tracking explicitly scaling metrics bounding.
- **Constraint:** Only applies downstream modifying sequential structural limits tracking bounds mapping natively structurally securely logically without rewriting history structurally.

---
## 3. Global Enforcement Protocol
Any modifications directly impacting the structural Object Registry (`ConversationGraph`) **must explicitly abide by the limitations specified inside this governing specification natively mapping explicitly structurally without exception.**
