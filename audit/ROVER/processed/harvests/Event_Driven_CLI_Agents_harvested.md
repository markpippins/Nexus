# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Event-Driven CLI Agents.html
**Model:** DeepSeek V4
**Total candidates:** 11
---
## 1. Event-to-Prompt Execution Surface — Events Become System Prompts for Leased Roles
**Status:** `Agreed`

### Architectural Intent
Invert the event model: events are no longer records of what happened — they become execution surfaces projected into structured prompts. The system does not dispatch events to agents; it compiles event slices into role-bound system prompts, which instantiate ephemeral CLI execution contexts. Events → Prompt → Agent Execution → Event forms a closed loop. This eliminates the entire agent wiring problem: no NATS fanout, no message routing, no persistent agent state. CLI agents become event subscribers with compute — stateless, scriptable, sandboxable, batch-oriented.

### Requirements & Acceptance Criteria
- [ ] Events must project into PromptIR (structured intent graphs), not literal prompt strings
- [ ] PromptIR must include: intent, scope, constraints, inputs (causal events), target_agents
- [ ] CLI agents must be ephemeral — rehydrated from event state, no persistent agent state
- [ ] Events must not be routed to agents — events become the system prompt for a leased role-harness
- [ ] Must distinguish descriptive projection (what is true) vs prescriptive projection (what should be done)

### Harvested Code Artifacts
#### Purpose: PromptIR — structured intent graph from events
```typescript
PromptIR {
  intent: "repair_build",
  scope: moduleX,
  constraints: ["must compile", "no API changes without migration"],
  inputs: [BuildFailureEvent, DiffEvent],
  target_agents: ["javac-agent", "test-runner"]
}
```

### Unresolved Follow-Ups
- What are the exact Event→Prompt compiler rules (mini AST + rewrite system)?
- How is deduplication handled when multiple events project to overlapping prompts?

---

## 2. Role Lease IR (RL-IR) — Agents Reified from Event State at Lease Time
**Status:** `Specified`

### Architectural Intent
Define a Role Lease as a temporally bound execution contract that binds a projected event slice to a capability-scoped system prompt to a constrained execution runtime. A role lease is NOT an agent, NOT a task — it is a compiled runtime instantiation of intent. Core structure: lease_id, status, projection (EventProjection), prompt_ir (PromptIR), role (RoleDefinition), capabilities (CapabilitySet), execution (ExecutionContext), constraints (ConstraintSet), lifecycle (LifecycleModel with 8 states), termination (TerminationSpec with 7 modes), observability, provenance. The key invariant: agents do not exist as persistent entities — they are instantiations of compiled intent under constraint.

### Requirements & Acceptance Criteria
- [ ] Lease must bind: projected event slice → capability-scoped system prompt → constrained execution runtime
- [ ] Lifecycle states: PROVISIONED, ACTIVE, SUSPENDED, CHECKPOINTED, COMPLETED, FAILED, EXPIRED, REVOKED
- [ ] Termination modes: INTENT_SATISFIED, EVENT_CONSUMED, CONSTRAINT_VIOLATION, TTL_EXPIRED, RESOURCE_EXHAUSTION, EXPLICIT_REVOKE, CONVERGENCE_DETECTED
- [ ] ConstraintSet must include: temporal (TTL, max_steps, idle_timeout), safety, consistency, resource (CPU, memory, IO), determinism
- [ ] ProvenanceGraph must trace: root_events, derivation_edges, projection_history, prompt_compilation_history

### Unresolved Follow-Ups
- How are lease ownership locks implemented for distributed execution?
- What happens when a lease checkpoints but the system crashes before state is persisted?

---

## 3. Four-Layer Compilation Pipeline — Event → Projection → Prompt → Lease Execution
**Status:** `Specified`

### Architectural Intent
Define a complete 4-layer compilation pipeline: EPL-IR (Event Projection Layer) collapses raw event streams into structured intent graphs. PIR (Prompt IR) turns intent graphs into executable system prompts with structured bindings. RL-IR (Role Lease IR) instantiates constrained execution runtimes from PromptIR. RL-COMP (Role Lease Compiler) is the meta-layer turning event streams into leases. Each layer is a compiler stage with strict invariants: every projection is a minimal coherent intent graph; PromptIR is not natural language but a compiled execution program; a RoleLease is a temporary computation organism; compilation rules include collapse_redundant_events, merge_semantically_equivalent_intents, split_conflicting_intents.

### Requirements & Acceptance Criteria
- [ ] EPL-IR: collapse redundant events, resolve causal grouping, detect work-worthy intent clusters
- [ ] PIR: compile structured intent → executable instruction context, bind tools deterministically, remove ambiguity before execution
- [ ] RL-IR: bind prompt → runtime instance, enforce sandbox boundaries, manage lifecycle, guarantee termination
- [ ] RL-COMP compilation rules: R1 collapse redundant, R2 merge equivalent, R3 split conflicting, R4 single authority role per lease, R5 enforce constraint solvability, R6 prevent cross-lease mutation

### Harvested Code Artifacts
#### Purpose: Four-layer compilation pipeline
```text
(1) EVENT LAYER → raw system events
(2) PROJECTION LAYER → event → intent graph (EPL-IR)
(3) PROMPT LAYER → intent → executable prompt program (PIR)
(4) LEASE LAYER → prompt → constrained runtime instance (RL-IR)
execution → events → loop
```

### Unresolved Follow-Ups
- How does RL-COMP handle conflicts between competing intents that cannot be split?
- What is the formal rewrite system for Event→PromptIR compilation?

---

## 4. Lease Scheduler IR (LS-IR) — Deterministic Arbitration Over Intent Surface
**Status:** `Specified`

### Architectural Intent
Define the Lease Scheduler IR as the deterministic control plane that maps a global event-derived intent surface onto a constrained pool of executable RoleLeases via arbitration, policy enforcement, and capacity-aware dispatch. Key abstractions: WorkSurface (globally visible, queryable intent surface, NOT a FIFO queue), LeasePool (active + idle leases with resource tracking), DispatchModel (select idle leases → score by capability_fit + load_factor + locality + historical_success + priority_alignment → argmax winner), PolicyEngine (no_starvation, max_concurrent_leases_per_role, priority_precedence, resource_budget, fairness_windowing), CapacityModel (Σ allocations ≤ total_capacity), PreemptionModel (NONE by default, only cooperative_checkpoint or policy_override).

### Requirements & Acceptance Criteria
- [ ] WorkSurface: work is globally visible, not consumed on read, not ordered linearly, continuously re-evaluated
- [ ] Dispatch: select_idle_leases(event) → score(candidates, event) → argmax → policy check → assign or defer
- [ ] Scoring function: weighted_sum(capability_fit, load_factor_inverse, locality_score, historical_success_rate, priority_alignment)
- [ ] Policy enforcement: no_starvation, max_concurrent_per_role, priority_precedence, resource_budget, fairness_windowing
- [ ] Preemption: NONE default — only cooperative_checkpoint or policy_override

### Unresolved Follow-Ups
- What are the exact fairness bounds per intent class?
- How is the capacity model enforced in a distributed setting?

---

## 5. Lease Composition IR (LC-IR) — Split, Merge, Chain, Refine Operations
**Status:** `Specified`

### Architectural Intent
Define Lease Composition IR as the structure of computation across leases. A lease is no longer atomic — it is a node in a compositional execution graph (LeaseGraph = DAG of leases with typed dependency edges). Operations: split (decompose intent into sub-leases), merge (combine compatible leases if entropy-reducing), chain (A→B causal composition), refine (sharpen intent, reduce uncertainty). Dependency edge types: requires (hard execution dependency), produces_input_for (data flow), validates (audit/verification), refines (hierarchical decomposition), conflicts_with (mutual exclusion). LC-IR is a controlled entropy engine over execution graphs.

### Requirements & Acceptance Criteria
- [ ] Split: sum(sub_leases.intent) == original_intent — no semantic loss
- [ ] Merge: allowed only if role compatible AND constraint consistent AND reduces total system entropy
- [ ] Chain: B.input = A.output, B.start_condition = A.completed
- [ ] Refine: must strictly reduce uncertainty
- [ ] Composition rules: no cyclic dependencies, every lease has termination path, merged preserves constraint satisfiability, split preserves full intent coverage

### Unresolved Follow-Ups
- Can leases spawn sub-leases recursively? What are the depth limits?
- How are split/merge decisions made — by LC-IR compiler or by LS-IR scheduler?

---

## 6. Temporal Execution Model (TEM-IR) — Branching Causal Execution Manifold
**Status:** `Specified`

### Architectural Intent
Define time not as a property of execution but as a first-class substrate. Three layers of time: Event Time (immutable, unordered across sources, partially causal), Lease Time (bounded per lease, may overlap, not globally ordered), Causal Time (the real ordering system: causes, enables, invalidates, refines edges). The system operates in a branched causal execution manifold — speculative execution creates timeline branches on hypothesis states; reconciliation collapses compatible branches; rollback does not erase history but rewrites causal interpretation. Replay: same input graph + same policies → same lease execution graph (deterministic replay guarantee).

### Requirements & Acceptance Criteria
- [ ] EventTime: immutable timestamps, unordered across sources, only partially causal
- [ ] LeaseTime: bounded per lease, may overlap with other leases, not globally ordered
- [ ] CausalTime: edges typed as causes|enables|invalidates|refines — the real ordering system
- [ ] Speculative execution: lease may execute on hypothesis state; if assumptions ≠ verified, create new timeline branch
- [ ] Rollback: mark lease as invalidated, propagate through causal edges, trigger recomputation — never erase history
- [ ] Full replay: reconstruct event sequence → re-run LC-IR → re-run LS-IR → reconstruct lease graph

### Unresolved Follow-Ups
- What is the max branch depth before reconciliation is forced?
- How are speculative branches garbage-collected if never reconciled?

---

## 7. State Model IR (SM-IR) — Versioned, Causally-Addressable State Graph
**Status:** `Specified`

### Architectural Intent
Define state not as a database but as a versioned, causally-addressable projection of event-derived truth. State is a DAG (StateDAG) with nodes (StateNode: payload, provenance, validity_range, causal_origin) and edges (StateTransitionEdge: from, to, triggered_by Event|Lease|LC-IR). Mutation is version expansion, not overwrite: all state is immutable once committed; mutation creates new versions with causal links. StateProjectionEngine produces StateViews — causally-filtered, time-windowed, lease-scoped subgraphs. Persistence: ephemeral (working memory, intermediate outputs) vs persistent (committed nodes, finalized outputs, validated projections).

### Requirements & Acceptance Criteria
- [ ] StateNode: state_id, payload (StructuredState), provenance (EventTrace), validity_range (TimeInterval), causal_origin (Event|Lease)
- [ ] Immutability invariant: no state is ever modified in-place — only new versions
- [ ] StateView: each lease sees causally-filtered subgraph bounded by CausalBoundary + TimeWindow
- [ ] Commit rule: state becomes persistent only if lease completes successfully AND output passes validation AND causal consistency holds
- [ ] Global consistency: all state branches converge under reconciliation OR remain explicitly labeled divergent

### Unresolved Follow-Ups
- What is the reconciliation algorithm for divergent state branches?
- How are state snapshots versioned for efficient replay?

---

## 8. Governance/Policy IR (GP-IR) — Global Invariant Enforcement Over All IR Layers
**Status:** `Specified`

### Architectural Intent
Define the system-wide rules that constrain what may be computed, instantiated, persisted, or composed across all layers. GP-IR is a constraint system over execution, state, time, and composition. If SM-IR is memory, GP-IR is law. Core invariants: no_state_mutation_in_place (I1), all_leases_have_termination_conditions (I2), all_state_has_causal_origin (I3), no_execution_without_valid_role_lease (I4), all_cross_lease_interaction_is_event_based (I5), all_composition_is_lc_ir_validated (I6). Violation response: level_1 reject_action → level_5 system_halt. Invariants are compile-time constraints over execution graphs, not runtime errors.

### Requirements & Acceptance Criteria
- [ ] Invariants: I1 no state mutation in-place, I2 all leases have termination, I3 all state has causal origin, I4 no execution without valid lease, I5 cross-lease interaction event-based, I6 composition LC-IR validated
- [ ] Role permissions: each role has allowed and denied capability sets — least privilege across computation
- [ ] PolicyEnforcer: validate every event, lease creation, state commit, composition, and timeline change
- [ ] Violation response model: reject_action → degrade_execution → suspend_lease → terminate_branch → system_halt
- [ ] Policy is a DAG — composable, not flat rules; policies can depend on other policies

### Unresolved Follow-Ups
- How are policy conflicts resolved when two policies produce contradictory constraints?
- What is the minimal policy set needed for the MVP?

---

## 9. CSG-IR + LS-IR v2 — Canonical State Graph Native Scheduler (No Heuristics)
**Status:** `Specified`

### Architectural Intent
Define LS-IR v2 as a CSG-IR-native scheduler with no heuristics — only graph legality + causality + policy constraints. Scheduling becomes graph reduction under constraints, not optimization. The scheduler builds a bipartite mapping between StateGraph nodes and RoleLeases. A binding exists IF AND ONLY IF: role compatible, causally ready (all predecessors assigned or executed), policy satisfied (GP-IR), state consistent. No scoring, no ranking — topological order + first valid assignment. Concurrency: nodes execute in parallel if no causal dependency AND no shared lease binding conflict. Formal properties: determinism (same CSG-IR + same leases → same plan), no heuristics, causal safety, policy conformity.

### Requirements & Acceptance Criteria
- [ ] Valid binding conditions: (A) role compatible, (B) causally ready, (C) policy satisfied, (D) state consistent
- [ ] No scoring: topological order + first valid assignment only
- [ ] Concurrency: nodes parallel if no causal dependency AND no shared lease binding conflict
- [ ] Deadlock: unresolved nodes deferred into FrontierSet, not skipped
- [ ] Determinism guarantee: same CSG-IR + same leases → identical execution plan

### Unresolved Follow-Ups
- What is the contract between CSG-IR (ReplayEngine output) and LS-IR v2 (scheduler input)?
- How are priority inversions handled without scoring?

---

## 10. Self-Hosting Compiler Loop — Observe, Recompile, Improve Deterministically
**Status:** `Proposed`

### Architectural Intent
Close the system loop: the system observes its own execution traces, recompiles itself, and improves deterministically. Three new components: Observation Layer (ExecutionTraceCollector captures event→lease→result chains; TraceStore accumulates execution history), Analysis Layer (GraphDeltaAnalysis computes structural changes between intent and execution; PerformanceMap identifies bottlenecks, failure clusters, under-utilized leases), Compiler Layer (uses analysis to rewrite projection rules, tune scheduler constraints, optimize lease composition). This is not an agent — it is a deterministic optimization pass over the compiler pipeline itself.

### Requirements & Acceptance Criteria
- [ ] Observation Layer: collect event→lease→result causal chains as execution traces
- [ ] Analysis Layer: compute graph deltas (intent vs execution), identify performance bottlenecks and failure clusters
- [ ] Compiler Layer: rewrite projection rules, tune scheduler constraints, optimize lease composition based on analysis
- [ ] The loop must be deterministic — same traces → same optimizations
- [ ] Optimizations must be versioned and replayable — never lose the ability to reconstruct past system behavior

### Unresolved Follow-Ups
- What safeguards prevent the self-hosting loop from introducing regressions?
- How are optimization passes validated before being applied to production execution?

---

## 11. Federated Compiler Swarm — Multi-SOCO Systems via Competition, Merger, Symbiosis
**Status:** `Proposed`

### Architectural Intent
Extend the system to multiple interacting compiler instances (swarm). Each instance runs the full LS-IR → LC-IR → TEM-IR → SM-IR → GP-IR stack. Instances interact through: competition (competing for resources, lease pools, event slices), merger (combining into larger compiler instances with shared state graphs), symbiosis (specialization where instances develop complementary roles and exchange outputs). Emergent behaviors: clustering (instances group by intent domains), specialization (instances optimize for specific role archetypes), controlled parasitic behavior (instances that optimize by consuming others' outputs). Global dynamics modeled as ecological system with population dynamics equations.

### Requirements & Acceptance Criteria
- [ ] Each swarm member must be a full LS-IR → GP-IR stack instance
- [ ] Competition: resource arbitration, lease pool partitioning, event slice claims
- [ ] Merger: two instances combine into single larger instance with shared state graph
- [ ] Symbiosis: specialized instances exchange outputs as inputs (e.g., builder → tester → deployer chain)
- [ ] Emergent clustering: instances group by intent domain without central coordination
- [ ] Parasitic behavior must be controlled — detected and isolated if detrimental

### Unresolved Follow-Ups
- What is the consensus mechanism for cross-instance state graph reconciliation?
- How are parasitic instances detected — by resource consumption patterns or output quality metrics?
- What prevents a swarm from degenerating into a monoculture where all instances converge to identical behavior?

---
