# Cognitive Runtime Flow

> Mermaid diagrams for the Python cognitive runtime pipeline:
> **NBK** (causal graph kernel) → **IR** (typed execution semantics) → **Cascade** (event bus) → **MEEP** (deterministic prompt→CER pipeline).

---

## 1. Architecture Overview

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555',
  'lineColor': '#666'
}}}%% 

graph TB
    %% ===== STYLES =====
    classDef nbk fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd
    classDef ir fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd
    classDef cascade fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef meep fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef data fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef external fill:#2d2d2d,stroke:#888,stroke-width:2px,color:#ccc

    %% ===== EXTERNAL INPUTS =====
    subgraph EXT["External Inputs"]
        PROMPT("📝 Raw Prompt<br/><small>Text from user / CLI</small>"):::external
        EVENTS_DIR("📂 events/ directory<br/><small>JSON event files on disk</small>"):::external
        NATS_IN("📡 NATS subjects<br/><small>nexus.cascade.v1.*</small>"):::external
    end

    %% ===== NBK LAYER =====
    subgraph NBK_LAYER["NBK — Nexus Bootstrap Kernel"]
        direction TB
        NBK_CORE("NexusBootstrapKernel<br/><small>Causal graph executor</small>"):::nbk
        NBK_P1("P1 · NODE<br/><small>pure transformation</small>"):::nbk
        NBK_P2("P2 · EDGE<br/><small>causal constraint</small>"):::nbk
        NBK_P3("P3 · TRACE<br/><small>replay substrate</small>"):::nbk
        NBK_P4("P4 · LEASE<br/><small>distributed execution</small>"):::nbk
        NBK_P5("P5 · ADDRESS<br/><small>CAL addressing</small>"):::nbk
        NBK_RULES("Mutation Rules<br/><small>CollapseChainRule<br/>MergeIdleLeasesRule</small>"):::nbk
        NBK_QUERY("SCQL Query<br/><small>predicate-based graph query</small>"):::nbk
    end

    %% ===== IR LAYER =====
    subgraph IR_LAYER["IR — Typed Execution Semantics<br/><small>4 sub-layers</small>"]
        direction TB

        subgraph SM_IR["SM-IR: State Memory"]
            DAG("StateDAG<br/><small>versioned causal state DAG</small>"):::ir
            SV("StateVersion<br/><small>immutable snapshots</small>"):::ir
            SVIEW("StateView<br/><small>read-optimized projections</small>"):::ir
            SREPLAY("StateReplayEngine<br/><small>replay events → StateDAG</small>"):::ir
        end

        subgraph TEM_IR["TEM-IR: Temporal Causality"]
            CE("CausalEvent<br/><small>promoted CEREvent</small>"):::ir
            CG("CausalGraph<br/><small>typed causal edges</small>"):::ir
            TM("TimeModel<br/><small>3-layer time (event, lease, epoch)</small>"):::ir
            TA("TemporalAnnotator<br/><small>annotates events with time</small>"):::ir
        end

        subgraph RL_IR["RL-IR: Role Leasing"]
            RL("RoleLease<br/><small>capability-gated lease</small>"):::ir
            EP("EventProjection<br/><small>projected event views</small>"):::ir
            IG("IntentGraph<br/><small>intent DAG</small>"):::ir
            LC("LeaseCompiler<br/><small>compile leases from roles</small>"):::ir
            PG("ProvenanceGraph<br/><small>event provenance DAG</small>"):::ir
        end

        subgraph LS_IR["LS-IR: Lifecycle Scheduling"]
            WS("WorkSurface<br/><small>indexed intent surface</small>"):::ir
            LP("LeasePool<br/><small>idle/active/preempt</small>"):::ir
            AE("ArbitrationEngine<br/><small>weighted scoring (α·fit + β·load + γ·pri)</small>"):::ir
            DISP("Dispatcher<br/><small>binds events → leases</small>"):::ir
            SCHED("Scheduler<br/><small>poll → arbitrate → dispatch loop</small>"):::ir
            PR("PromotionReceipt<br/><small>cross-layer promotion audit</small>"):::ir
        end
    end

    %% ===== CASCADE LAYER =====
    subgraph CASCADE_LAYER["Cascade — Pure Event Bus"]
        direction TB
        CASCADE_MAIN("main.py<br/><small>ingest → validate → publish loop</small>"):::cascade
        CASCADE_VALID("validators/events.py<br/><small>structural event validation</small>"):::cascade
        CASCADE_NATS("nats_publisher.py<br/><small>NATS sidecar + JetStream</small>"):::cascade
        CASCADE_ENV("envelope_adapter.py<br/><small>→ CanonicalEnvelope</small>"):::cascade
        CASCADE_INF("inference_subscriber.py<br/><small>NATS → Tackle inference bridge</small>"):::cascade
    end

    %% ===== MEEP LAYER =====
    subgraph MEEP_LAYER["MEEP — Minimal End-to-End Pipeline<br/><small>6-station deterministic pipeline</small>"]
        direction TB

        S1("Station 1: IRL Classifier<br/><small>keyword heuristic → probability distribution</small>"):::meep
        S2("Station 2: IR Resolver<br/><small>argmax → deterministic archetype</small>"):::meep
        S3("Station 3: Spec Compiler<br/><small>template → WorkRequestGraph (DAG)</small>"):::meep
        S4("Station 4: Lowering Pass<br/><small>freeze boundary → ExecutionGraph</small>"):::meep
        S5("Station 5: Scheduler<br/><small>topological walk → CER event log</small>"):::meep
        S6("Station 6: Replay Engine<br/><small>pure reducer → ExecutionState</small>"):::meep
    end

    %% ===== DATA STORES =====
    subgraph DATA["Data Stores"]
        EVENT_STORE("events/ directory<br/><small>JSON event files</small>"):::data
        CER_LOG("CER Event Log<br/><small>hash-chained append-only</small>"):::data
        NBK_SNAPSHOT("Kernel Snapshot<br/><small>serialisable state</small>"):::data
    end

    %% ===== CROSS-CUTTING =====
    subgraph SHARED["Shared Types"]
        CAL("CAL Address<br/><small>cal://realm/graph/traj/node/ver</small>"):::data
        PROMPT_IR("PromptIR<br/><small>structured prompt analysis</small>"):::data
        CONSTRAINTS("ConstraintSet<br/><small>system invariants</small>"):::data
    end

    %% ===== CONNECTIONS =====
    PROMPT -->|"python -m meep.cli"| S1
    S1 -->|"IRLResult (probabilities)"| S2
    S2 -->|"IRSelection (archetype)"| S3
    S3 -->|"WorkRequestGraph (mutable)"| S4
    S4 -->|"ExecutionGraph (frozen)"| S5
    S5 -->|"CERLog (append-only)"| S6
    S6 -->|"ExecutionState (reconstructed)"| PROMPT_IR

    S5 -.->|"events"| CER_LOG
    S6 -.->|"replay → StateDAG"| DAG

    %% IR internal flow
    CE -->|"promoted from CEREvent"| WS
    WS -->|"unassigned events"| AE
    AE -->|"scored leases"| DISP
    DISP -->|"DispatchEvent"| SCHED
    LP -.->|"idle leases"| AE
    LP -.->|"acquire/release"| DISP
    SCHED -->|"telemetry"| EP

    %% NBK flows
    NBK_CORE -->|"uses"| NBK_P1
    NBK_CORE -->|"uses"| NBK_P2
    NBK_CORE -->|"records"| NBK_P3
    NBK_CORE -->|"schedules"| NBK_P4
    NBK_CORE -->|"addresses"| NBK_P5
    NBK_CORE -->|"mutates via"| NBK_RULES
    NBK_CORE -->|"queries via"| NBK_QUERY
    NBK_CORE --> NBK_SNAPSHOT

    %% NBK → IR bridge
    NBK_CORE -.->|"edges → CausalEdge"| CG
    NBK_CORE -.->|"traces → replay"| SREPLAY

    %% Cascade flows
    EVENTS_DIR -->|"poll every 2s"| CASCADE_MAIN
    CASCADE_MAIN -->|"validated events"| CASCADE_VALID
    CASCADE_MAIN -->|"publish"| CASCADE_NATS
    CASCADE_NATS -->|"CanonicalEnvelope"| CASCADE_ENV
    CASCADE_MAIN -.->|"write offset"| EVENT_STORE
    NATS_IN -->|"subscribe"| CASCADE_INF
    CASCADE_INF -->|"InferenceCompleted"| CASCADE_NATS

    %% MEEP → IR bridge
    S6 -.->|"replay_to_dag()"| SREPLAY
    S5 -.->|"CEREvent → CausalEvent.from_cer_event()"| CE
```

---

## 2. NBK — Causal Graph Execution Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef graph fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd
    classDef exec fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd
    classDef trace fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef lease fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef query fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef rules fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee
    classDef cli fill:#2d2d2d,stroke:#888,stroke-width:2px,color:#ccc

    subgraph BUILD["Graph Construction"]
        ADD_NODE("add_node(id, fn, **metadata)<br/><small>registers computation node</small>"):::graph
        ADD_EDGE("add_edge(from_id, to_id)<br/><small>causal dependency (cycle-checked)</small>"):::graph
        NODES("NodeDef{id, fn, metadata}"):::graph
        EDGES("Edge{from_id, to_id}"):::graph
        CYCLE("Cycle detection (BFS)<br/><small>would_cycle() safeguards</small>"):::graph
    end

    subgraph EXECUTION["Execution Engine"]
        SCHED_LEASE("schedule_leases(executors, strategy)<br/><small>round_robin or first-available</small>"):::exec
        READY("ready_nodes()<br/><small>deps met + lease valid + not yet computed</small>"):::exec
        RESOLVE("resolve_inputs(node_id)<br/><small>gather upstream outputs</small>"):::exec
        EXEC("execute_ready_nodes()<br/><small>topological tick → sorted(batch)</small>"):::exec
        EXEC_ONE("_execute_one(node_id)<br/><small>nd.fn(inputs) → output stored</small>"):::exec
    end

    subgraph TRACE_LOG["Trace Log"]
        TRACE("Trace{sequence, node_id, input_state, output_state, timestamp}"):::trace
        REPLAY("replay()<br/><small>walk traces in order → reconstruct state</small>"):::trace
        SNAPSHOT("snapshot()<br/><small>serialisable: nodes, edges, states, traces, leases</small>"):::trace
        RESET("reset()<br/><small>clear state, preserve graph structure</small>"):::trace
    end

    subgraph LEASES["Lease Management"]
        LEASE("Lease{node_id, executor_id, issued_at}"):::lease
        L_SCHED("schedule_leases()<br/><small>assign all unleased nodes</small>"):::lease
        L_ADD("add_lease(node_id, executor_id)<br/><small>manual binding</small>"):::lease
        L_VALID("lease_valid(node_id)<br/><small>check binding exists</small>"):::lease
    end

    subgraph QUERY["SCQL Query"]
        SCQL("query(predicate)<br/><small>filter by node_id, state, lease, deps</small>"):::query
        SCQL_EXAMPLE("Nodes with large state<br/>Nodes by lease assignment<br/>Uncomputed nodes"):::query
    end

    subgraph MUTATION["Self-Modification (SOCO)"]
        MUTATE("mutate(rule)<br/><small>apply rule → affected node list</small>"):::rules
        COLLAPSE("CollapseChainRule<br/><small>fuse A→B→C into single node</small>"):::rules
        MERGE("MergeIdleLeasesRule<br/><small>consolidate idle leases</small>"):::rules
    end

    subgraph CLI["CLI Entrypoints"]
        CLI_RUN("nbk run<br/><small>execute ETL pipeline example</small>"):::cli
        CLI_INFO("nbk info<br/><small>graph structure + dependencies</small>"):::cli
        CLI_DOT("nbk dot<br/><small>DOT graph for visualization</small>"):::cli
        CLI_SCQL("nbk scql<br/><small>predicate queries on state</small>"):::cli
    end

    subgraph ADDRESS["CAL Addressing"]
        CAL_ADDR("make_address(realm, graph, trajectory, node_id, version)<br/><small>cal://realm/graph/traj/node/ver</small>"):::query
        PARSE("parse_address(address)<br/><small>→ {realm, graph, trajectory, node_id, version}</small>"):::query
        ADDR_OF("address_of(node_id)<br/><small>cal://dev/example-etl/t0/extract/hash</small>"):::query
    end

    %% Flow edges
    ADD_NODE --> NODES
    ADD_EDGE --> EDGES
    ADD_EDGE -.-> CYCLE
    NODES --> SCHED_LEASE
    EDGES --> READY
    NODES --> READY
    SCHED_LEASE --> LEASE
    LEASE --> L_VALID
    L_VALID --> READY
    READY --> EXEC
    EXEC --> EXEC_ONE
    EXEC_ONE --> TRACE
    EXEC_ONE --> RESOLVE
    RESOLVE -.->|"upstream states"| NODES

    TRACE --> REPLAY
    TRACE --> SNAPSHOT
    SNAPSHOT -.->|"serialisable dict"| CLI_INFO

    EXEC --> SCQL
    SCQL --> SCQL_EXAMPLE

    EXEC --> MUTATE
    MUTATE --> COLLAPSE
    MUTATE --> MERGE

    CLI_RUN --> ADD_NODE
    CLI_RUN --> ADD_EDGE
    CLI_RUN --> EXEC

    CAL_ADDR --> PARSE
    PARSE --> ADDR_OF
    ADDR_OF -.-> NODES
```

---

## 3. IR — State & Scheduling Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef state fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd
    classDef causal fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef lease fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef sched fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef receipt fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee

    %% ===== SM-IR: State Memory =====
    subgraph SM["SM-IR — State Memory"]
        direction TB
        DAG("StateDAG<br/><small>versioned causal state</small>"):::state
        VER("StateVersion{frozen}<br/><small>data, causal_parents, source_event,<br/>edge_type, hash (SHA-256)</small>"):::state
        MUTATE_DAG("mutate(delta, source_event, edge_type, heads)<br/><small>version expansion — never in-place</small>"):::state
        WALK("walk_backward(version_id)<br/><small>BFS causal lineage → genesis</small>"):::state
        HEADS("heads<br/><small>multiple heads = branching</small>"):::state
        CHILDREN("children_of(version_id)<br/><small>all derived versions</small>"):::state
    end

    %% ===== TEM-IR: Temporal Causality =====
    subgraph TEM["TEM-IR — Temporal Causality"]
        direction TB
        CE("CausalEvent<br/><small>from_cer_event() factory</small>"):::causal
        CEG("CausalEdge<br/><small>typed causal relationship</small>"):::causal
        TM("TimeModel<br/><small>event_time · lease_time · causal_epoch</small>"):::causal
        TA("TemporalAnnotator<br/><small>annotate CausalEvents with time</small>"):::causal
        CG("CausalGraph<br/><small>edge-typed causal DAG</small>"):::causal
    end

    %% ===== RL-IR: Role Leasing =====
    subgraph RL["RL-IR — Role Leasing"]
        direction TB
        RL_ROLE("RoleLease<br/><small>role_name, capabilities, status</small>"):::lease
        RL_CAPS("CapabilitySet<br/><small>scoped permissions</small>"):::lease
        RL_LC("LeaseCompiler<br/><small>compile leases from role definitions</small>"):::lease
        RL_LL("LeaseLifecycle<br/><small>create → activate → expire → revoke</small>"):::lease
        RL_EP("EventProjection<br/><small>projected views of events</small>"):::lease
        RL_IG("IntentGraph<br/><small>intent nodes + edges</small>"):::lease
        RL_PG("ProvenanceGraph<br/><small>event provenance DAG</small>"):::lease
    end

    %% ===== LS-IR: Lifecycle Scheduling =====
    subgraph LS["LS-IR — Lifecycle Scheduling"]
        direction TB
        WS("WorkSurface<br/><small>indexed intent surface</small>"):::sched
        WS_ADD("add(event) → WorkSurfaceEntry<br/><small>PromotionReceipt emitted</small>"):::sched
        WS_QUERY("query(type, priority, epoch, tags, status)<br/><small>multi-dimensional index</small>"):::sched
        WS_DEFER("defer(entry_id, reason, retry)<br/><small>DEFERRED → UNASSIGNED later</small>"):::sched

        LP("LeasePool<br/><small>register · acquire · release · preempt</small>"):::sched
        LP_IDLE("idle_slots() → list[LeaseSlot]<br/><small>load info for arbitration</small>"):::sched
        LP_PREEMPT("find_preemption_target(priority)<br/><small>lowest-priority preempt</small>"):::sched

        AE("ArbitrationEngine<br/><small>score = α·fit + β·(1-load) + γ·priority</small>"):::sched
        AE_SELECT("select(leases, event) → best lease<br/><small>argmax, first-valid ties (deterministic)</small>"):::sched

        DISP("Dispatcher<br/><small>binds event → lease</small>"):::sched
        DISP_GO("dispatch(event, lease, score) → DispatchEvent<br/><small>acquire lease + PromotionReceipt</small>"):::sched

        SCHED("Scheduler<br/><small>deterministic main loop</small>"):::sched
        SCHED_CYCLE("cycle(events)<br/><small>ingest → preempt → arbitrate → dispatch → retry</small>"):::sched
        SCHED_RUN("run(event_source, cycle_count)<br/><small>poll → cycle until empty</small>"):::sched
    end

    %% ===== PROMOTION =====
    subgraph PROMO["Promotion Receipts<br/><small>cross-layer audit trail</small>"]
        PR("PromotionReceipt<br/><small>from_type → to_type<br/>stage · metadata · compiler_version</small>"):::receipt
        PR_CHAIN("Chain example:<br/>CausalEvent → WorkSurfaceEntry → DispatchEvent<br/>Each step preserves provenance"):::receipt
    end

    %% ===== FLOWS =====
    MUTATE_DAG -->|"creates"| VER
    VER --> DAG
    HEADS -.->|"version expansion base"| MUTATE_DAG
    WALK -.->|"causal lineage"| DAG
    CHILDREN -.-> DAG

    CE -->|"promoted from CEREvent<br/>from_cer_event()"| CEG
    CE --> TM
    TA --> CE
    CEG --> CG

    RL_LC --> RL_ROLE
    RL_ROLE --> RL_LL

    CE -->|"ingested"| WS_ADD
    WS_ADD -->|"WorkSurfaceEntry"| WS
    WS_ADD -.->|"PromotionReceipt"| PR

    WS -->|"unassigned()"| WS_QUERY
    WS -->|"deferred_due()"| WS_DEFER
    WS_QUERY -->|"scored events"| AE_SELECT
    LP_IDLE -->|"idle slots + load"| AE_SELECT
    AE_SELECT -->|"(lease, score)"| DISP_GO
    LP_PREEMPT -.->|"preempted entry → requeue"| WS
    DISP_GO -.->|"PromotionReceipt"| PR
    DISP_GO -->|"acquire lease"| LP
    DISP_GO -->|"dispatch event"| SCHED_CYCLE
    SCHED_CYCLE -->|"telemetry"| SCHED_RUN

    DAG -.->|"replay → state reconstruction"| PR_CHAIN
    CG -.->|"temporal ancestors"| PR_CHAIN
```

---

## 4. MEEP — 6-Station Pipeline Detail

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef station fill:#3d1308,stroke:#8b2500,stroke-width:2px,color:#ddd
    classDef data fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd
    classDef output fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef frozen fill:#1a0a2e,stroke:#9b59b6,stroke-width:2px,color:#ddd

    subgraph IN["Input"]
        RAW("📝 Raw Prompt"):::data
        AST("Station 0 (optional)<br/>ast_parser.parse()<br/>ast_features.extract_features()<br/><small>heading text, code blocks, lists</small>"):::data
    end

    subgraph STATIONS["6-Station Pipeline"]
        direction TB

        S1["Station 1: IRL Classifier<br/>irl_classifier.classify()"]:::station
        S1_DETAIL["<small>Keyword heuristic matching<br/>11 frozen archetypes (Phase 0)<br/>AST-enhanced: 2x heading weight + structural bonuses<br/>DEFAULT always receives standing reserve of 1.0<br/>Output: IRLResult{probabilities → dict[str,float]}</small>"]:::data

        S2["Station 2: IR Resolver<br/>ir_resolver.resolve()"]:::station
        S2_DETAIL["<small>Deterministic argmax (alphabetical tiebreaker)<br/>Threshold: < 0.4 → REJECT<br/>Alternatives preserved for diagnostics<br/>Output: IRSelection{archetype, confidence}</small>"]:::data

        S3["Station 3: Spec Compiler<br/>spec_compiler.compile_selection()"]:::station
        S3_DETAIL["<small>Rule-based template instantiation<br/>9 archetype DAG templates + DEFAULT + REJECT<br/>Linear chains by default (non-linear in Phase 2)<br/>Output: WorkRequestGraph{nodes, edges, metadata}</small>"]:::data

        S4["Station 4: Lowering Pass<br/>lowering_pass.lower()"]:::station
        S4_DETAIL["<small>Resolve WorkNode → ExecNode (handler registry)<br/>Kahn's algorithm → topological order<br/>FREEZE: immutable after lowering<br/>Output: ExecutionGraph{frozen, content_hash()}</small>"]:::frozen

        S5["Station 5: Scheduler<br/>scheduler.schedule()"]:::station
        S5_DETAIL["<small>Walk ExecutionGraph in topological order<br/>execute_handler(node) for each node<br/>Hash-chained event log (SHA-256)<br/>CEREvent types: NODE_START, NODE_COMPLETE<br/>Output: CERLog{append-only events}</small>"]:::data

        S6["Station 6: Replay Engine<br/>replay_engine.replay()"]:::station
        S6_DETAIL["<small>Pure-function reducer (no side effects)<br/>Walk events → reconstruct ExecutionState<br/>Supports: full replay + partial replay_until(n)<br/>Optional bridge: replay_to_dag() → IR StateDAG<br/>Output: ExecutionState{node_states, is_complete}</small>"]:::data
    end

    subgraph MODEL["Core Data Types"]
        IRL("IRLResult<br/>probabilities: dict"):::data
        IRS("IRSelection<br/>archetype, confidence"):::data
        WRG("WorkRequestGraph<br/>WorkNode[], WorkEdge[]"):::data
        EG("ExecutionGraph<br/>ExecNode[], frozen"):::frozen
        CER("CERLog<br/>CEREvent[], hash chain"):::data
        ES("ExecutionState<br/>node_states, complete"):::output
    end

    subgraph ARCHETYPES["Frozen Archetypes (Phase 0)"]
        ATYPES["CONSTRUCTION · EXECUTION · REFLECTION<br/>RECONCILIATION · REVISION · COUNTERFACTUAL<br/>AUDIT · COMPRESSION · CONSTRAINT_INJECTION<br/>DEFAULT · REJECT"]:::data
    end

    %% Flow
    RAW -->|"use_ast=True"| AST
    AST -->|"ast_features (optional)"| S1
    RAW -->|"raw text"| S1
    S1 -->|"IRLResult"| IRL
    IRL --> S2
    S2 -->|"IRSelection"| IRS
    IRS --> S3
    S3 -->|"WorkRequestGraph"| WRG
    WRG --> S4
    S4 -->|"ExecutionGraph"| EG
    EG --> S5
    S5 -->|"CERLog"| CER
    CER --> S6
    S6 -->|"ExecutionState"| ES

    S3 -.->|"template lookup"| ATYPES
    S1 -.->|"classifies against"| ATYPES
    S2 -.->|"selects from"| ATYPES

    %% Archetype template examples
    subgraph TEMPLATES["Template Examples"]
        TCON("CONSTRUCTION:<br/>specify → build → verify"):::data
        TEX("EXECUTION:<br/>prepare → execute → collect"):::data
        TREFL("REFLECTION:<br/>gather → analyze → report"):::data
        TREV("REVISION:<br/>identify → plan → apply → verify"):::data
        TDEF("DEFAULT:<br/>clarify"):::data
    end

    ATYPES -.-> TCON
    ATYPES -.-> TEX
    ATYPES -.-> TREFL
    ATYPES -.-> TREV
    ATYPES -.-> TDEF
```

### Execution Sequence

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '12px',
  'primaryBorderColor': '#555'
}}}%%

sequenceDiagram
    participant CLI as CLI (meep.cli)
    participant S1 as Station 1<br/>IRL Classifier
    participant S2 as Station 2<br/>IR Resolver
    participant S3 as Station 3<br/>Spec Compiler
    participant S4 as Station 4<br/>Lowering Pass
    participant S5 as Station 5<br/>Scheduler
    participant S6 as Station 6<br/>Replay Engine

    CLI->>S1: classify(prompt, ast_features)
    Note over S1: Keyword matching → probability distribution
    S1-->>CLI: IRLResult{probabilities}

    CLI->>S2: resolve(result)
    Note over S2: Argmax + tiebreaker → deterministic selection
    S2-->>CLI: IRSelection{archetype, confidence}

    CLI->>S3: compile_selection(selection, prompt)
    Note over S3: Template instantiation → work DAG
    S3-->>CLI: WorkRequestGraph{nodes, edges}

    CLI->>S4: lower(graph)
    Note over S4: Handler resolution + Kahn's algorithm + FREEZE
    S4-->>CLI: ExecutionGraph{frozen, content_hash}

    CLI->>S5: schedule(graph)
    Note over S5: Topological walk → hash-chained CER events
    S5-->>CLI: CERLog{events, tail_hash}

    alt --replay flag
        CLI->>S6: replay(log)
        Note over S6: Pure reducer → ExecutionState
        S6-->>CLI: ExecutionState{node_states, is_complete}
    end
```

---

## 5. Cascade — Event Bus Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {
  'fontSize': '13px',
  'primaryBorderColor': '#555'
}}}%%

graph TB
    %% ===== STYLES =====
    classDef bus fill:#1b4332,stroke:#2d6a4f,stroke-width:2px,color:#ddd
    classDef nats fill:#0c2233,stroke:#1a6b8a,stroke-width:2px,color:#ddd
    classDef bridge fill:#4a1942,stroke:#7b2d8e,stroke-width:2px,color:#eee
    classDef disk fill:#16213e,stroke:#0f3460,stroke-width:2px,color:#ddd

    subgraph DISK["Filesystem"]
        EVENTS("events/<br/><small>JSON event files</small>"):::disk
        OFFSET("offset.json<br/><small>last_timestamp + processed_ids</small>"):::disk
    end

    subgraph MAIN["Main Loop (every 2s)"]
        LOAD("load_events(EVENT_DIR)<br/><small>parse + validate JSON</small>"):::bus
        VALID("validators/events.py<br/><small>structural validation</small>"):::bus
        FILTER("Filter new events<br/><small>id not in processed_ids</small>"):::bus
        SORT("Sort by timestamp ASC"):::bus
        PUBLISH("publish_event(evt)<br/><small>enqueue for NATS</small>"):::bus
        PERSIST("write_offset(timestamp, processed_ids)"):::bus
    end

    subgraph NATS_SIDECAR["NATS Sidecar Thread"]
        CONNECT("connect(NATS_URL)<br/><small>nats-py async connection</small>"):::nats
        JS("JetStream (optional)<br/><small>persistent publish + replay</small>"):::nats
        DRAIN("drain_queue()<br/><small>async publish from queue</small>"):::nats
        FALLBACK("Fallback to logger<br/><small>when NATS unavailable</small>"):::nats
    end

    subgraph ENVELOPE["Envelope Wrapping"]
        ADAPTER("envelope_adapter.py<br/><small>cascade_to_envelope()</small>"):::bridge
        ENV("CanonicalEnvelope{<br/>event_id, event_type, occurred_at,<br/>origin_component, correlation_id,<br/>causation_id, source_event_ids,<br/>execution_id, classification,<br/>policy_version, subject, payload<br/>}"):::bridge
        SUBJECT("event_type_to_subject()<br/><small>IdeaCaptured → nexus.cascade.v1.workflow.idea_captured<br/>VocabularyDrafted → nexus.cascade.v1.workflow.step_completed.vocabulary</small>"):::nats
    end

    subgraph INFERENCE["Inference Bridge (POC)"]
        SUBSCRIBER("inference_subscriber.py<br/><small>NATS → Tackle → inference</small>"):::bridge
        TACKLE("Tackle DB<br/><small>get_role_config(role)<br/>resolve model + harness</small>"):::bridge
        LAUNCHER("HarnessLauncher<br/><small>build CLI command</small>"):::bridge
        SUBPROCESS("subprocess.run()<br/><small>invoke inference binary</small>"):::bridge
        RESULT("InferenceCompleted<br/><small>result → events/ + NATS</small>"):::bridge
    end

    subgraph SUBJECTS["NATS Subjects"]
        SUBJ1("nexus.cascade.v1.workflow.idea_captured"):::nats
        SUBJ2("nexus.cascade.v1.workflow.step_requested"):::nats
        SUBJ3("nexus.cascade.v1.workflow.step_completed.*"):::nats
        SUBJ4("nexus.cascade.v1.inference.*"):::nats
    end

    %% Flows
    EVENTS -->|"poll every 2s"| LOAD
    LOAD -->|"parsed events"| VALID
    VALID -->|"valid + errors"| FILTER
    FILTER -->|"new IDs only"| SORT
    SORT -->|"ordered"| PUBLISH
    PUBLISH --> PERSIST
    PERSIST -.-> OFFSET
    PERSIST -.->|"update"| EVENTS

    PUBLISH -->|"enqueue"| DRAIN
    CONNECT -->|"connected"| DRAIN
    JS -.->|"JetStream publish"| DRAIN
    DRAIN -.->|"NATS down"| FALLBACK

    PUBLISH -->|"wrap in"| ADAPTER
    ADAPTER -->|"→"| ENV
    ENV -.->|"resolves"| SUBJECT
    SUBJECT -->|"routes to"| SUBJ1
    SUBJECT -->|"routes to"| SUBJ2
    SUBJECT -->|"routes to"| SUBJ3

    SUBJ1 -->|"subscribed"| SUBSCRIBER
    SUBSCRIBER -->|"resolve config"| TACKLE
    TACKLE -->|"harness config"| LAUNCHER
    LAUNCHER -->|"CLI command"| SUBPROCESS
    SUBPROCESS -->|"stdout/error"| RESULT
    RESULT -->|"write"| EVENTS
    RESULT -->|"publish"| SUBJ4

    %% Legend
    NOTE("Cascade is a pure event bus — no LLM calls,<br/>no workflow orchestration, no content generation.<br/>Inference bridge is a separate POC component.")
    NOTE -.-> MAIN
```

---

## 6. Cross-Module Integration Matrix

| Module | Provides | Consumes | Entrypoint | Key Types |
|--------|----------|----------|------------|-----------|
| **NBK** | Causal graph execution, self-modification (SOCO), SCQL query, CAL addressing | User-defined node functions and graph topology | `cli.py` | `NexusBootstrapKernel`, `NodeDef`, `Edge`, `Trace`, `Lease`, `MutationRule` |
| **IR** | StateDAG (versioned causal state), CausalEvent (temporal), RoleLease (capability-gated), WorkSurface (intent queue), Arbitration (weighted scoring), Scheduler (deterministic loop) | Events from MEEP (CEREvent → CausalEvent), edges from NBK (Edge → CausalEdge) | — (library) | `StateDAG`, `StateVersion`, `CausalEvent`, `CausalEdge`, `RoleLease`, `WorkSurface`, `LeasePool`, `ArbitrationEngine`, `Dispatcher`, `Scheduler`, `PromotionReceipt` |
| **Cascade** | Pure event bus (ingest → validate → publish), NATS JetStream sidecar, CanonicalEnvelope wrapping, Inference bridge (POC) | `events/` directory (JSON files), NATS subjects | `main.py` | `CanonicalEnvelope`, `WorkSurfaceEntry` (via bridge) |
| **MEEP** | Deterministic prompt → CER pipeline (6 stations), Frozen archetype system (Phase 0), Hash-chained event log, Pure-function replay | Raw text prompt (CLI or stdin) | `cli.py` | `IRLResult`, `IRSelection`, `WorkRequestGraph`, `ExecutionGraph`, `CERLog`/`CEREvent`, `ExecutionState` |

### Key Integration Points

```
MEEP ────CEREvent────▶ IR
  │                    │
  │  CERLog            │ CausalEvent.from_cer_event()
  │  replay_to_dag()   │ StateReplayEngine.replay()
  │                    ▼
  └────────────▶ StateDAG (versioned causal state)
                          │
                          │ WorkSurface.add()
                          ▼
                    DispatchEvent → Scheduler cycle

NBK ────Edge────▶ IR
  │                │
  │                │ CausalEdge.from_nbk_edge()
  │                ▼
  │          CausalGraph
  │
  │   snapshot() ──▶ Replay via IR StateReplayEngine
```

---

## 7. Key Design Properties

| Property | NBK | IR | Cascade | MEEP |
|----------|-----|----|---------|------|
| **Paradigm** | Causal graph interpreter | Typed execution semantics | Pure event bus | Deterministic pipeline |
| **State Model** | Dict-of-nodes (latest output per node) | Versioned causal DAG (no in-place mutation) | Offset-tracked file polling | Hash-chained append-only log |
| **Mutation** | Self-modifying (SOCO rules) | Version expansion only | Append-only events | Freeze boundary (never mutate after lower) |
| **Determinism** | Sorted batch execution order | Argmax tiebreaker, sorted queries | Sorted by timestamp | Argmax, sorted topology, fixed-clock |
| **Idempotent** | Replay from traces | Same delta + parents = same hash | Offset dedup by event ID | Same prompt → same execution |
| **Error Model** | ValueError on cycles/duplicates | ValueError on invalid parents | Validation errors logged | FrozenGraphError on mutation |
| **Integration** | CAL addressing → IR causal edges | PromotionReceipt chain across all layers | NATS envelope → MEEP CausalEvent | replay_to_dag() → IR StateDAG |

---

*Sources: `python/nbk/`, `python/ir/`, `python/cascade/`, `python/meep/`, ARCHITECTURE.md Section V.*
