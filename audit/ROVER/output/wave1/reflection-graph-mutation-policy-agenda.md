# Harvested Specification & Code Repository

**Source:** `Reflection Graph Mutation Policy.html`
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 7 Specification Candidates extracted

---

## 1. Reflection Graph Mutation Policy v0.1
**Status:** `Agreed`

### Architectural Intent
Reflection must be prevented from becoming an uncontrolled second planner. The core move: reflection emits a typed **GraphPatch** rather than directly rewriting the graph. An Arbiter/GraphGovernor decides whether the patch lands.

### Requirements & Acceptance Criteria
- [ ] Reflection produces a `ReflectionGraphPatch`, not a direct graph rewrite
- [ ] Patch includes: `cycle_id`, `source_task_id`, `patch_scope` (local|neighborhood|global), `operations[]`, `rationale[]`, `confidence`, `requires_promotion`
- [ ] Operations are typed: `add_node`, `update_node`, `add_edge`, `update_edge`, `close_loop`, `spawn_task`, `propose_hypothesis`
- [ ] Arbiter/GraphGovernor evaluates the patch before it lands — reflection proposes, governance disposes
- [ ] Default reflection budget per completed task:
  - Update unlimited metadata on the completed task node
  - Update up to 5 nearby nodes
  - Add up to 3 edges
  - Spawn up to 2 new child tasks
  - Add up to 1 hypothesis node
  - Close up to 3 open loops
  - Touch only nodes within 2 hops of the completed task and within the same objective/workstream
- [ ] Forbidden without escalation: reparent tasks, delete nodes, merge subgraphs across objectives, reprioritize tasks outside current workstream, create new top-level objective, alter system invariants/ontology, touch more than 10 total nodes, exceed mutation score threshold

### Harvested Code Artifacts
#### Purpose: GraphPatch schema
```typescript
interface ReflectionGraphPatch {
  cycle_id: string;
  source_task_id: string;
  patch_scope: "local" | "neighborhood" | "global";
  operations: GraphPatchOp[];
  rationale: string[];
  confidence: number;
  requires_promotion: boolean;
}

type GraphPatchOp =
  | { op: "add_node"; node: GraphNode }
  | { op: "update_node"; node_id: string; changes: Partial<GraphNode> }
  | { op: "add_edge"; edge: GraphEdge }
  | { op: "update_edge"; edge_id: string; changes: Partial<GraphEdge> }
  | { op: "close_loop"; loop_id: string; resolution: string }
  | { op: "spawn_task"; task: TaskIntentRef }
  | { op: "propose_hypothesis"; hypothesis: HypothesisNode };
```

### Unresolved Follow-Ups
- Arbiter pseudocode for `evaluateReflectionPatch(patch, graph, taskContext)`?
- Where does the GraphGovernor live in the service topology — kernel, separate service, or policy engine?

---

## 2. Reflection Mutation Budget v0.1
**Status:** `Agreed`

### Architectural Intent
Quantitative "too much changed" threshold using a weighted mutation score. Not just scope — delta size determines whether reflection is inline, expanded, or escalated.

### Requirements & Acceptance Criteria
- [ ] Mutation score formula:
  ```
  mutation_score =
    1 * nodes_added +
    1 * nodes_updated +
    0.5 * edges_added +
    0.5 * edges_updated +
    2 * tasks_spawned +
    3 * hypotheses_added +
    5 * cross_objective_links +
    8 * reparent_operations +
    13 * global_priority_changes
  ```
- [ ] **Band 1 — Inline reflection** (score ≤ 8): Allowed automatically. Examples: update task outcome, add 1 follow-up task, add a note, link artifact to task
- [ ] **Band 2 — Local expansion** (8 < score ≤ 20): Allowed only if patch scope is still local or neighborhood, all touched nodes are inside same workstream/same parent objective, no reparenting of existing task trees
- [ ] **Band 3 — Promotion required** (score > 20 or patch includes structural op): Reflection stops and emits `{kind: "reflection_escalation", reason: "graph_delta_exceeded", candidate_patch, suggested_followup: "run_planning_reconciliation"}`
- [ ] Structural ops triggering Band 3: reparent, modify objective hierarchy, alter priority of unrelated tasks, merge distant graph regions, invalidate accepted plan assumptions, create more than X spawned tasks, touch nodes outside causal neighborhood

### Harvested Code Artifacts
#### Purpose: Mutation score bands
```
Band 1 — Inline           score ≤ 8      auto-allowed
Band 2 — Local Expansion  8 < score ≤ 20 conditional
Band 3 — Promotion        score > 20     escalate to planning
```

### Unresolved Follow-Ups
- Should the weight constants be configurable per-system or hardcoded?
- Are there feedback loops where repeated Band-2 reflections slowly accumulate to Band-3 levels undetected?

---

## 3. Reflection Scope Tiers v0.1
**Status:** `Agreed`

### Architectural Intent
Hard cap on how far from the triggering task reflection may reach. A reflection pass should mostly operate in the causal neighborhood of the task that just completed.

### Requirements & Acceptance Criteria
- [ ] **Tier A — Local patch** (default, cheap, always allowed): Radius = 1 hop from completed task. Touch only: the task node itself, artifacts produced, immediate predecessor/successor nodes, open loops explicitly linked to the task, at most N new tasks inferred from completion
- [ ] **Tier B — Neighborhood patch** (allowed if evidence is strong): Radius = 2 hops, but only within the same workstream/objective/episode. Can touch: local neighborhood plus siblings under the same parent objective, tasks sharing same resource/file/workstream/user request, nodes linked through "same unresolved issue" or "same hypothesis"
- [ ] **Tier C — Global patch** (rare, escalation only): Never happen inline in ordinary task reflection. Emits a promotion candidate for a separate maintenance/planning cycle. Would be used for: reclassify prior tasks, merge duplicate subgraphs across workstreams, revise major assumption in plan, spawn new objective tree, rewrite priorities globally, change ontology or invariants

### Harvested Code Artifacts
#### Purpose: Scope tiers
```
Tier A — Local        radius=1  always allowed
Tier B — Neighborhood radius=2  same workstream/objective
Tier C — Global        ∞        escalation only, separate planning cycle
```

### Unresolved Follow-Ups
- How to detect workstream/objective boundaries programmatically?
- Should the Arbiter expose a `causal_neighborhood(task, radius)` query?

---

## 4. Causal Neighborhood Test v0.1
**Status:** `Agreed`

### Architectural Intent
Before a reflection patch lands, ask: "Can every touched node be explained by the task that just ran?" This prevents reflection from wandering into unrelated parts of the graph.

### Requirements & Acceptance Criteria
- [ ] A touched node is allowed if it satisfies at least one of:
  - It is the task itself
  - It is an artifact/input/output directly attached to the task
  - It is within `k` hops of the task in the active workstream subgraph
  - It shares the same parent objective/episode/conversation turn cluster
  - It was explicitly referenced during execution or in the result artifact
- [ ] Governor rule:
  ```typescript
  if touched_node not in causal_neighborhood(task, radius=2):
    require_promotion = true
  ```
- [ ] Distinguish **observational updates** (safe, cheap, reflection can do freely) from **structural changes** (dangerous, require promotion):
  - Safe: attach evidence/artifact, mark task status/result, update confidence scores, record discovery, add note/hypothesis, add follow-up task suggestion, mark open loop resolved/still-open
  - Dangerous: changing parent/child relationships, reprioritizing unrelated work, rewriting goals, merging nodes across distant contexts, invalidating plan branches, deleting nodes, changing ontology/semantic type, bulk deduping/collapsing task trees

### Harvested Code Artifacts
#### Purpose: Causal neighborhood governor
```typescript
if touched_node not in causal_neighborhood(task, radius=2):
  require_promotion = true
```

### Unresolved Follow-Ups
- What is the causal neighborhood query performance at graph scale (thousands of nodes)?
- Should the radius be dynamic based on task complexity?

---

## 5. Reflection/Planning Boundary Contract v0.1
**Status:** `Agreed`

### Architectural Intent
Clean architectural split between reflection and planning: **Reflection = micro-repair + local inference**, **Planning/Reconciliation = structural graph change**. This boundary keeps reflection useful without letting it become a runaway graph mutator.

### Requirements & Acceptance Criteria
- [ ] Reflection cycle's job: what happened? what nearby assumptions changed? what immediate follow-up is now required? did this close or open a loop?
- [ ] Planning/reconciliation cycle's job: does the objective tree need reshaping? should priorities move? are these two workstreams actually one? did this execution result invalidate the broader plan?
- [ ] Escalate to planning/reconciliation when any of:
  - `mutation_score > 20`
  - Touched nodes cross objective boundary
  - More than 2 follow-up tasks are implied
  - A core assumption of the current plan is invalidated
  - Reflection wants to modify already-approved roadmap structure
  - Reflection confidence is low but impact is high
- [ ] Summary heuristic: A reflection cycle may only commit low-cost observational and local structural updates within the causal neighborhood of the triggering task; any patch that crosses workstream boundaries, spawns substantial new work, or changes existing graph topology must be promoted to a separate reconciliation/planning pass

### Harvested Code Artifacts
#### Purpose: Split definition
```
Reflection cycle  = micro-repair + local inference
                  → what happened? nearby assumptions changed? follow-up required?
Planning cycle    = structural graph change
                  → objective tree reshaping? priority moves? workstream merging?
```

### Unresolved Follow-Ups
- Who owns the planning/reconciliation cycle execution — the Scheduler, a dedicated Planner agent, or the Kernel?
- How does the escalation handoff work — is it an event, a queued task, or a direct API call?

---

## 6. Reflection Task Spawn Heuristic v0.1
**Status:** `Agreed`

### Architectural Intent
The most dangerous thing reflection does is not editing edges — it is **creating work**. Task spawning must have a dedicated cap separate from graph mutation. Reflection must never auto-spawn top-level objectives.

### Requirements & Acceptance Criteria
- [ ] Per completed task, reflection may:
  - Auto-spawn **0–2 child follow-up tasks** (allowed inline)
  - Auto-spawn **up to 1 sibling repair task** (allowed inline)
  - **Never** auto-spawn a new top-level objective
  - **Never** auto-spawn more than `spawn_budget_per_cycle`
- [ ] If reflection thinks 8+ new tasks are implied, that is a signal for a planning pass, not inline reflection
- [ ] Task spawning is measured separately from graph mutation in the mutation budget

### Harvested Code Artifacts
#### Purpose: Spawn budget
```
Per completed task:
  auto-spawn 0-2 child follow-up tasks
  auto-spawn up to 1 sibling repair task
  NEVER auto-spawn new top-level objective
  NEVER exceed spawn_budget_per_cycle
  8+ implied tasks → planning pass, not reflection
```

### Unresolved Follow-Ups
- How does reflection detect that 8 tasks are "implied" vs explicitly spawning them?
- Should the spawn budget be reset per reflection cycle or per task?

---

## 7. Surprise Threshold Model v0.1
**Status:** `Agreed`

### Architectural Intent
Reflection exists because execution reveals reality, but some revelations are bigger than others. A "surprise threshold" prevents a small post-task reflection loop from silently rearchitecting the roadmap.

### Requirements & Acceptance Criteria
- [ ] Every reflection output should estimate three signals:
  - **Outcome deviation**: how far actual result diverged from expected result
  - **Plan impact**: how many downstream tasks/objectives are affected
  - **Confidence**: how certain the inference is
- [ ] If `outcome_deviation >= HIGH && downstream_impact >= MEDIUM` → emit `ReplanRequired` event
- [ ] This prevents reflection from trying to "fix it itself" when the result fundamentally changes the plan
- [ ] High deviation × high impact should always escalate, never be absorbed by reflection

### Harvested Code Artifacts
#### Purpose: Surprise threshold rule
```typescript
if outcome_deviation >= HIGH && downstream_impact >= MEDIUM:
  emit ReplanRequired
```

### Unresolved Follow-Ups
- How are outcome_deviation, plan_impact, and confidence measured quantitatively?
- Who handles the ReplanRequired event — the Planner, the Scheduler, or an escalation queue?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Reflection Graph Mutation Policy | Agreed | GraphPatch, Arbiter, default budget |
| 2 | Reflection Mutation Budget | Agreed | Weighted score, 3 bands (Inline/Local/Promotion) |
| 3 | Reflection Scope Tiers | Agreed | Tier A/B/C with radius 1/2/∞ |
| 4 | Causal Neighborhood Test | Agreed | Governor for inline vs promotion |
| 5 | Reflection/Planning Boundary | Agreed | Split: micro-repair vs structural change |
| 6 | Task Spawn Heuristic | Agreed | Spawn budget, forbidden top-level objectives |
| 7 | Surprise Threshold Model | Agreed | Deviation × impact → ReplanRequired |

---

*Extracted from `chats/Reflection Graph Mutation Policy.html`, 14 chunks processed. Rover pipeline: BS4 → chunk → architect extraction → compiled.*
