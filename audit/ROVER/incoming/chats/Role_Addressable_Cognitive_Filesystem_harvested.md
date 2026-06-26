# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Role-Addressable Cognitive Filesystem.html
**Model:** DeepSeek V4
**Total candidates:** 6
---
## 1. Role-Addressable Cognitive Filesystem (RS-EFR) — Structure Produces Behavior
**Status:** `Agreed`

### Architectural Intent
Design a role-addressable cognitive filesystem where agents become file-scoped interpreters with bounded epistemic access. The core shift: agents are activated by structure (filesystem + config), not by direct invocation. This yields selective epistemology (each role sees only its subtree + declared imports), implicit routing (file writes become messages), and composable pipelines (workflows emerge from directory topology). Roles are bounded perspectives over a shared artifact graph, defined by what they can see, mutate, react to, and emit — not by what they 'do'.

### Requirements & Acceptance Criteria
- [ ] Each role must have a root directory and explicit read/write/subscribe/publish declarations
- [ ] Roles must not access artifacts outside their declared visibility scope
- [ ] Backchannels must be directory-watched projections, not direct message passing
- [ ] The host role must be a query/reduction/projection engine, not another agent
- [ ] Config.md must serve as a declarative governance layer with structural binding, epistemic rules, and transition rules

### Harvested Code Artifacts
#### Purpose: Role perspective contract definition
```yaml
role: archivist
root: /nebula/archive/
read:
  - /nebula/archive/**
  - /nebula/ingest/logs/**
write:
  - /nebula/archive/**
subscribe:
  - report.created
  - ingest.finalized
publish:
  - archive.indexed
```

### Unresolved Follow-Ups
- How are projection contracts enforced at runtime — filesystem permissions, or a middleware layer?
- What happens when two roles have overlapping write scopes?

---

## 2. Role-Gated Graph Mutation System (RG-GMS) — Shift from Filesystem to MCP + Graph
**Status:** `Agreed`

### Architectural Intent
Evolve from the filesystem-backchannel model to a role-gated graph mutation system. Agents don't communicate — they mutate shared structured state through constrained MCP interfaces. MCP becomes the single semantic boundary with controlled read/write over the cognition graph. Each agent config describes allowed transactions, not who to talk to. The system becomes a permissioned graph mutation system with 4 layers: MCP layer (transaction control plane), Agent layer (ephemeral workers with no long-term state), Steward layer (semantic compiler — deduplication, normalization, entity resolution), and Graph layer (truth substrate — versioned nodes/edges with provenance chains).

### Requirements & Acceptance Criteria
- [ ] MCP must enforce read/write permissions, validation hooks, audit logging, and schema enforcement
- [ ] Only Steward-level processes can canonicalize knowledge into graph form
- [ ] Agents must be stateless workers with no long-term state
- [ ] Graph layer must support versioned nodes/edges with provenance chains
- [ ] Backchannels must be replaced with query-time projection: auditor reads graph WHERE node.type=report AND node.linked_role=archivist

### Harvested Code Artifacts
#### Purpose: Role MCP transaction permissions
```yaml
role: knowledge_steward
mcp:
  read:
    - graph:concepts/*
    - graph:reports/*
  write:
    - graph:entities/*
    - graph:edges/*
    - graph:annotations/*
  constraints:
    - must_attach_provenance: true
    - must_link_to_source_node: true
```

### Unresolved Follow-Ups
- What is the minimal graph schema that allows steward-level synthesis without over-structuring early ingestion?
- How does the steward handle conflicting information from multiple agents about the same entity?

---

## 3. Nexus Bootstrap Kernel (NBK) — Minimal Deterministic Execution Substrate
**Status:** `Implemented`

### Architectural Intent
Build a minimal deterministic execution substrate (NBK) that defines the entire system semantics in 5 primitives: NodeDef (pure state transformation), Edge (causal dependency constraint), Trace (immutable execution record), Lease (permission to execute), and Address/CAL (global referential identity via cal://{realm}/{graph}/{trajectory}/{node}/{version}). The kernel provides graph building with cycle detection, topological execution respecting lease bindings, traced replay for full deterministic reconstruction, lease scheduling (round-robin or manual), CAL addressing, SCQL predicate queries, and SOCO mutation (graph transformations). This is a ~220 LOC kernel that forms the semantic physics layer for the entire system.

### Requirements & Acceptance Criteria
- [ ] NodeDef(id, fn: Callable[[dict], Any]) — pure state transformation, no side effects
- [ ] Edge(from_id, to_id) — causal dependency constraint, must enable cycle detection
- [ ] Trace(sequence, node_id, input_state, output_state) — immutable execution record for full replay
- [ ] Lease(node_id, executor_id) — capability-based execution permission
- [ ] Address: make_address()/parse_address() — cal://{realm}/{graph}/{trajectory}/{node}/{version}
- [ ] Kernel must support: graph building, topological execution, traced replay, lease scheduling, CAL addressing, SCQL queries, SOCO mutation
- [ ] All 5 primitives must close under composition — every higher-level operation must reduce to these primitives

### Harvested Code Artifacts
#### Purpose: NBK 5 primitives and kernel capabilities summary
```python
# 5 Primitives:
# P1 - Node: NodeDef(id, fn: Callable[[dict], Any]) — pure state transformation
# P2 - Edge: Edge(from_id, to_id) — causal dependency constraint
# P3 - Trace: Trace(sequence, node_id, input_state, output_state) — immutable execution record
# P4 - Lease: Lease(node_id, executor_id) — permission to execute
# P5 - Address: make_address() / parse_address() — cal://{realm}/{graph}/{trajectory}/{node}/{version}

# Kernel capabilities:
# - add_node, add_edge with cycle detection
# - execute_ready_nodes() — topological execution with lease bindings
# - replay() — reconstruct state from trace log
# - round-robin or manual executor assignment
# - address_of(node) → cal://..., resolve(address) → node def
# - query(predicate) — filtered node state rows (SCQL)
# - mutate(rule) — graph transformations (SOCO)
```

### Unresolved Follow-Ups
- What is the exact formal boundary between NBK Trace state and SOCO mutation legitimacy?
- Do all 5 primitives fully close under composition, or are additional primitives needed?

---

## 4. SOCO + NBK — Self-Optimizing Organism Over Deterministic Kernel
**Status:** `Proposed`

### Architectural Intent
Define SOCO (Self-Optimizing COmpiler Organism) as the mutation layer over NBK. NBK provides deterministic execution, traceability, and constraint enforcement. SOCO provides mutation strategy, structural optimization, and graph evolution heuristics. The relationship is: SOCO = optimizer(policy over NBK state transitions), NBK = ground truth execution machine. This mirrors how compilers evolve programs, not how agents talk to each other. SOCO mutations must be valid NBK transformations with defined legitimacy rules.

### Requirements & Acceptance Criteria
- [ ] SOCO must operate as a transformation algebra: SOCO(rule, NBK_graph) → NBK_graph'
- [ ] SOCO mutations must not violate NBK invariants (causal ordering, trace integrity, lease validity)
- [ ] SOCO must be able to collapse chains (CollapseChain) and merge idle leases (MergeIdleLeases)
- [ ] Every SOCO mutation must be traceable and reversible via NBK's replay mechanism

### Unresolved Follow-Ups
- What heuristics does SOCO use to decide which mutations to apply?
- How does SOCO avoid local optima in graph optimization?

---

## 5. 9-Spec Stratification — Kernel, Compiler, and Distribution Layers
**Status:** `Agreed`

### Architectural Intent
Stratify the 9 harvested specification candidates from the Event-Driven CLI Agents conversation into three layers. Layer A (kernel primitives, already grounded in NBK): CAL addressing and SOCO+NBK. Layer B (compiler-level, direct NBK extensions): Role Lease System (Lease primitive formalization), SCQL (graph + trace unification), Formal Verification Layer (kernel validator over NBK state transitions). Layer C (distributed futures): Event-to-Prompt Execution Surface (UI/runtime projection), Self-Hosting Compiler Loop (requires stable semantic fixed point first), USEP (network abstraction over CAL), Federated Compiler Swarm (post-NBK-distribution). This stratification makes the architecture ladder explicit and actionable.

### Requirements & Acceptance Criteria
- [ ] Layer A specs must be executable in NBK today
- [ ] Layer B specs must have a clear NBK primitive mapping before implementation
- [ ] Layer C specs must be explicitly deferred until Layer A and B stabilize
- [ ] No spec in Layer B or C may depend on unimplemented NBK primitives
- [ ] The stratification must be versioned so progress through layers is measurable

### Harvested Code Artifacts
#### Purpose: 9-spec stratification into kernel/compiler/distribution layers
```text
Layer A — Kernel Primitives (real in NBK):
  #6 CAL — addressing system → implemented
  #8 SOCO + NBK → the kernel itself

Layer B — Compiler Extensions:
  #2 Role Lease System → Lease primitive formalization
  #7 SCQL → graph + trace unification
  #3 Formal Verification → kernel validator over state transitions

Layer C — Distributed Futures:
  #1 Event-to-Prompt → UI/runtime projection
  #4 Self-Hosting Compiler Loop → requires semantic fixed point
  #5 USEP → network abstraction over CAL
  #9 Federated Compiler Swarm → post-NBK-distribution
```

### Unresolved Follow-Ups
- What are the explicit gating criteria for promoting a spec from Layer C to Layer B?
- How does the Formal Verification Layer prove the 5 invariants (causal, replay, lease, deadlock, shard) at compile time?

---

## 6. Semantic Convergence Rules — Kernel Law Layer Between NBK and SOCO
**Status:** `Proposed`

### Architectural Intent
Define the missing 'kernel law layer' between NBK (mechanics) and SOCO (optimization). This layer answers: When does a SOCO mutation become a valid NBK transformation? When does a trace become canonical graph state? When does a SCQL query become an allowed mutation? When does lease assignment become deterministic? Without these convergence rules, the system can drift — NBK executes correctly but SOCO's optimization heuristics produce incompatible graph structures.

### Requirements & Acceptance Criteria
- [ ] Define the exact formal boundary between NBK Trace state and SOCO mutation legitimacy
- [ ] Define when a trace can be promoted to canonical graph state (steward compilation rule)
- [ ] Define when SCQL queries are read-only vs allowed to produce mutations
- [ ] Define lease assignment determinism rules for replayability
- [ ] All convergence rules must be verifiable at the kernel level

### Unresolved Follow-Ups
- What is the minimal set of convergence rules needed to prevent semantic drift?
- Should convergence rules be enforced at the kernel level, steward level, or both?

---
