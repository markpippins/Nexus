# Harvested Specification & Code Repository

**Source:** `sample/Strontium as cognition node.html`
**Chunks processed:** 1  **Failed:** 0
**Total candidates:** 10

---

## NEBULA GRAPH CONTRACT v0.1 (Absorb → Graph IR)
**Status:** `Proposed`

### Architectural Intent
Define a canonical graph contract that maps Absorb IR into a queryable, stable property graph in Nebula. This establishes the system's "truth layer" — a versioned, provenance-tracked knowledge graph where all cognitive components (Rover, Absorb, Voyager) terminate into a queryable and stable substrate.

### Requirements & Acceptance Criteria
- [ ] Every graph element (node, edge, cluster) must reference its originating Rover signal lineage
- [ ] Append + version semantics: nodes/edges are never mutated in place; new versions are appended
- [ ] Support three query modalities: structural (path), semantic (embedding/label), and provenance (origin trace)
- [ ] Clusters as first-class subgraph entities with their own provenance
- [ ] Voyager generates "Graph Projection Plans" — read-only projections; a separate Graph Committer is the sole write authority

### Harvested Code Artifacts

#### Purpose: Canonical Node, Edge, and Cluster schema definitions
```json
// Node schema
{
  "id": "uuid",
  "type": "entity | concept | system | artifact | cluster | event",
  "label": "human readable",
  "properties": { "key": "value" },
  "provenance": {
    "source_signal": "rover_signal_id",
    "absorbed_at": "timestamp",
    "absorb_version": 1
  }
}

// Edge schema
{
  "from": "node_id",
  "to": "node_id",
  "type": "contains | references | derives | implements",
  "weight": 0.0 - 1.0,
  "provenance": {
    "source_signal": "rover_signal_id"
  }
}

// Cluster schema (first-class subgraph)
{
  "cluster_id": "uuid",
  "member_nodes": ["node_id"],
  "cluster_label": "semantic grouping",
  "provenance": {}
}
```

### Unresolved Follow-Ups
- How to handle graph sharding when Nebula exceeds single-machine capacity?
- Conflict resolution strategy for concurrent Absorb → Graph Committer writes

---

## STRONTIUM TASK DAEMON SPEC (STDS v0.1)
**Status:** `Agreed`

### Architectural Intent
Strontium is the deterministic execution runtime — not an agent framework. It accepts structured Task Envelopes, executes them in bounded loops with an LLM as a step function, maintains durable intermediate state (checkpoints), and produces verifiable artifacts. The design explicitly separates execution authority from planning intent.

### Requirements & Acceptance Criteria
- [ ] Task IR: structured task envelopes with type, constraints, context, expected_output, checkpoint_policy
- [ ] Bounded execution: `for step in 0..max_steps` loop with explicit termination conditions
- [ ] Structured step output: `{"status": "continue | complete | fail", "actions": [...], "artifacts_created": [...]}`
- [ ] Append-only checkpointing every N steps (default 3), plus on any tool execution or failure
- [ ] Sandboxed tooling: fs.write, shell.exec, http.get — no dynamic tool injection
- [ ] Priority scheduling with aging factor, dependency unlock bonus, and failure penalty
- [ ] Failure classification: recoverable → retry (max 3, exponential backoff), terminal → report, unknown → escalate

### Harvested Code Artifacts

#### Purpose: Task Envelope (canonical contract)
```json
{
  "task_id": "uuid",
  "created_at": "timestamp",
  "priority": 0-10,
  "type": "analysis | transform | build | crawl | synthesize | repair",
  "objective": "human-readable intent",
  "constraints": {
    "max_steps": 50,
    "max_tokens_per_step": 4096,
    "time_budget_sec": 3600,
    "allowed_tools": ["fs", "shell", "http", "git"]
  },
  "context": {
    "inputs": [],
    "references": [],
    "working_directory": "/strontium/work/<task_id>/"
  },
  "expected_output": {
    "format": "json | files | report | mixed",
    "schema": null
  },
  "checkpoint_policy": {
    "frequency": "every_step | every_n_steps",
    "n": 3
  }
}
```

#### Purpose: Step Output Format (STRICT — no free-form responses allowed)
```json
{
  "status": "continue | complete | fail",
  "intent_update": "optional refinement of plan",
  "actions": [
    {
      "tool": "fs.write | shell.exec | http.get",
      "args": {}
    }
  ],
  "reasoning_summary": "short internal state summary",
  "artifacts_created": [],
  "next_focus": ""
}
```

#### Purpose: Persistent task state model
```json
{
  "task_id": "...",
  "step": 7,
  "memory": {
    "plan": [],
    "decisions": [],
    "observations": [],
    "errors": []
  },
  "artifacts": [
    {
      "id": "file/hash",
      "type": "file | log | json | graph",
      "path": "/work/.../artifact.json"
    }
  ],
  "last_llm_output": {},
  "status": "running | paused | completed | failed"
}
```

### Unresolved Follow-Ups
- Supervisor integration: how Nexus/Titanium injects tasks, modifies priorities, inspects state graphs
- Task forking into subgraphs — partial implementation vs fork semantics

---

## VOYAGER QUERY LANGUAGE (VQL v0.1)
**Status:** `Proposed`

### Architectural Intent
VQL is a declarative, procedural DSL for constrained graph traversals over Nebula. It allows Voyager to perform semantic reasoning, hypothesis generation, and graph exploration without write permissions. The language is pipeline-based: SELECT → TRAVERSE → FILTER → HYPOTHESIZE → SCORE → PROJECT. All operations are read-only; hypotheses are ephemeral and provenance-tracked.

### Requirements & Acceptance Criteria
- [ ] Pipeline syntax with six sequential stages
- [ ] Semantic operators: EXPAND, CONTRAST, BRIDGE, ANCHOR — "thinking verbs" operating on graph sub-structures
- [ ] Three invariants enforced at the compiler/execution layer: no mutation, ephemeral hypotheses, provenance-first reasoning
- [ ] SCORE stage orders hypotheses by structural evidence (path density, connectivity metrics)
- [ ] PROJECT stage produces a Graph Projection Plan (GPP) — a read-only summary for downstream consumption

### Harvested Code Artifacts

#### Purpose: VQL pipeline syntax illustration
```sql
SELECT concept WHERE type = "entity" AND label ~= "strontium"
TRAVERSE contains, references DEPTH 3
FILTER WHERE weight > 0.3
HYPOTHESIZE USING EXPAND, BRIDGE
SCORE BY path_density, connectivity
PROJECT AS graph_projection
```

### Unresolved Follow-Ups
- VQL compiler: lex → parse → validate → plan → execute pipeline still needs concrete implementation
- How BRIDGE generates synthetic edges between disconnected but semantically similar subgraphs?
- VQL query optimization for large graphs (indexing strategy)

---

## STRONTIUM BOOTSTRAP SPEC v0.1
**Status:** `Agreed`

### Architectural Intent
Define the self-initializing cognition sequence. Starting from an empty state (only the Strontium runtime and the model exist), the INIT_TASK triggers the first rover_probe. Rover emits primitive signals (structure hints for the filesystem), Absorb formalizes them into a filesystem-based graph in Nebula, and the loop begins. This is the "axiom of self-initializing cognition."

### Requirements & Acceptance Criteria
- [ ] INIT_TASK: the first task that bootstraps the system from zero state
- [ ] rover_probe: emits primitive signals capturing filesystem structure (directories, files, sizes, types)
- [ ] Absorb creates entities as "artifact" nodes; early relations restricted to "contains" (filesystem hierarchy)
- [ ] Phase 1: simple filesystem mirror in Nebula
- [ ] Phase 2: Voyager analyzes the graph, identifies semantic clusters, generates hypotheses → triggers Phase 2 transition

### Harvested Code Artifacts

#### Purpose: Minimal implementation plan — persistence layer
```python
# nebula_nodes.jsonl — append-only node storage
# nebula_edges.jsonl — append-only edge storage
# Each line is a JSON object; never delete or rewrite lines.

def append_node(node: dict, path: str = "nebula_nodes.jsonl"):
    with open(path, "a") as f:
        f.write(json.dumps(node) + "\n")

def append_edge(edge: dict, path: str = "nebula_edges.jsonl"):
    with open(path, "a") as f:
        f.write(json.dumps(edge) + "\n")
```

#### Purpose: Main daemon loop (strontiumd.py)
```python
# Pseudocode for the Strontium daemon
while True:
    Rover.perceive()          # scan filesystem, emit signals
    Absorb.structure(signals) # build graph IR from signals
    Commit.write(graph_delta) # append nodes/edges to Nebula
    Voyager.traverse()        # BFS traversal (Phase 1)
    sleep(interval)
```

### Unresolved Follow-Ups
- How the INIT_TASK is triggered — manual CLI command, systemd timer, or self-triggering?
- Phase 1 → Phase 2 transition criteria: what specific graph metrics trigger the shift?

---

## VOYAGER COMPILER SPEC
**Status:** `Proposed`

### Architectural Intent
Transition Voyager from a simple BFS graph walker to a compiled query engine. The compiler pipeline: lex (tokenize VQL), parse (produce AST), validate (semantic checks, enforce read-only invariant), plan (optimize traversal order), execute (run against Nebula), and reason (LLM-backed hypothesis engine with grounded context).

### Requirements & Acceptance Criteria
- [ ] Lexer produces token stream from VQL text
- [ ] Parser produces AST with Select, Traverse, Filter, Hypothesize, Score, Project nodes
- [ ] Validator enforces: no mutation operations, valid node/edge type references, bounded depth
- [ ] Planner optimizes traversal order using graph statistics
- [ ] Executor runs read-only against Nebula with strict access controls
- [ ] Hypothesis engine: grounds LLM reasoning with specific subgraph context, enforced by structured I/O contracts

### Harvested Code Artifacts

#### Purpose: AST node definitions for the VQL compiler pipeline
```python
class SelectNode:
    entity_type: str
    label_pattern: str | None

class TraverseNode:
    edge_types: list[str]
    max_depth: int

class FilterNode:
    conditions: list[dict]  # {field, operator, value}

class HypothesizeNode:
    operators: list[str]    # EXPAND, CONTRAST, BRIDGE, ANCHOR

class ScoreNode:
    metrics: list[str]      # path_density, connectivity, etc.

class ProjectNode:
    format: str             # graph_projection, report
```

### Unresolved Follow-Ups
- LLM context window management when subgraphs are large — chunking strategy needed
- Query plan caching for repeated VQL queries

---

## CHECKPOINT & REPLAY ENGINE
**Status:** `Agreed`

### Architectural Intent
Implement event-sourced cognition. Every action — perception (Rover), structure building (Absorb), reasoning (Voyager) — is logged as a deterministically replayable checkpoint. This enables: forkable execution (branch from any checkpoint), deterministic replay (audit/debug), cognitive event-sourcing (full history preserved).

### Requirements & Acceptance Criteria
- [ ] Append-only checkpoint store (one JSONL file per task)
- [ ] Checkpoint captures: full state snapshot, last valid LLM output, tool execution results, error trace
- [ ] Checkpoint triggers: every N steps, any tool execution batch, any failure/retry, task completion
- [ ] Replay: load state from checkpoint N, re-execute from that point
- [ ] Fork: copy checkpoint N, create new task_id, diverge from that state

### Harvested Code Artifacts

#### Purpose: Checkpoint Record (append-only log entry)
```json
{
  "seq": 7,
  "timestamp": "iso8601",
  "step": 7,
  "state_snapshot": { "...": "full state at this point" },
  "llm_output": { "status": "continue", "actions": [] },
  "tool_results": [],
  "error": null,
  "artifacts": ["/strontium/work/task_xyz/artifact_7.json"]
}
```

### Unresolved Follow-Ups
- Storage overhead of full state snapshots — incremental/delta snapshots?
- Replay of LLM calls: deterministic only if temperature=0 or if response is cached

---

## LLM-IN-THE-LOOP REASONING (Grounded)
**Status:** `Proposed`

### Architectural Intent
Upgrade Voyager to perform grounded reasoning using an LLM (Qwen3:4b). Rather than free-form generation, the LLM receives a specific subgraph slice from Nebula as context, with strict system prompts and structured I/O contracts. The LLM reasons about the graph but cannot mutate it — all write operations are gated through Absorb → Graph Committer.

### Requirements & Acceptance Criteria
- [ ] Subgraph extraction: given a VQL query result, extract a bounded subgraph for LLM context
- [ ] Structured prompt: system prompt enforces "reason from evidence, cite node/edge IDs, propose hypotheses with provenance"
- [ ] Structured output contract: LLM returns JSON with hypothesize, evidence (node IDs), confidence
- [ ] No graph mutation from the reasoning layer — all proposed changes are queued as proposed_deltas (not auto-applied)

### Harvested Code Artifacts

#### Purpose: Grounded reasoning system prompt for Qwen3:4b
```
You are a graph reasoning engine operating over a Nebula knowledge graph.
You receive a subgraph slice with nodes and edges.

Rules:
1. Reason only from the provided subgraph evidence.
2. Cite specific node IDs and edge types for every claim.
3. Propose hypotheses with a confidence score (0.0-1.0) and evidence list.
4. Do not hallucinate nodes, edges, or properties not present in the context.
5. Output valid JSON matching the ReasoningResult schema exactly.
```

#### Purpose: ReasoningResult structured output schema
```python
class ReasoningResult(BaseModel):
    hypotheses: list[Hypothesis]
    
class Hypothesis(BaseModel):
    statement: str           # the proposed insight
    confidence: float        # 0.0 - 1.0
    evidence_nodes: list[str]  # node IDs supporting this
    evidence_edges: list[str]  # edge IDs supporting this
    proposed_deltas: list[dict] # optional graph changes (queued, not applied)
```

### Unresolved Follow-Ups
- Token budget management for large subgraphs — when to summarize vs include full detail
- Confidence calibration: how to evaluate whether the LLM's confidence scores are meaningful

---

## MULTI-ROVER EXPLORATION POLICY
**Status:** `Proposed`

### Architectural Intent
Shift from passive filesystem scanning to autonomous exploration. Different Rover roles (Seeder, Explorer, Anomaly) use graph uncertainty and connectivity metrics to prioritize exploration targets. The system develops "cognitive asymmetry" — attention bias and curiosity gradients — rather than exploring uniformly.

### Requirements & Acceptance Criteria
- [ ] Seeder Rover: performs initial scan of a target area, creates baseline nodes
- [ ] Explorer Rover: follows high-uncertainty paths, expands frontier based on connectivity gaps
- [ ] Anomaly Rover: re-probes nodes with stale provenance or conflicting edge weights
- [ ] Exploration priority = f(uncertainty_score, last_probed_age, connectivity_gap)

### Unresolved Follow-Ups
- How to avoid exploration loops where two Rovers chase each other's uncertainty?
- Budget allocation between Seeder, Explorer, and Anomaly roles

---

## MEMORY CONSOLIDATION LAYER
**Status:** `Proposed`

### Architectural Intent
Transform raw, noisy graph data into stable semantic concepts. A periodic consolidation pass: merges redundant nodes (same entity described multiple times), collapses subgraphs into higher-level abstractions, prunes weak/low-confidence signals. Creates a "breathing" graph that expands during exploration and compresses during consolidation.

### Requirements & Acceptance Criteria
- [ ] Node merging: identify nodes that represent the same real-world entity, merge properties
- [ ] Subgraph collapse: when a cluster of nodes consistently appears, create a single "concept" node with provenance links
- [ ] Signal pruning: edges with weight < threshold and age > staleness_threshold are candidates for removal
- [ ] Consolidation runs on a schedule (not per-cycle) to avoid interfering with active exploration

### Unresolved Follow-Ups
- Merge conflict resolution when properties disagree between duplicate nodes
- Threshold tuning: what weight and age thresholds for pruning?

---

## TIME-TRAVEL VISUALIZATION (Graph State Frames)
**Status:** `Proposed`

### Architectural Intent
Add a temporal observation layer: capture snapshots of the Nebula graph at configurable intervals (Graph State Frames). This makes the system's cognitive process observable, inspectable, and replayable. Users can replay the evolution of the graph's structure over time, inspect delta-based state changes, and understand why the system reached its current conclusions.

### Requirements & Acceptance Criteria
- [ ] Periodic snapshot capture of the full graph state (or delta from previous frame)
- [ ] Frame metadata: timestamp, active task_ids, rover probe count, node/edge count, consolidation events
- [ ] Replay UI: step forward/backward through frames, highlight changes between frames
- [ ] Delta view: show what was added/removed/modified between consecutive frames

### Unresolved Follow-Ups
- Storage strategy for frames — full snapshots vs incremental deltas
- Visualization: what UI (web dashboard, CLI tool, exported report)?

---

## AUTONOMOUS GOAL SYSTEM
**Status:** `Proposed`

### Architectural Intent
The final threshold: transition from reactive cognition (responding to user-placed files and explicit queries) to self-directed cognition (the system generates its own exploration objectives). Goals are derived from graph gaps — areas of low connectivity, unverified hypotheses, stale nodes, or emergent semantic clusters that haven't been formalized yet.

### Requirements & Acceptance Criteria
- [ ] Goal extraction: scan Nebula for epistemic gaps, formulate exploration objectives
- [ ] Goal prioritization: score by potential information gain, current graph uncertainty, and resource budget
- [ ] Goal → Task translation: each goal spawns a Strontium Task Envelope targeting the gap
- [ ] Human-in-the-loop override: ability to inspect, approve, reject, or reprioritize auto-generated goals

### Unresolved Follow-Ups
- Goal safety: what guardrails prevent the system from exploring infinite loops or destructive paths?
- Human review cadence: continuous oversight vs periodic batch review?

---
