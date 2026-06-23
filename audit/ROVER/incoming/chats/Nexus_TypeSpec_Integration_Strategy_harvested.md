# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - TypeSpec Integration Strategy.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Prompt Architect as Contract-Driven Prompt Compiler — Intent Spec + Contract Spec + Execution Spec
**Status:** `Specified`

### Architectural Intent
Define Prompt Architect as a stateless compiler that transforms intent spec (prompt_spec.json) into AI execution plans. Three-layer model: Intent Spec (WHAT the app should do — UI, behavior, generation targets), Contract Spec (optional TypeSpec — data/API guarantees), Execution Spec (compiled prompt sent to AI Studio or Gemini). TypeSpec is optional — when absent, the LLM infers structure; when present, the LLM executes against a contract. The separation is: Prompt Architect = ephemeral design tool, Nebula = persistent knowledge system.

### Requirements & Acceptance Criteria
- [ ] Three layers: Intent Spec, Contract Spec (optional), Execution Spec
- [ ] TypeSpec as optional precision upgrade, not requirement
- [ ] Prompt Architect never owns truth — ephemeral by design
- [ ] Nebula holds persistent state, PA compiles from it
- [ ] TypeSpec as both input (constrain generation) and output (generate contracts)
- [ ] Contracts section: contracts.typespec = null | {source | inline}

---

## 2. Nexus TypeSpec Meta-Schema v0 — 10-Node Canonical Semantic Model
**Status:** `Proposed`

### Architectural Intent
Define the minimal TypeSpec meta-schema (10 core node types) for Nexus: Program (root container with namespaces), Namespace (organizational unit with members), Model (business entity with properties), Property (field with type, optional, decorators), Scalar/TypeRef (type reference to intrinsic or model), Enum (named set of members), Union (type variants), Operation (service action with parameters and return), Interface (service surface with operations), Decorator (metadata annotation with name and arguments). Store as nexus.model.json (structural truth), emit .tsp as export. This is the canonical domain model of Nexus.

### Requirements & Acceptance Criteria
- [ ] 10 node types: Program, Namespace, Model, Property, TypeRef, Enum, Union, Operation, Interface, Decorator
- [ ] Store structural truth as JSON, not .tsp
- [ ] Emit .tsp from structural model, never edit .tsp directly
- [ ] Model semantics, not syntax — compiler's understanding, not text file
- [ ] Mutation API controls all changes — UI, AI, CLI use same path

---

## 3. Nexus Mutation API — Controlled Evolving Model via Immutable State + Typed Mutations + Validation + Event Stream
**Status:** `Proposed`

### Architectural Intent
Design the Nexus Mutation API as the sole path for modifying the program model. Principles: immutable program state (changes produce NewProgramState, enabling undo/redo/history), mutation objects (typed: AddModel, AddProperty, RenameSymbol, etc.), validation layer (reject mutations that would make model illegal), transaction system (atomic batch mutations), event stream (every mutation emits ModelAdded/PropertyChanged events), stable IDs (UUIDs, not names). This prevents model corruption from AI, UI, or scripts and enables event sourcing, time travel, and safe multi-agent workflows.

### Requirements & Acceptance Criteria
- [ ] Immutable program state — changes create new state
- [ ] Typed mutation objects: AddNamespace, AddModel, AddProperty, RemoveModel, RenameSymbol, MoveSymbol
- [ ] Validation: check collisions, unknown types, cycles, invalid decorator targets
- [ ] Transactions: atomic batch application with rollback
- [ ] Event stream: every mutation emits named event
- [ ] Stable IDs: UUIDs for every node, names can change

---
