# Absorption & Ingestion Pipeline Flow

> **Version:** 0.1 (2026-06-28)
> **Scope:** `nexus/python/absorb/html/` — Document ingestion, chat transcript parsing, semantic graph construction, and deterministic kernel execution.
> **Entrypoint:** `main.py` via `python3 main.py <path> [--mode messages|graph] [--json]`

---

## Table of Contents

1. [Pipeline Architecture Overview](#1-pipeline-architecture-overview)
2. [File Discovery & Ingestion Flow](#2-file-discovery--ingestion-flow)
3. [DocLing Document Conversion Flow](#3-docling-document-conversion-flow)
4. [Parser Detection & Dispatch Flow](#4-parser-detection--dispatch-flow)
5. [Span Segmentation & Normalization Flow](#5-span-segmentation--normalization-flow)
6. [Graph Mode Pipeline (6 Stages)](#6-graph-mode-pipeline-6-stages)
7. [Fallback Chain Flow](#7-fallback-chain-flow)
8. [Key Data Structures](#8-key-data-structures)
9. [Design Properties](#9-design-properties)

---

## 1. Pipeline Architecture Overview

```mermaid
graph TB
    subgraph INPUT["Input Sources"]
        direction TB
        F1["<b>Source Files</b><br/>HTML / PDF / DOCX / PPTX<br/>EPUB / MD / Images / TXT"]
        F2["<b>File Discovery</b><br/>collect_ingest_files()<br/>Recursive directory scan<br/>22 supported extensions"]
    end

    subgraph CONVERSION["DocLing Conversion Layer"]
        direction TB
        ADAPTER["<b>DoclingAdapter</b><br/>convert(filepath)<br/>Unified document converter"]
        MD_EXPORT["export_to_markdown()"]
        TEXT_EXPORT["export_to_text()"]
    end

    subgraph PARSER["Parser Detection & Dispatch"]
        direction TB
        REGISTRY["<b>Parser Registry</b><br/>@register_parser decorators<br/>Auto-discovered on import"]
        DETECT["<b>detect_and_parse()</b><br/>Try each parser in order<br/>First match wins"]
        FALLBACK["<b>Fallback Chain</b><br/>3-phase fallback when no<br/>parser matches"]
    end

    subgraph PARSERS["Registered Parser Modules"]
        CP["<b>ChatGPTParser</b><br/>**ChatGPT label detection<br/>or filename contains 'chatgpt'"]
        CHTML["<b>ChatGPTHtmlParser</b><br/>Raw ChatGPT HTML parsing<br/>(without DocLing)"]
        COP["<b>CopilotParser</b><br/>**Copilot label detection"]
        GEM["<b>GeminiParser</b><br/>**Gemini label detection"]
        MD["<b>MarkdownParser</b><br/>Paragraph-level conversation<br/>pattern detection"]
        OC["<b>OpenCodeParser</b><br/>OpenCode format transcripts"]
    end

    subgraph NORMALIZE["Normalization Layer"]
        direction TB
        SEG["<b>Span Segmentation</b><br/>_segment_text() → Spans<br/>STRUCTURAL / DISCOURSE<br/>EVENT_CANDIDATE / NOISE"]
        CCNF["<b>CCNF Normalization</b><br/>normalize_text()<br/>8-step idempotent cleanup"]
        ENV["<b>ParserEnvelope</b><br/>Raw text + spans + metadata<br/>Zero normalization preserved"]
    end

    subgraph MSG_MODE["Messages Mode (--mode messages)"]
        OUTPUT_MSG["<b>Output</b><br/>NormalizedMessage[] +<br/>ConversationMetadata<br/>→ stdout or JSON file"]
    end

    subgraph GRAPH_MODE["Graph Mode (--mode graph)"]
        direction TB
        
        subgraph STAGE1["Stage 1: Graph Construction"]
            GB["<b>GraphBuilder</b><br/>3-pass construction<br/>Pass 1: Ingest messages<br/>Pass 2: Build relationships + concepts + questions<br/>Pass 3: Extract trajectory seeds"]
        end
        
        subgraph STAGE2["Stage 2: Trajectory & Diff Analysis"]
            TR["<b>TrajectoryReconstructor</b><br/>Reconstruct trajectory timelines<br/>from message sequences"]
            DE["<b>DiffEngine</b><br/>Compute semantic diffs<br/>between trajectory states"]
        end
        
        subgraph STAGE3["Stage 3: Semantic Inference"]
            QR["<b>QuestionResolver</b><br/>Resolve open questions<br/>against trajectory state"]
            OS["<b>ObservationSynthesizer</b><br/>Synthesize observations<br/>from trajectory diffs"]
            IC["<b>InteractionClassifier</b><br/>Classify interaction patterns<br/>(construction/execution/reflection/...)"]
            CE["<b>ConstraintEngine</b><br/>Validate constraints<br/>against trajectory states"]
            CD["<b>ConflictDetector</b><br/>Detect VALUE / STRUCTURAL<br/>conflicts between observations"]
        end
        
        subgraph STAGE4["Stage 4: Kernel Execution"]
            TE["<b>TrajectoryEvaluator</b><br/>Evaluate trajectories<br/>→ scored results"]
            IRM["<b>IRMigrationLayer</b><br/>Migrate event stream<br/>via TransitionSynthesizer"]
            KERNEL["<b>Kernel</b><br/>FSM Controller + ExecutionEligibilityGate<br/>5-step deterministic pipeline<br/>Cryptographic state chaining"]
            REPLAY["<b>ReplayEngine</b><br/>Deterministic replay<br/>Sorted event stream → FSM →<br/>SemanticProjection"]
        end
        
        subgraph STAGE5["Stage 5: Validation"]
            GV["<b>GraphValidator</b><br/>Validation: errors + warnings<br/>Cross-check graph integrity"]
        end
        
        subgraph STAGE6["Stage 6: Workspace Assembly"]
            CA["<b>ContextAssembler</b><br/>Assemble working_set +<br/>conflict_set from workspace"]
            WS["<b>Workspace</b><br/>Container for all conversation<br/>graphs and replay views"]
        end
    end

    INPUT --> CONVERSION
    CONVERSION --> PARSER
    PARSER --> PARSERS
    PARSERS --> NORMALIZE
    
    NORMALIZE --> MSG_MODE
    NORMALIZE --> GRAPH_MODE
    
    GRAPH_MODE --> STAGE1
    STAGE1 --> STAGE2
    STAGE2 --> STAGE3
    STAGE3 --> STAGE4
    STAGE4 --> STAGE5
    STAGE5 --> STAGE6
```

---

## 2. File Discovery & Ingestion Flow

```mermaid
graph TB
    CLI["<b>CLI Entry</b><br/>python3 main.py &lt;path&gt;<br/>[--json] [--ocr] [--mode messages|graph]"]
    
    COLLECT["<b>collect_ingest_files()</b>"]
    
    SINGLE{"Path is file<br/>or directory?"}
    
    FILE_EXT{"Extension<br/>supported?"}
    SKIP["Skip unsupported file"]
    ADD_FILE["Add to ingest list"]
    
    DIR_SCAN["Scan recursively for:<br/>.html .htm .md .markdown<br/>.pdf .docx .pptx .xlsx<br/>.epub .txt .png .jpg<br/>.jpeg .tiff"]
    SKIP_DIR["Skip _files dirs"]
    DEDUP["Deduplicate by resolved path"]
    
    BATCH["Batch: create DoclingAdapter<br/>For each file:"]
    
    PARSE_FILE["<b>parse_file()</b>"]
    
    MD_CHECK{"Extension is<br/>.md or .markdown?"}
    
    MD_PARSE["<b>detect_and_parse_md()</b><br/>Parse raw markdown via<br/>registered parsers"]
    DOCLING_PARSE["<b>DoclingAdapter.convert()</b><br/>→ DoclingDocument<br/>then detect_and_parse()"]
    
    RESULTS["Results: (filepath, NormalizedMessage[], ConversationMetadata)"]
    
    MODE_CHECK{"mode?"}
    
    MSG_OUT["messages mode:<br/>→ print to console<br/>→ or build_json_output()"]
    GRAPH_OUT["graph mode:<br/>→ Graph pipeline (6 stages)"]
    
    CLI --> COLLECT
    
    COLLECT --> SINGLE
    SINGLE -->|"File"| FILE_EXT
    SINGLE -->|"Directory"| DIR_SCAN
    
    FILE_EXT -->|"Yes"| ADD_FILE
    FILE_EXT -->|"No"| SKIP
    
    DIR_SCAN --> SKIP_DIR
    SKIP_DIR --> DEDUP
    
    ADD_FILE --> BATCH
    DEDUP --> BATCH
    
    BATCH --> PARSE_FILE
    PARSE_FILE --> MD_CHECK
    
    MD_CHECK -->|"Yes"| MD_PARSE
    MD_CHECK -->|"No"| DOCLING_PARSE
    
    MD_PARSE --> RESULTS
    DOCLING_PARSE --> RESULTS
    
    RESULTS --> MODE_CHECK
    MODE_CHECK -->|"messages"| MSG_OUT
    MODE_CHECK -->|"graph"| GRAPH_OUT
```

---

## 3. DocLing Document Conversion Flow

```mermaid
graph TB
    subgraph ADAPTER["DoclingAdapter"]
        direction TB
        CONV["<b>convert(path)</b><br/>DocumentConverter.convert()"]
        CONV_ALL["<b>convert_all(paths)</b><br/>Batch with error isolation"]
        EXTRACT["<b>extract_text_items(doc)</b><br/>→ list of {text, label, prov}"]
        MD["<b>export_to_markdown(doc)</b><br/>→ Markdown string"]
        TXT["<b>get_text(doc)</b><br/>→ Plain text"]
        IMG["<b>extract_images(doc)</b><br/>→ list of image refs"]
    end

    subgraph SOURCES["Supported Source Formats"]
        HTML["HTML (ChatGPT export)"]
        PDF["PDF documents"]
        DOCX["Word documents"]
        PPTX["PowerPoint"]
        XLSX["Excel"]
        EPUB["EPUB ebooks"]
        IMG["Images (PNG/JPG/TIFF)<br/>with optional OCR"]
        TXT["Plain text"]
    end

    subgraph DOCLING["DoclingDocument"]
        DIRECTION TB
        TEXTS["<b>.texts</b><br/>List of text items with<br/>label, text, prov"]
        PICS["<b>.pictures</b><br/>List of image references"]
        MD2["<b>.export_to_markdown()</b><br/>Full markdown output"]
    end

    SOURCES --> CONV
    CONV --> DOCLING
    DOCLING --> EXTRACT
    DOCLING --> MD
    DOCLING --> TXT
    DOCLING --> IMG
    
    MD -->|"Input to"| PARSER["Parser Detection"]
    EXTRACT -->|"Optional"| PARSER
```

---

## 4. Parser Detection & Dispatch Flow

```mermaid
graph TB
    INPUT["Input: DoclingDocument + filepath<br/>(or None for raw markdown)"]
    
    REGISTRY["<b>Parser Registry</b><br/>_parser_registry[]<br/>Populated by @register_parser"]
    
    ATTEMPT{"Try each parser<br/>in registration order"}
    
    CAN_HANDLE{"parser.can_handle(doc, path)?"}
    
    EXTRACT_META["<b>extract_metadata()</b><br/>→ ConversationMetadata<br/>(title, model, create_time)"]
    
    PARSE["<b>parse()</b><br/>→ NormalizedMessage[]"]
    
    NONZERO{"len(messages) > 0?"}
    
    NEXT_PARSER["Try next parser"]
    
    RETURN["Return (messages, metadata)"]
    
    FALLBACK["<b>Fallback Chain</b><br/>3-phase fallback"]
    
    INPUT --> REGISTRY
    REGISTRY --> ATTEMPT
    ATTEMPT --> CAN_HANDLE
    
    CAN_HANDLE -->|"Yes"| EXTRACT_META
    CAN_HANDLE -->|"No"| NEXT_PARSER
    
    EXTRACT_META --> PARSE
    PARSE --> NONZERO
    
    NONZERO -->|"Yes"| RETURN
    NONZERO -->|"No (0 messages)"| NEXT_PARSER
    
    NEXT_PARSER --> ATTEMPT
    
    ATTEMPT -->|"All tried, none matched"| FALLBACK
    FALLBACK --> RETURN

    subgraph PARSER_DETAIL["Parser Detection Heuristics"]
        CP["<b>ChatGPTParser</b><br/>'**ChatGPT' in markdown<br/>or 'chatgpt' in filename"]
        COP["<b>CopilotParser</b><br/>'**Copilot' in markdown<br/>or 'copilot' in filename"]
        GEM["<b>GeminiParser</b><br/>'**Gemini' in markdown<br/>or 'gemini' in filename"]
        MD["<b>MarkdownParser</b><br/>.md/.markdown extension +<br/>≥2 alternating speaker turns"]
        OC["<b>OpenCodeParser</b><br/>OpenCode format markers<br/>in transcript"]
    end
```

---

## 5. Span Segmentation & Normalization Flow

```mermaid
graph TB
    subgraph INPUT2["Input: Raw extracted text"]
        RAW["Raw text from parser<br/>(unnormalized, verbatim)"]
    end

    subgraph SEGMENT["_segment_text() — Zero-Normalization Ingress"]
        PARA["Split on double+ newline boundaries<br/>→ paragraphs"]
        CLASSIFY["Classify each paragraph:"]
        
        MARKDOWN{"Has markdown role?"}
        DISCOURSE{"Has discourse role?"}
        EVENTISH{"Looks eventish?"}
        LEN{"Length < 500 chars"}
        
        SPAN_TYPE["Assign SpanType:"]
        S1["STRUCTURAL<br/>(markdown: header/list/code/blockquote)"]
        D1["DISCOURSE<br/>(hedge/framing/emphasis/meta)"]
        E1["EVENT_CANDIDATE<br/>(fact/command/assertion)"]
        N1["NOISE<br/>(whitespace-only)"]
        
        SPAN["Create Span:<br/>id, text (raw), start, end,<br/>span_type, confidence,<br/>markdown_role, discourse_role"]
        
        STATS["<b>_compute_span_stats()</b><br/>Track classifier bias<br/>D/E ratio, confidence spread<br/>Span-to-paragraph entropy"]
    end

    subgraph CCNF["CCNF Normalization — 8 Steps"]
        NFC["1. NFC Unicode normalization"]
        ZW["2. Strip zero-width characters<br/>(U+200B, U+200C, etc.)"]
        NBSP["3. Non-breaking spaces → U+0020"]
        BOM["4. Strip BOM (U+FEFF)"]
        WS["5. Collapse whitespace,<br/>preserve paragraph breaks"]
        TRIM["6. Trim leading/trailing whitespace"]
        BOILER["7. Strip model boilerplate<br/>(ChatGPT intros, sign-offs, etc.)"]
        HR["8. Remove horizontal rules<br/>(---, ***, ___ )"]
        
        IDEMPOTENT["Result: Idempotent —<br/>normalize_text(normalize_text(t)) == normalize_text(t)"]
    end

    subgraph ENVELOPE["ParserEnvelope Builder"]
        PE["<b>parse_to_envelope()</b><br/>→ ParserEnvelope with:<br/>- raw_text (verbatim)<br/>- spans (partitioned)<br/>- structural_ids / discourse_ids / event_ids<br/>- metadata + provenance<br/>- CCNF NOT applied at this layer"]
    end

    subgraph OUTPUT2["Output Formats"]
        NMSG["<b>NormalizedMessage</b><br/>→ stdout or JSON<br/>for --mode messages"]
        GRAPH_IN["<b>GraphBuilder</b><br/>→ ConversationGraph<br/>for --mode graph"]
    end

    RAW --> PARA
    PARA --> CLASSIFY
    
    CLASSIFY --> MARKDOWN
    CLASSIFY --> DISCOURSE
    
    MARKDOWN -->|"Yes"| S1
    MARKDOWN -->|"No"| DISCOURSE
    
    DISCOURSE -->|"Yes"| D1
    DISCOURSE -->|"No"| EVENTISH
    
    EVENTISH -->|"Yes + len<500"| E1
    EVENTISH -->|"No"| LEN
    LEN -->|"≥500"| D1
    LEN -->|"<500"| E1
    
    S1 --> SPAN
    D1 --> SPAN
    E1 --> SPAN
    
    SPAN --> STATS
    SPAN --> ENVELOPE
    
    ENVELOPE --> NMSG
    ENVELOPE --> GRAPH_IN
    
    NMSG -.->|"Optional CCNF<br/>via normalize_text()"| NFC
    NFC --> ZW --> NBSP --> BOM --> WS --> TRIM --> BOILER --> HR --> IDEMPOTENT
```

---

## 6. Graph Mode Pipeline (6 Stages)

### Stage 1: Graph Construction (3 Passes)

```mermaid
graph TB
    subgraph PASS1["Pass 1: Ingest Messages"]
        IN["NormalizedMessage[]"]
        NODE["Create MessageNode for each msg:<br/>id, text, speaker, turn_index,<br/>sequence_position"]
        REG["Register in ConversationGraph.messages"]
    end

    subgraph PASS2["Pass 2: Build Relationships"]
        NEXT["NEXT relationships:<br/>sequential (msg_i → msg_i+1)"]
        RESP["RESPONDS_TO relationships:<br/>assistant → last user message"]
        CONCEPTS["<b>_extract_concepts()</b><br/>- Repeated quoted phrases<br/>- Repeated Title Case terms<br/>→ Concept nodes (count ≥ 2)"]
        QUESTIONS["<b>_extract_questions()</b><br/>- Messages containing '?'<br/>→ QuestionNode with binding<br/>to matched concepts"]
    end

    subgraph PASS3["Pass 3: Extract Trajectories"]
        GOAL["Scan for goal phrases:<br/>'we should build', 'let's create',<br/>'the goal is', 'i want to'"]
        SEED["Create Trajectory seed:<br/>anchorMessage, state='active',<br/>confidence=0.3"]
    end

    IN --> NODE
    NODE --> REG
    REG --> NEXT
    NEXT --> RESP
    RESP --> CONCEPTS
    CONCEPTS --> QUESTIONS
    QUESTIONS --> GOAL
    GOAL --> SEED
```

### Stage 2-3: Trajectory & Semantic Analysis

```mermaid
graph TB
    subgraph S2["Stage 2: Trajectory & Diff"]
        TR["<b>TrajectoryReconstructor</b><br/>Reconstruct trajectory timelines<br/>from message sequences<br/>→ ReconstructedTrajectory[]"]
        DE["<b>DiffEngine</b><br/>Compute diffs between<br/>trajectory states<br/>→ semantic diff artifacts"]
    end

    subgraph S3["Stage 3: Semantic Inference (5 parallel passes)"]
        QR["<b>QuestionResolver</b><br/>Resolve open questions<br/>→ partial/full resolution"]
        OS["<b>ObservationSynthesizer</b><br/>Eval diffs → Observations<br/>SUPPORTS / CONTRADICTS<br/>REFINES / REINTRODUCES"]
        IC["<b>InteractionClassifier</b><br/>Classify interaction archetypes:<br/>CONSTRUCTION / EXECUTION / REFLECTION<br/>RECONCILIATION / REVISION<br/>COUNTERFACTUAL / AUDIT<br/>COMPRESSION / CONSTRAINT_INJECTION"]
        CE["<b>ConstraintEngine</b><br/>Validate LEGAL / TECHNICAL<br/>RESOURCE / POLICY constraints<br/>→ OPEN / SATISFIED / VIOLATED"]
        CD["<b>ConflictDetector</b><br/>Detect VALUE / STRUCTURAL<br/>conflicts between observations"]
    end

    subgraph S4["Stage 4: Kernel Execution"]
        TE["<b>TrajectoryEvaluator</b><br/>Evaluate all trajectories<br/>→ scored results dict"]
        
        IRM["<b>IRMigrationLayer</b><br/>migrate_batch(event_stream, states)<br/>→ IR_v2_EventEnvelope[]<br/>via TransitionSynthesizer"]
        
        KERNEL["<b>Kernel.run(event_batch, mode)</b><br/><br/>1. Schema validation (ir_schema_version == 'v2')<br/>2. FSM state check (from_state == current_state)<br/>3. ExecutionEligibilityGate evaluation<br/>4. FSM apply (state transition)<br/>5. SHA-256 cryptographic chaining<br/>→ KernelResult {state_chain, trace, mutation_events}"]
        
        REPLAY["<b>ReplayEngine.replay(run_id, schema, stream)</b><br/>1. Sort event stream by (trajectory_id, timestep_sequence)<br/>2. For each event: synthesize transitions<br/>3. ExecutionEligibilityGate approval<br/>4. FSM state mutation<br/>5. SemanticProjectionBuilder<br/>→ SemanticReplayResult"]
    end

    S2 --> S3
    S3 --> S4
    S4 --> TE
    S4 --> IRM
    IRM --> KERNEL
    TE --> REPLAY
```

### Stages 5-6: Validation & Assembly

```mermaid
graph TB
    subgraph S5["Stage 5: Validation"]
        GV["<b>GraphValidator.validate()</b><br/>Cross-check graph integrity<br/>→ errors[] + warnings[]"]
    end

    subgraph S6["Stage 6: Workspace Assembly"]
        WS2["<b>Workspace(id)</b><br/>Container holding all<br/>ConversationGraph objects"]
        CA["<b>ContextAssembler.assemble()</b><br/>→ WorkingSet:<br/>  resolved_concepts<br/>  resolves_edges<br/>→ ConflictSet:<br/>  contradicted_concepts<br/>  unresolved_questions<br/>  observations"]
    end

    subgraph OUTPUT3["Final Output"]
        JSON["JSON output:<br/>- per-file ConversationGraph<br/>- evaluations dict<br/>- validation errors/warnings<br/>- workspace working/conflict sets"]
        CONSOLE["Console output:<br/>- Node/relationship/concept counts<br/>- Trajectory count<br/>- Evaluation count<br/>- Validation summary"]
    end

    GV --> WS2
    WS2 --> CA
    CA --> JSON
    CA --> CONSOLE
```

---

## 7. Fallback Chain Flow

```mermaid
stateDiagram-v2
    [*] --> Phase1_SectionHeaders
    
    Phase1_SectionHeaders: Phase 1 - DocLing Section Headers
    Phase1_SectionHeaders: Detect section_header items in DoclingDocument
    Phase1_SectionHeaders: Match speaker patterns (\"You said\" / \"ChatGPT said\")
    Phase1_SectionHeaders: Group consecutive text items between headers
    
    Phase1_SectionHeaders --> Phase2_MarkdownLabels: No section headers found
    
    Phase2_MarkdownLabels: Phase 2 - Markdown Bold Labels
    Phase2_MarkdownLabels: Export document to markdown
    Phase2_MarkdownLabels: Scan for **Label:** patterns
    Phase2_MarkdownLabels: Parse alternating user/assistant turns
    
    Phase2_MarkdownLabels --> Phase3_SingleMessage: No markdown labels found
    
    Phase3_SingleMessage: Phase 3 - Single Message Fallback
    Phase3_SingleMessage: Extract all meaningful text from document
    Phase3_SingleMessage: Return as single assistant message
    Phase3_SingleMessage: Only if text length ≥ 20 chars
    
    Phase3_SingleMessage --> Empty: Text too short (< 20 chars)
    
    Empty: Return empty ([], fallback_meta)
    
    Phase1_SectionHeaders --> Success: Messages found
    Phase2_MarkdownLabels --> Success: Messages found
    Phase3_SingleMessage --> Success: Messages found
    
    Success: Return (messages, metadata)
```

---

## 8. Key Data Structures

### Span Types & Classification

| Type | Description | Markdown Roles | Discourse Roles | Event Extraction |
|------|-------------|----------------|-----------------|------------------|
| **STRUCTURAL** | Markdown structure | code_block, header, list_item, ordered_list_item, blockquote, horizontal_rule | — | No |
| **DISCOURSE** | Intent modulation | — | hedge, framing, emphasis, meta | No |
| **EVENT_CANDIDATE** | Fact/command/assertion | — | — | Yes — eligible for CCNF |
| **NOISE** | Whitespace/empty | — | — | No |

### Ingestion Compiler (Layer XII)

```mermaid
graph LR
    subgraph COMPILE["IngestionCompiler.compile()"]
        SEG_IN["TranscriptSegment[]"]
        ISG["ISGEngine.evaluate()<br/>→ AnnotatedSegment"]
        ACTOR["Structural Actor Resolution"]
        DEP["Structural Dependency Inference<br/>(from explicit metadata only)"]
        HASH["Deterministic SHA-256 Hashing<br/>(ISG metadata excluded)"]
        PROV["EnvelopeProvenance"]
        ENV["IR_v2_EventEnvelope"]
    end

    SEG_IN --> ISG --> ACTOR --> DEP --> HASH --> PROV --> ENV
```

### ConversationGraph Entity Registry

| Registry | Type | Key | Purpose |
|----------|------|-----|---------|
| `messages` | MessageNode | message_id | Raw message text and speaker metadata |
| `concepts` | Concept | concept_id | Extracted key phrases (count ≥ 2) |
| `trajectories` | Trajectory | traj_id | Goal-seeded execution paths |
| `reconstructed_trajectories` | ReconstructedTrajectory | traj_id | Full timeline reconstruction |
| `questions` | QuestionNode | q_id | Open/resolved questions with concept bindings |
| `observations` | Observation | obs_id | SUPPORTS/CONTRADICTS/REFINES/REINTRODUCES |
| `constraints` | ConstraintNode | constraint_id | LEGAL/TECHNICAL/RESOURCE/POLICY |
| `interruptions` | Interruption | int_id | Speaker transition interruptions |
| `peos` | PEO | peo_id | Proposal/Execution/Observation artifacts |
| `relationships` | Relationship (list) | — | NEXT, RESPONDS_TO edges |
| `replay_views` | MaterializedReplayView | run_id→version | Deterministic replay outputs |
| `semantic_results` | SemanticReplayResult | run_id | Projection-based results |

### Kernel Execution State Chain

| Entry | Fields | Purpose |
|-------|--------|---------|
| `KernelResultStateEntry` | index, state_hash, prev_hash | Cryptographic state chain link |
| `KernelResultTraceEntry` | index, envelope_id, outcome, state_hash, policy_snapshot_id | Execution trace log |
| `GraphMutationEvent` | event_id, trajectory_id, timestep_seq, mutations[], provenance | Deterministic graph mutation with SHA-256 hash |
| `KernelResult` | run_id, status, state_chain[], trace[], determinism | Final kernel output |

### NexusVM Temporal DAG

| Component | Purpose |
|-----------|---------|
| **Timeline** | Linear execution path with parent, fork_index |
| **InstructionRecord** | GraphMutation + state_hash |
| **Snapshot** | Timeline_id + instruction_index → GraphState |
| **Fork** | New timeline from parent at specific instruction index |

---

## 9. Design Properties

| Property | Description |
|----------|-------------|
| **Zero-normalization ingress** | Spans are exact substrings of original text — never normalized |
| **Deterministic classification** | Span type assignment is rule-based, not ML-driven |
| **CCNF-late normalization** | normalize_text() only applied on output messages, not on spans |
| **Parser pluggability** | New parsers register via `@register_parser` decorator |
| **Multi-phase fallback** | 3 phases with increasing coarseness guarantee some output |
| **Idempotent normalization** | normalize_text(normalize_text(t)) == normalize_text(t) |
| **Cryptographic chaining** | Kernel uses SHA-256 hash chain over all state transitions |
| **All-or-nothing kernel** | Error on any envelope → HALTED_ON_ERROR, no partial commit |
| **Replayable via projection** | ReplayEngine produces SemanticReplayResult from sorted event stream |
| **Schema-gated** | Every kernel execution validates ir_schema_version == 'v2' |
| **Policy-controlled** | ExecutionEligibilityGate evaluates transitions against PolicySnapshot |
| **Temporal DAG** | NexusVM supports fork/merge timeline semantics |
