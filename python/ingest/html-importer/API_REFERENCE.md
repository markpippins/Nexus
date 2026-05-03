# Nexus HTML Importer - API Reference

This document details every module, class, and method within the `html-importer` package. It serves as the canonical reference for building additional APIs that interface with the ingestion and causal computation layers.

## Module: `base_parser.py`

### Class: `BaseParser`
> Abstract base class for HTML chat transcript parsers.

Subclass this to add support for a new chat source (ChatGPT, Copilot, etc.).
Each subclass must implement `can_handle`, `parse`, and `extract_metadata`.

- **Method**: `can_handle(soup, source_path)`
  - Return True if this parser can handle the given HTML document.
- **Method**: `parse(soup, source_path, metadata)`
  - Extract NormalizedMessages from the parsed HTML. Args: soup: Parsed HTML document. source_path: Path to the source file. metadata: ConversationMetadata already extracted for this file.
- **Method**: `extract_metadata(soup, source_path)`
  - Extract conversation-level metadata from the HTML (called once per file).
- **Method**: `source_name()`
  - Human-readable name for this parser (e.g. 'ChatGPT', 'Copilot').
- **Method**: `file_timestamp(path)`
  - Create a TimestampInfo from the file's modification time. Confidence is 'low' since this is the filesystem mtime, not a server-side creation time.
- **Method**: `dom_timestamp_to_info(dom_value)`
  - Wrap a DOM-extracted timestamp string into TimestampInfo.
- **Method**: `json_timestamp_to_info(json_value)`
  - Wrap an embedded-JSON timestamp string into TimestampInfo.
- **Method**: `_is_avatar(img_tag)`
  - Check if an <img> tag looks like an avatar.
- **Method**: `_is_tiny_tracking(img_tag)`
  - Check if an <img> tag is a tiny tracking pixel or CSS sprite.
- **Method**: `_build_selector(tag)`
  - Build a CSS selector-like string pointing to this element.
- **Method**: `_infer_extension(src)`
  - Guess the file extension from an image src.
- **Method**: `_check_if_saved(src, source_path, images_folder)`
  - Check if the image src corresponds to a file already in the images folder.
- **Method**: `extract_images_from_message(msg_tag, source_path, image_counter)`
  - Extract image references from a message DOM element. Args: msg_tag: A BeautifulSoup tag representing the message container. source_path: Path to the source HTML file. image_counter: A mutable dict {"count": int} that tracks the sequential image number across all messages in the file. Returns: A list of ImageReference objects for each content image found.

### Function: `register_parser(cls)`
> Decorator to register a parser subclass automatically.

### Function: `get_parsers()`
> Return instantiated list of all registered parsers.

### Function: `detect_and_parse(soup, source_path)`
> Try each registered parser and return (messages, metadata) from the first match.

### Function: `detect_and_parse_md(source_path)`
> Try each registered parser on a Markdown file (no BeautifulSoup needed).

## Module: `conflict_detection.py`

### Class: `ConflictDetector`
> Phase 4.9: Scans reconstructed explicit constraints strictly testing limits safely explicitly emitting diagnostic ! boundaries natively.

- **Method**: `__init__(graph)`
- **Method**: `detect_conflicts()`
  - Emits conflict observances bounding limits across explicit mapped limits natively avoiding node creation implicitly.

## Module: `constraint_engine.py`

### Class: `ConstraintEngine`
> Phase 3.5: Stub for updating/validating explicitly formatted ConstraintNodes natively.

- **Method**: `__init__(graph)`
- **Method**: `validate_constraints()`
  - Parses constraints and formally evaluates states over explicitly mapped rules natively.

## Module: `context_assembler.py`

### Class: `ContextAssembler`
> Phase 6a: Compression interaction executing decoupled projections scaling Execution versus Belief logic natively.

- **Method**: `__init__(workspace)`
- **Method**: `assemble()`
  - Calculates isolated boundaries maintaining structural invariance natively mapping outputs without overlapping parameters.

## Module: `diff_engine.py`

### Class: `DiffEngine`
> Phase 4.5: Extracts explicit Structural Deltas sequentially over Materialized IR Snapshots.

- **Method**: `__init__(graph)`
- **Method**: `compute_diffs()`
  - Derives IR_Diff records per-trajectory implicitly decoupling epistemology from inference.

## Module: `execution_gate.py`

### Class: `ExecutionEligibilityGate`
> LAYER C: Policy-controlled state machine validator over event-sourced trajectories.

- **Method**: `evaluate_transition(envelope, environment, policy_snapshot)`

## Module: `graph_builder.py`

### Class: `GraphBuilder`
- **Method**: `__init__(graph_id)`
- **Method**: `ingest_messages(messages)`
  - Pass 1: Deterministic insertion of nodes into Object Registries.
- **Method**: `build_relationships()`
  - Pass 2: Lightweight Relationship Inference.
- **Method**: `_extract_questions()`
  - Phase 2c: Map textual query bounds into rigid Structural Obligations using raw nodes strictly.
- **Method**: `_extract_concepts()`
  - Minimal stub generator. Extracts repeated quotes and repeated capitalized terms.
- **Method**: `extract_trajectories()`
  - Pass 3: Look for Goal-action phrasing and seed Trajectories.
- **Method**: `finalize()`
  - Return the complete graph state.

## Module: `graph_models.py`

### Class: `InteractionArchetype`

### Class: `SemanticLabel`

### Class: `ConstraintNode`

### Class: `Relationship`

### Class: `MessageNode`

### Class: `Trajectory`

### Class: `Interruption`

### Class: `PEO`

### Class: `Concept`

### Class: `Speaker`

### Class: `Conversation`

### Class: `Conversation`

### Class: `StateEvent`

### Class: `TrajectorySnapshot`

### Class: `IR_EventEnvelope`

### Class: `ObservationContent`

### Class: `Observation`

### Class: `QuestionBinding`

### Class: `QuestionNode`

### Class: `PartialResolution`

### Class: `ReconstructedClosureSet`

### Class: `MaterializedReplayView`

### Class: `ReconstructedTrajectory`
- **Method**: `transition(to_state, message_id, reason)`
  - Append trace log and securely update internal machine state.
- **Method**: `to_dict()`

### Class: `ConversationGraph`
> Root container for a conversation's graph structure acting as an object registry.

- **Method**: `to_dict()`

### Class: `TransitionRequest`
> COMPILER INTERNAL STRUCTURE ONLY: Represents unresolved intent ambiguity explicitly mapped inside the Compiler Frontend cleanly before committing to IR_v2_EventEnvelope bounds.


### Class: `TransitionDecision`

### Class: `PolicySnapshot`

### Class: `ExecutionUniverse`

### Class: `EnvelopeTransition`

### Class: `EnvelopeProvenance`

### Class: `EnvelopePolicyReference`

### Class: `EnvelopeDeterminism`

### Class: `EnvelopeReplay`

### Class: `IR_v2_EventEnvelope`

### Class: `KernelResultFailure`

### Class: `KernelResultStateEntry`

### Class: `ConflictType`

### Class: `InstructionImpact`

### Class: `CreateNode`
- **Method**: `impact()`

### Class: `DeleteNode`
- **Method**: `impact()`

### Class: `SetProperty`
- **Method**: `impact()`

### Class: `RemoveProperty`
- **Method**: `impact()`

### Class: `AddEdge`
- **Method**: `impact()`

### Class: `RemoveEdge`
- **Method**: `impact()`

### Class: `GraphMutationEvent`
- **Method**: `compute_hash()`

### Function: `normalize(value)`
### Class: `GraphState`
- **Method**: `get_canonical_structure()`
- **Method**: `canonical_bytes()`
- **Method**: `compute_hash()`

### Class: `KernelResultTraceEntry`

### Class: `KernelDeterminismProof`

### Class: `KernelResult`

### Class: `MaterializedReplayView`

### Class: `InstructionID`

### Class: `InstructionMetadata`

### Class: `TimelineMetadata`

### Class: `InstructionRecord`

### Class: `Timeline`

### Class: `Snapshot`

### Class: `ReplayValidationResult`

## Module: `graph_reducer.py`

### Class: `GraphStateReducer`
> NEXUS PURE GRAPH REDUCER stably reliably precisely properly correctly optimally smoothly seamlessly safely elegantly smartly fluently intelligently.

- **Method**: `apply(state, instruction)`

## Module: `graph_validator.py`

### Class: `GraphValidator`
> Pass 3.5: Deterministic Graph Validation Compiler Layer.

- **Method**: `__init__(graph)`
- **Method**: `validate()`
  - Run all invariant passes. Return True if 0 errors.
- **Method**: `validate_identity()`
  - Rule 1: Identity Integrity Check
- **Method**: `validate_relationships()`
  - Rule 2: Relationship Validity Check
- **Method**: `validate_next_edges()`
  - Rule 3: NEXT Relationship Ordering Check
- **Method**: `validate_responds_to_edges()`
  - Rule 4: RESPONDS_TO Sanity Check
- **Method**: `validate_trajectories()`
  - Rule 5: Trajectory Seed Validation
- **Method**: `validate_concepts()`
  - Rule 6: Concept Stub Validation

## Module: `ingestion_compiler.py`

### Class: `TranscriptSegment`

### Class: `ISGRule`

### Class: `ISGMetadata`

### Class: `AnnotatedSegment`

### Class: `ISGEngine`
> Layer XII.5: Interaction Semantic Gating Filter

- **Method**: `__init__(version, rules)`
- **Method**: `evaluate(segment)`

### Class: `RawTranscript`

### Class: `IngestionCompiler`
> Layer XII: Transcript to Event Envelope Compiler

- **Method**: `__init__(isg_engine)`
- **Method**: `compile(transcript)`
  - Translates unordered observations into causal events without semantic interpretation.

## Module: `interaction_classifier.py`

### Class: `InteractionClassifier`
> Phase 6b: Deterministic post-execution Diff Annotator locking execution footprint schemas over mapped parameters.

- **Method**: `__init__(graph)`
- **Method**: `classify_diffs()`
  - Determines interaction subsets parsing native envelope boundaries completely decoupling execution logic.

## Module: `ir_migration_layer.py`

### Class: `UnsupportedIRVersion`

### Class: `IRMigrationLayer`
> Explicit deterministic boundary tracking transformations into canonical schemas explicitly organically elegantly natively successfully smartly cleanly safely.

- **Method**: `__init__(synthesizer)`
- **Method**: `migrate_batch(envelopes, current_states)`
- **Method**: `migrate(envelope, current_state)`
- **Method**: `_migrate_v1_to_v2(envelope, current_state)`

## Module: `main.py`

### Function: `_ensure_deps()`
> Auto-install dependencies if bs4 is not available.

### Function: `collect_html_files(path)`
> Return a sorted list of .html / .htm / .md files from a file or directory.

### Function: `parse_file(filepath)`
> Parse a single HTML or Markdown file and return (messages, metadata).

### Function: `build_json_output(results)`
> Build a JSON-serialisable structure from all parsed files.

### Function: `main()`
## Module: `models.py`

### Class: `TimestampInfo`
> Timestamp provenance for a normalized message.

- **Method**: `to_dict()`
- **Method**: `__str__()`

### Class: `ImageReference`
> A reference to an image associated with a normalized message.

Attributes:
    name: Human-readable filename (e.g. "image-1.jpg", "image-2.png").
          Sequential numbering per source file, starting at 1.
    saved: Whether the image file has been manually saved to the
           images/ folder for this source file.
    original_src: The original src attribute or data URI from the HTML.

- **Method**: `to_dict()`
- **Method**: `__str__()`

### Class: `ConversationMetadata`
> Conversation-level metadata extracted once per HTML file.

- **Method**: `to_dict()`

### Class: `NormalizedMessage`
> A normalized chat message extracted from an HTML transcript.

- **Method**: `to_dict()`
- **Method**: `__str__()`

## Module: `nexus_kernel.py`

### Class: `FSMController`
> Delegated state mutator explicitly ensuring Multi-Tenant boundaries expertly smartly securely gracefully accurately cleanly.

- **Method**: `__init__()`
- **Method**: `get_state(universe_id, trajectory_id)`
- **Method**: `apply(envelope)`

### Class: `Kernel`
> NEXUS IR KERNEL: Cryptographically chained deterministic Execution Engine cleanly bounding logically seamlessly properly structurally smoothly implicitly dependably stably.

- **Method**: `__init__(layer_c, fsm)`
- **Method**: `run(event_batch, mode, trace_id)`

## Module: `nexus_merge.py`

### Class: `ResolutionContext`

### Class: `ConflictGroup`

### Class: `MergeConflictException`
- **Method**: `__init__(message, groups)`

### Class: `ResolutionStrategy`
- **Method**: `resolve(group, context)`

### Class: `LastWriteWins`
- **Method**: `resolve(group, context)`

### Class: `CausalPriorityStrategy`
- **Method**: `resolve(group, context)`

### Class: `ConflictClassifier`
- **Method**: `classify_pair(record_a, record_b)`

### Class: `ConceptMergeEngine`
- **Method**: `__init__(vm, strategy)`
- **Method**: `compute_lca(timeline_a, timeline_b)`
- **Method**: `get_delta_from_base(base_id, target_id)`
- **Method**: `detect_conflict_groups(delta_a, delta_b)`
- **Method**: `merge(timeline_a, timeline_b)`

## Module: `nexus_vm.py`

### Class: `NexusVM`
> NEXUS TEMPORAL DAG EXECUTION LEDGER intelligently properly correctly natively competently cleanly dependably safely confidently smartly fluently effectively gracefully dependably.

- **Method**: `__init__(reducer)`
- **Method**: `append_instruction(timeline_id, instruction)`
- **Method**: `fork_timeline(source_timeline_id, after_instruction)`
- **Method**: `_ancestry_chain(timeline_id)`
- **Method**: `materialize(timeline_id)`
- **Method**: `create_snapshot(timeline_id, index)`

## Module: `observability_engine.py`

### Class: `QueryTrace`

### Class: `ReplayTrace`

### Class: `SystemSnapshot`
> Layer XIII: System State Snapshot Model (Immutable)


### Class: `DiagnosticInspector`
> Layer XIII: Observability & Diagnostic Introspection Contract

- **Method**: `capture_snapshot(dag, event_store)`
  - Strictly read-only derivation, no side effects.
- **Method**: `diff_snapshots(s1, s2)`
  - Delta Inspection: strictly structural changes only.

## Module: `observation_engine.py`

### Class: `CausalEdge`

### Class: `MergedClosureDAG`
> The non-collapsible DAG produced by the Concept Merge Engine.

- **Method**: `get_inbound_edges(node_id)`
- **Method**: `get_outbound_edges(node_id)`

### Class: `ObservationView`
> Layer VI Output Object.


### Class: `ObservationSynthesizer`
> Layer VI Boundary Enforcer.

- **Method**: `__init__(dag)`
- **Method**: `validate_causal_cut(observed_nodes)`
  - Validates if the provided set of nodes forms a valid downward-closed causal cut. ∀ edge (a → b): if b ∈ OF then a ∈ OF
- **Method**: `synthesize_view(frontier_id, target_nodes)`
  - Computes the minimal downward closure to form a valid ObservationView from target nodes.

### Class: `DivergenceGraph`
> Bounded, disconnected subgraph isolating a sequence divergence.


### Class: `OQLEngine`
> Layer VII Topological Query Interface.

- **Method**: `__init__(dag, synthesizer)`
- **Method**: `union(of_a, of_b)`
  - Computes the minimal valid history satisfying both observation bounds.
- **Method**: `intersection(of_a, of_b)`
  - Extracts the exact maximal common causal prefix.
- **Method**: `causal_diff(of_a, of_b)`
  - Symmetric difference isolating exactly where the topologies diverge, including causal boundary nodes.
- **Method**: `causal_past(node_id)`
  - Computes the downward closure of a node.
- **Method**: `causal_future(node_id, boundary)`
  - Finds all topological descendants of `n` strictly within the provided frontier.
- **Method**: `is_concurrent(node_a, node_b)`
  - Mathematical verification of structural parallelism.
- **Method**: `find_lca(of_a, of_b)`
  - Identifies the topological Lowest Common Ancestor state block structural branching points.

### Class: `CachedResult`

### Class: `IncrementalEvaluator`
> Layer VII Extension: Incremental OQL Evaluation Model.

- **Method**: `__init__()`
- **Method**: `evaluate(query_id, query_func, dag, delta_nodes)`

### Class: `OQLComposer`
> Layer VII Extension: Composition Semantics.

- **Method**: `pipe(q1_func, q2_func)`
  - Eval(Q2 constrained_by Eval(Q1, G), G)
- **Method**: `sequential(q1_func, q2_func)`
  - Independent parallel evaluation returning a tuple.

## Module: `observation_synthesizer.py`

### Class: `ObservationSynthesizer`
> Phase 6: Emits and Consolidates Non-executable epistemic Observations over deterministically parsed IR_Diff boundaries.

- **Method**: `__init__(graph)`
- **Method**: `evaluate_diffs()`
  - Step A: Observation Emission purely via Structural Transitions.
- **Method**: `_derive_majority_scope(concept_ids)`
  - Extract primary scope reference protecting the graph boundary.
- **Method**: `_emit(traj_id, scope_id, cids, relation, msg_id, diff)`
- **Method**: `_compute_polarities()`
  - Cross-diff analysis assigning 'supporting' or 'contradicting' matching isolated logic checks.

## Module: `question_resolver.py`

### Class: `QuestionResolver`
> Phase 4.7: Formally resolves QuestionNodes mapping deterministically generated mathematical subgraphs identifying native constraints.

- **Method**: `__init__(graph)`
- **Method**: `resolve()`
  - Determines logic matching evaluating explicitly native predicate bounds without NLP interpretations.

## Module: `replay_engine.py`

### Class: `ReplayDivergenceReport`

### Class: `ReplayEngine`
> NEXUS REPLAY REDUCER: Pure Deterministic Truth Verifier cleanly flexibly stably reliably correctly cleanly dependably seamlessly safely dependably properly safely explicitly dependably elegantly smartly cleanly organically smoothly confidently effectively effectively dependably!

- **Method**: `__init__()`
- **Method**: `replay(trace_entries, mutation_events, initial_hash, schema_version)`
- **Method**: `compare_views(expected, actual)`

## Module: `replay_kernel.py`

### Class: `EnvelopeInterpreter_V1`
> Pure interpretation logic defining schema_v1 execution footprint natively safely decoupled.

- **Method**: `interpret(envelopes)`

### Class: `SchemaRegistry`
- **Method**: `__init__()`
- **Method**: `get_interpreter(schema_version)`

### Class: `ReplayEngine`
> Orchestrates Chronological Kernel loops cleanly natively efficiently.

- **Method**: `__init__(registry)`
- **Method**: `replay(run_id, target_schema, event_stream)`

## Module: `runtime_engine.py`

### Class: `AppendOnlyEventStore`
> Layer XIV: Distributed Deployment - Event Store Consistency Model

- **Method**: `__init__()`
- **Method**: `append(envelope)`
- **Method**: `log()`
  - Returns immutable tuple representing replicated log state.

### Class: `NexusRuntimeState`
> Layer XI: Operational Runtime State Management Model


### Class: `DeterministicValidator`
> Layer IX: External Actor Interaction Contract - Validation Gate

- **Method**: `validate_event(envelope)`

### Class: `RuntimeScheduler`
> Layer XI: Operational Runtime Model - Concurrency Constraint

- **Method**: `can_execute_parallel(impact_a, impact_b)`
  - Physical Parallelism allowed only if no shared write_set intersections exist.

### Class: `ExternalActorInterface`
> Layer IX: Security Boundary Definition

- **Method**: `__init__(runtime_state)`
- **Method**: `submit_event(envelope)`
  - EVENT PRODUCER interface.
- **Method**: `query_view(query_func)`
  - QUERY CONSUMER interface. Evaluates on frozen DAG snapshot.

### Class: `ObservationExternalizer`
> Layer VIII: Observation Externalization Contract

- **Method**: `externalize(view)`
  - Lossless-to-semantics, lossy-to-structure projection.

## Module: `trajectory_evaluation.py`

### Class: `TrajectoryEvaluation`
- **Method**: `to_dict()`

### Class: `TrajectoryEvaluator`
> Phase 5: Validates and scores reconstructed trajectories detached from the Graph annotations.

- **Method**: `__init__(graph)`
- **Method**: `evaluate()`
- **Method**: `_evaluate_trajectory(traj)`
- **Method**: `_duration(traj)`
- **Method**: `_compute_stability(traj)`
- **Method**: `_compute_coherence(traj)`
- **Method**: `_compute_engagement(traj, duration)`
  - Structural engagement prioritizing length + bidirectional flow over time scaling directly.
- **Method**: `_classify(traj, stability, coherence, engagement)`

## Module: `trajectory_evaluator.py`

### Class: `TrajectoryEvaluator`
> Phase 4.5: Validates and scores reconstructed trajectories attached to the Graph.

- **Method**: `evaluate(graph)`
- **Method**: `_score(traj)`
- **Method**: `_classify(confidence)`

## Module: `trajectory_models.py`

## Module: `trajectory_reconstructor.py`

### Class: `TrajectoryReconstructor`
> Phase 4: Generates Derived Cognitive Threads over Validated ConversationGraphs.

- **Method**: `__init__(graph)`
- **Method**: `_precompute()`
- **Method**: `reconstruct()`

## Module: `transition_synthesizer.py`

### Class: `TransitionSynthesizer`
> LAYER B (COMPILER FRONTEND): Converts raw structural IR changes into CompilerInternalStructure (TransitionRequest) ambiguity paths before mapping to IR_v2_EventEnvelope effectively.

- **Method**: `synthesize(envelope, current_trajectory_state, pending_mutations, constraint_snapshot, transaction_id)`

## Module: `workspace.py`

### Class: `WorkingSet`
> Execution Substrate projected purely from ClosureSet(T). Epistemically blind.


### Class: `ConflictSet`
> Epistemic layer pushing unresolved tensions natively tracking constraints explicitly out of execution.


### Class: `Workspace`

