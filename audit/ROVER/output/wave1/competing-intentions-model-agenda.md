# Harvested Specification & Code Repository

**Source:** `Competing Intentions Model.html`
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 5 Specification Candidates extracted

---

## 1. Reasoning Mode Model v0.1 (Data/Context/Reasoning)
**Status:** `Agreed`

### Architectural Intent
Agent behavior is not stored in compartments of knowledge, but expressed as context-triggered activation of different reasoning policies over a shared graph. Three distinct layers: Data (canonical graph), Context Cues (activation signals), Reasoning Modes (projection + policy bundles).

### Requirements & Acceptance Criteria
- [ ] **Data (canonical graph)** — fixed nodes, edges, provenance. No reasoning lives here
- [ ] **Context cues (activation signals)** — the trigger layer. Examples: event type (user_question), graph pattern (contradiction detected), system state (low confidence inference chain), external signal (new observation ingest). Cues don't contain answers — they define which reasoning mode becomes active
- [ ] **Reasoning modes (projection + policy bundle)** — each mode defines: what projections are visible, what edges matter, what counts as valid inference, what gets ignored
- [ ] **Agents are not "thinking entities"** — they are policy-bound graph interpreters reacting to context cues. An agent is defined by: what it can see (projection), what it reacts to (cue filters), how it transforms graphs (operations). Not by internal narrative
- [ ] Behavior is event-driven, not agent-driven: "Event E activates reasoning modes M1, M2, M3 over projection P" instead of "Agent A does X"

### Harvested Code Artifacts
#### Purpose: Three-layer model
```
Layer 1: Data          — canonical graph (nodes, edges, provenance), no reasoning
Layer 2: Context Cues  — activation signals: event type, graph pattern, system state
Layer 3: Reasoning Modes — projection + policy bundles defining visible projections,
                           valid inference, ignored signals
```

#### Purpose: Agent definition
```
Agent = policy-bound graph interpreter reacting to context cues
  - what it can see         (projection)
  - what it reacts to       (cue filters)
  - how it transforms graphs (operations)
```

### Unresolved Follow-Ups
- Minimal context cue schema that reliably selects correct reasoning mode without becoming a rule explosion?
- How many reasoning modes are needed before the system is effective?

---

## 2. Reasoning Mode Catalog v0.1
**Status:** `Agreed`

### Architectural Intent
Define the initial set of reasoning modes that emerge from graph state. Each mode defines a behavioral regime — what projections are visible, what counts as valid inference, what gets ignored.

### Requirements & Acceptance Criteria
- [ ] **Fact mode** — only grounded nodes, strict provenance required, no inference chains
- [ ] **Hypothesis mode** — allows inferred edges, weak evidence accepted, encourages expansion
- [ ] **Execution mode** — only task-relevant subgraph, ignores uncertainty, focuses on dependency resolution
- [ ] **Diagnostic mode** — prioritizes contradictions, surfaces low-confidence links
- [ ] Same event, different mode activation: "Node X contradicts Node Y" → Fact mode checks provenance, Explorer searches for bridging nodes, Architect suggests schema refinement
- [ ] Modes are not selected explicitly but *induced* from graph shape + event signature

### Harvested Code Artifacts
#### Purpose: Reasoning mode catalog
```
Fact mode       → grounded nodes, strict provenance, no inference chains
Hypothesis mode → inferred edges, weak evidence, expansion encouraged
Execution mode  → task-relevant subgraph, dependency resolution
Diagnostic mode → contradictions surfaced, low-confidence links prioritized
```

### Unresolved Follow-Ups
- Can modes be composed (e.g., Fact + Diagnostic simultaneously)?
- What determines the active mode — is it a single mode per agent or a weighted mixture?

---

## 3. "Mildred Screen" Anti-Pattern & Emergent Modes v0.1
**Status:** `Agreed`

### Architectural Intent
Explicit cognitive configuration via combinatorial UI controls is the classic failure mode. Replaced by mode emergence from graph structure and event dynamics. Policy works as attractors, not switches.

### Requirements & Acceptance Criteria
- [ ] **Bad version (Mildred UI)** — user/system picks "Fact/Opinion/Explorer/Architect", routing becomes manual or rule-heavy, context cue system becomes a giant dispatch table. This is forbidden
- [ ] **Good version (Emergent)** — mode is inferred from graph shape + event signature, agent behavior shifts automatically, no visible "mode layer" as a first-class control surface
- [ ] What replaces the combobox table:
  1. **Structural signals** from the graph: contradiction density, provenance depth, node uncertainty, branching factor, unresolved dependencies, cross-level deltas. These are properties of current state, not settings
  2. **Event shape** (what just happened): ingestion, query, failure, inconsistency detection, external update, user intent shift. Not a mode selector — a state perturbation
  3. **Policy as attractors, not switches**: state evolves toward different reasoning attractors depending on structure. "Fact-like behavior" emerges when provenance is high, uncertainty is low, contradiction is minimal
- [ ] This prevents: combinatorial explosion, brittle governance rules, user/operator cognitive overload, fake control

### Harvested Code Artifacts
#### Purpose: Emergent modes design principle
```
Mildred UI (forbidden):
  explicit mode selection → dispatch table → rule explosion

Emergent (required):
  graph state → determines inference behavior
  event injection → perturbs state
  agents → respond according to local constraints
```

### Unresolved Follow-Ups
- What are the fewest measurable graph properties needed to reliably induce distinct reasoning behaviors?
- How to detect when the system is in "Mildred mode" and snap out of it?

---

## 4. Knowledge Stratification Schema v0.1
**Status:** `Agreed`

### Architectural Intent
Two-axis knowledge stratification: `level` (semantic abstraction) + `visibility_scope` (agent type). Cross-references remain level-agnostic — they describe relationships, not permissioned relationships. Content is level-gated, cross-references are query-time-filtered.

### Requirements & Acceptance Criteria
- [ ] **level** = semantic stratification (what kind of knowledge):
  - 1 = raw / operational
  - 2 = structured / intermediate
  - 3 = planning / architectural
  - 4 = meta / system reasoning
- [ ] **visibility_scope** (or `agent_scope`) = who can see it: `builder`, `architect`, `inspector`, `all`, etc.
- [ ] **cross_reference table stays structurally neutral** — no level gating by default. Resolution is filtered by level at query time
- [ ] Builder agent query: `level ≤ 1`, `visibility = builder | all`. Ignores higher abstraction unless explicitly promoted
- [ ] Architect agent query: `level ≤ 3`. Can optionally pull cross-referenced nodes
- [ ] Content table schema: `id`, `content`, `level`, `visibility_scope`, `metadata`
- [ ] Cross-reference table schema: `source_id`, `target_id`, `relation_type` (no level gating by default)

### Harvested Code Artifacts
#### Purpose: Two-axis stratification
```
level (semantic):
  1 = raw / operational
  2 = structured / intermediate
  3 = planning / architectural
  4 = meta / system reasoning

visibility_scope (access):
  builder, architect, inspector, all
```

#### Purpose: Schema
```
content_table:
  id, content, level (semantic abstraction), visibility_scope (agent type), metadata

cross_reference_table:
  source_id, target_id, relation_type  (no level gating by default)
```

### Unresolved Follow-Ups
- How does an agent get "promoted" to see higher level data?
- What is the exact query shape for builder vs architect context injection?
- How do we handle content that spans multiple levels?

---

## 5. Single Knowledge Graph Principle v0.1
**Status:** `Agreed`

### Architectural Intent
We do not distribute knowledge across multiple levels — we distribute **access projections** over a single knowledge graph. This prevents duplication, version drift, and schema explosion.

### Requirements & Acceptance Criteria
- [ ] "You are not distributing knowledge — you are distributing access projections over a single knowledge graph"
- [ ] This distinction prevents: duplication, version drift ("why is this fact different in level 2?"), schema explosion later
- [ ] Cross-ref is a **conditional expansion operator**, not a default join
  - Builder = narrow graph slice (level ≤ 1, visibility = builder/all)
  - Architect = graph expansion via cross_ref traversal (used under "blocker conditions")
- [ ] The architect uses cross-references when the builder has a blocker — this is the expansion mechanism, not a default behavior
- [ ] Context injection is shaped by projecting the graph through the agent's level + visibility filter

### Harvested Code Artifacts
#### Purpose: Single graph / access projection principle
```
Single knowledge graph + per-role access projections:
  Builder = narrow slice, level ≤ 1
  Architect = expansion via cross_ref traversal
  Cross-ref = conditional expansion operator, not default join
```

### Unresolved Follow-Ups
- How are cross-reference expansion permissions granted?
- Does the architect's cross-reference traversal have depth limits?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Reasoning Mode Model | Agreed | Data/Cues/Modes three-layer, agents as policy-bound interpreters |
| 2 | Reasoning Mode Catalog | Agreed | Fact/Hypothesis/Execution/Diagnostic modes |
| 3 | Mildred Screen Anti-Pattern | Agreed | Emergent modes, no explicit dispatch, policy as attractors |
| 4 | Knowledge Stratification Schema | Agreed | level + visibility_scope, cross-ref level-agnostic |
| 5 | Single Knowledge Graph Principle | Agreed | Access projections over one graph, cross-ref as expansion operator |

---

*Extracted from `chats/Competing Intentions Model.html`, 16 chunks processed. Rover pipeline: BS4 → chunk → architect extraction → compiled.*
