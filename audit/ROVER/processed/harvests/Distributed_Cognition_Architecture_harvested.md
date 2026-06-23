# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Distributed Cognition Architecture.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. Distributed Cognition Architecture — Externalized Cognitive Functions Across Specialized Components
**Status:** `Agreed`

### Architectural Intent
Formalize the distributed cognition architecture where cognitive functions are externalized into specialized components: sensory intake (transcript ingest, events), working memory (context windows, Thought Context), episodic memory (EventStore, conversation history), semantic memory (Knowledge Graph), executive function (Conduit/orchestration), attention (Vector, scheduling), reflection (LOSM evaluation layers), long-term memory (PEB), motor system (workers, tools, services), language center (chat interfaces, prompts, ServiceRequests). None of these functions are co-located — the 'mind' is the coordination of processes, not a single process.

### Requirements & Acceptance Criteria
- [ ] 10+ cognitive functions distributed across components
- [ ] No single process owns cognition — cognition emerges from coordination
- [ ] Each cognitive function has a dedicated storage/compute component
- [ ] Cognitive functions: intake, working memory, episodic memory, semantic memory, executive, attention, reflection, long-term memory, motor, language

---

## 2. Cognitive Substrate — System Owns Cognition, Models Participate In It
**Status:** `Agreed`

### Architectural Intent
Invert the conventional model: in a cognitive substrate system, the durable intelligence resides in the ontology, event history, knowledge graph, WorkRequest graph, evaluation loops, memory structures, and governance rules — not in the model. Models become replaceable cognitive workers that participate in a larger cognitive system. The system owns cognition, models participate in it. This means models can be swapped (Gemini, Claude, GPT, DeepSeek, local) without losing the system's cognitive continuity because the durable state is outside the model.

### Requirements & Acceptance Criteria
- [ ] Durable intelligence in: ontology, event history, KG, WorkRequest graph, evaluation loops, memory, governance
- [ ] Models are replaceable cognitive workers, not the source of cognition
- [ ] Swapping models must not lose cognitive continuity
- [ ] System state persists independently of any model invocation
- [ ] Models participate in cognition under system-defined constraints

---

## 3. WorkRequest as Unit of Thought, Not Unit of Work
**Status:** `Agreed`

### Architectural Intent
Evolve the WorkRequest lifecycle (DRAFT → CANDIDATE → APPROVED → EXECUTED → SUPERSEDED) from task management states to belief and intention states. A WorkRequest becomes a unit of thought — representing belief states (is this proposal valid?), intention states (what should happen?), and epistemic states (what do we know?). The lifecycle captures cognitive progression from tentative to committed, not just task progression from created to done. This is why ontology, epistemology, provenance, confidence, disputes, candidates, speculation, and validation are cognitive concepts disguised as workflow concepts.

### Requirements & Acceptance Criteria
- [ ] WorkRequest lifecycle represents belief and intention states, not just task states
- [ ] DRAFT = tentative proposal, CANDIDATE = under review, APPROVED = committed belief
- [ ] EXECUTED = transition completed, SUPERSEDED = superseded by new belief
- [ ] WorkRequest carries provenance, confidence, and epistemic metadata
- [ ] Cognitive status orthogonal to execution status

---
