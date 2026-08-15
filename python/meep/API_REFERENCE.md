# Nexus meep - API Reference

This document details every module, class, and method within the `meep` package.

## Module: `__init__.py`

## Module: `ast_features.py`

### Class: `ASTFeatures`
> Structured features extracted from a parsed AST document.

These features are passed to the IRL classifier alongside the raw
prompt text to improve archetype probability estimation.


### Function: `extract_features(doc)`
> Extract structured features from a parsed AST document. Args: doc: The parsed AST document from ``ast_parser.parse()``. Returns: ASTFeatures with all feature fields populated.

## Module: `ast_parser.py`

### Class: `ASTNode`
> A single node in the document AST.

Attributes:
    node_type: One of ``"document"``, ``"heading"``, ``"paragraph"``,
        ``"code_block"``, ``"list"``, ``"list_item"``, ``"blockquote"``,
        ``"thematic_break"``.
    level: Heading level (1--6) for headings; 0 for everything else.
    content: Text content of the node.
    language: Programming language tag for fenced code blocks.
    children: Child nodes (for document, list).


### Class: `ASTDocument`
> Root AST node representing the entire parsed document.

Attributes:
    nodes: Top-level child nodes (headings, paragraphs, code blocks,
        lists, blockquotes).
    raw_text: The original input text.


### Class: `_ParserState`
> Internal parser state to avoid globals across ``parse()`` calls.

- **Method**: `__init__(lines)`
- **Method**: `flush_paragraph()`
  - Emit the accumulated paragraph as an AST node, if any.
- **Method**: `append_to_paragraph(text)`
  - Append text to the current paragraph or start a new one.
- **Method**: `close_list()`
  - If we're inside a list, stop accumulating list items. The list node is already attached to ``top_level`` by reference, so we just clear the stack.

### Function: `parse(text)`
> Parse raw text into an AST document. Args: text: Raw prompt or document text. Returns: ASTDocument with structured nodes.

### Function: `extract_headings(doc)`
> Return all heading text from the document, in order.

### Function: `extract_code(doc)`
> Return all code block content from the document.

### Function: `extract_body_text(doc)`
> Return all non-heading, non-code text (paragraphs + list items).

## Module: `cer_writer.py`

### Function: `utc_clock()`
> Default clock — returns the current UTC time as an ISO 8601 string.

### Function: `make_execution_id(graph_hash)`
> Generate a deterministic execution ID from the graph's content hash. Args: graph_hash: The ExecutionGraph.content_hash() value. Returns: A short hex execution ID.

### Class: `EventIdGenerator`
> Deterministic event ID counter.

Produces IDs of the form ``evt-{execution_id}-{counter:04d}``.

- **Method**: `__init__(execution_id)`
- **Method**: `next_id()`
  - Generate the next event ID in sequence.

### Function: `make_node_start(event_id, timestamp, execution_id, node_id, handler)`
> Create a NODE_START event. Args: event_id: Unique event identifier. timestamp: ISO 8601 UTC timestamp. execution_id: Execution run identifier. node_id: The node being started. handler: The handler name being invoked. Returns: A CEREvent with type NODE_START.

### Function: `make_node_complete(event_id, timestamp, execution_id, node_id, result)`
> Create a NODE_COMPLETE event. Args: event_id: Unique event identifier. timestamp: ISO 8601 UTC timestamp. execution_id: Execution run identifier. node_id: The node that completed. result: The handler's result dict (becomes the event payload). Returns: A CEREvent with type NODE_COMPLETE.

## Module: `cli.py`

### Function: `parse_args(argv)`
> Parse CLI arguments.

### Function: `read_prompt(args)`
> Read the prompt from args or stdin.

### Function: `main(argv)`
> CLI entrypoint. Returns exit code.

### Function: `_serialise_log(log)`
> Serialise a CERLog to a JSON array of event dicts.

## Module: `handlers.py`

### Function: `_simulated_handler(node_id, config)`
> Generic simulated handler — returns success with no side effects.

### Function: `execute_handler(name, node_id, config)`
> Look up *name* in the registry and call it with *node_id*. Args: name: Handler name (e.g. ``"execute_handler"``). node_id: The node being executed. config: Optional configuration dict. Returns: The handler's result dict. Raises: KeyError: If *name* is not registered.

### Function: `register_handler(name, fn)`
> Register a custom handler function. Used in tests to inject mock handlers, and in Phase 2+ to replace simulated handlers with real implementations.

### Function: `reset_registry()`
> Reset the registry to v1 defaults (simulated handlers only). Useful for test isolation.

## Module: `ir_resolver.py`

### Function: `resolve(result)`
> Resolve an *IRLResult* to a deterministic *IRSelection*. Args: result: Probabilistic classification from the IRL classifier. Returns: A deterministic IRSelection with the winning archetype (or REJECT).

## Module: `irl_classifier.py`

### Function: `classify(prompt, ast_features)`
> Classify a prompt into a probability distribution over archetypes. Args: prompt: Raw text prompt. ast_features: Optional ``ASTFeatures`` from the feature extractor. When provided and the document has structural features (headings, code blocks, lists, or 75+ words), heading text is weighted at 2x and structural bonuses boost archetypes that match the document's shape. Short paragraph-only prompts behave identically to the baseline. Returns: IRLResult with probabilities summing to 1.0 (within float epsilon).

### Function: `_compute_probs(prompt)`
> Compute normalized probabilities from raw text only. Algorithm: 1. Lowercase the prompt. 2. For each functional archetype, count keyword matches. 3. Add the DEFAULT standing reserve. 4. Normalize so the distribution sums to 1.0.

### Function: `_compute_probs_with_features(prompt, features)`
> Compute normalized probabilities using AST structural features. Only called when ``features.has_structural_features`` is True. Adds additional signal on top of the baseline keyword matching: - Heading text keywords contribute an extra +1 per match (2x total) - Structural bonuses boost archetypes that match the document shape - DEFAULT still gets its standing reserve

### Function: `_normalize(raw_scores)`
> Normalize a dict of raw scores to probabilities summing to 1.0.

### Function: `_count_matches(lower, keywords)`
> Count how many keywords match the lowercased prompt text. Single-word keywords use ``\b`` word-boundary matching. Multi-word phrases use simple substring containment.

## Module: `lowering_pass.py`

### Function: `lower(graph)`
> Lower a *WorkRequestGraph* into a frozen *ExecutionGraph*. Args: graph: The mutable work request graph from the spec compiler. Returns: A frozen ExecutionGraph whose content fields cannot be modified. Raises: ValueError: If the graph contains a cycle.

### Function: `lower_with_timestamp(graph, timestamp)`
> Lower with an explicit timestamp (for deterministic tests).

### Function: `_resolve_handler(archetype, node_id)`
> Resolve a WorkNode to a handler function name. Extracts the label key from the node id suffix and looks up the appropriate handler for the archetype.

### Function: `_topological_sort(nodes, edges)`
> Compute topological order using Kahn's algorithm. Returns: Node IDs in topological order (dependency-first). Raises: ValueError: If the graph contains a cycle.

## Module: `models.py`

### Class: `IRLResult`
> Probabilistic classification output from the IRL classifier.

The classifier maps a raw prompt to a probability distribution over
frozen InteractionArchetypes.  IRL never decides structure — it only
proposes probability mass over IR types.


### Class: `IRSelection`
> Deterministic selection from IRL probabilities.

Produced by argmax over IRL probabilities.  If the max probability
falls below the confidence threshold, the selection is REJECT.


### Class: `WorkNode`
> A single unit of work in a WorkRequestGraph.


### Class: `WorkEdge`
> A dependency or trigger relationship between WorkNodes.


### Class: `WorkRequestGraph`
> A directed acyclic graph of work produced by the spec compiler.

Represents the structured decomposition of a prompt into units of
work before the freeze boundary.


### Class: `ExecNode`
> A frozen execution node in the lowered ExecutionGraph.

After the freeze boundary, the handler and config are immutable.


### Class: `FrozenGraphError`
> Raised when attempting to modify an ExecutionGraph after freezing.


### Class: `ExecutionGraph`
> An immutable, frozen execution graph.

Once lowered from a WorkRequestGraph, this graph cannot be modified.
The topological order is computed and frozen at the boundary.

Freeze enforcement:
    ``_freeze()`` sets the internal ``_frozen`` flag.  Once frozen,
    any attempt to modify a field raises ``FrozenGraphError``.
    The ``content_hash()`` method provides a stable fingerprint that
    changes if any content field is modified.

- **Method**: `_freeze()`
  - Lock this graph — no further modifications allowed. Converts mutable list fields to tuples so that in-place mutations (``.append()``, ``.clear()``, etc.) raise ``AttributeError``. Field reassignment raises ``FrozenGraphError`` via ``__setattr__``.
- **Method**: `__setattr__(name, value)`
- **Method**: `content_hash()`
  - Compute a SHA-256 fingerprint of the graph's content fields. Returns the same hash for identical content; a different hash if any content field changes.

### Class: `CEREvent`
> A single event in the append-only CER event log.

Each event includes a hash chain link (prev_event_hash) for tamper
evidence.  Events are never modified, deleted, or reordered after
being appended to the log.


### Class: `CERLog`
> Append-only event log with hash chain integrity.

The only allowed mutation is append().  Once appended, events are
immutable.  The log enforces continuous hash chaining.

- **Method**: `__init__()`
- **Method**: `events()`
  - Return an immutable view of the event log.
- **Method**: `append(event)`
  - Append a CER event to the log. Sets the event's prev_event_hash to the current chain head, then computes the new hash from the event content.
- **Method**: `tail_hash()`
  - The hash of the most recently appended event.
- **Method**: `__len__()`

### Class: `ExecutionState`
> Reconstructed execution state from replaying a CER event log.

Produced by the replay engine — a pure-function reducer that walks
events in order and reconstructs state without side effects.


## Module: `pipeline.py`

### Function: `run_pipeline(prompt, use_ast)`
> Execute the full Phase 1 pipeline from *prompt* to *CERLog*. Args: prompt: Raw text prompt. use_ast: If True (default), run AST preprocessing (Station 0) before the IRL classifier. Set to False to use the raw-text baseline only. Returns: An append-only CER event log produced by executing the prompt. Raises: ValueError: If the pipeline encounters an invalid state.

### Function: `run_and_replay(prompt, use_ast)`
> Run the full pipeline and replay the resulting event log. Returns: (CERLog, ExecutionState) tuple.

## Module: `replay_engine.py`

### Function: `_events_from_input(log)`
> Extract the event sequence from either a CERLog or a raw sequence.

### Function: `_replay_events(events)`
> Core reducer: walk events in order and build ExecutionState.

### Function: `replay(log)`
> Replay the full CER event log and reconstruct the ExecutionState. Parameters ---------- log: CERLog | Sequence[CEREvent] The event log to replay. Accepts either a CERLog instance or a raw sequence of CEREvent objects. Returns ------- ExecutionState Reconstructed execution state after processing all events. Pure function: no side effects, no IO, no mutation of inputs.

### Function: `replay_until(log, n)`
> Replay the event log up to (but not including) event index *n*. Parameters ---------- log: CERLog | Sequence[CEREvent] The event log to replay. n: int The exclusive event index to stop at. ``n=0`` produces the same result as replaying an empty log. Returns ------- ExecutionState Reconstructed execution state as of event *n*. Pure function: no side effects, no IO, no mutation of inputs.

### Function: `replay_to_dag(log)`
> Replay the CER event log into an SM-IR ``StateDAG``. Uses ``ir.state_replay.StateReplayEngine`` to promote each CEREvent into a ``StateVersion`` with version expansion, causal edges, and promotion receipts. Returns a ``StateDAG`` instead of the flat ``ExecutionState``. Parameters ---------- log: CERLog | Sequence[CEREvent] The event log to replay. Returns ------- StateDAG Versioned, causally-addressable state DAG (from ``nexus.python.ir``). Raises ------ ImportError If the IR module is not importable. Pure function: no side effects, no IO, no mutation of inputs.

## Module: `scheduler.py`

### Function: `schedule(graph, clock)`
> Execute a frozen *ExecutionGraph* and produce a *CERLog*. Args: graph: A frozen ExecutionGraph (must have been lowered via ``lowering_pass.lower()``). clock: Optional timestamp provider. Defaults to ``utc_clock``. Pass a fixed-clock lambda for deterministic tests. Returns: An append-only CERLog with hash-chained events. Raises: FrozenGraphError: If *graph* is not frozen (``_freeze()`` not called). ValueError: If the graph's topological order is empty but nodes exist (broken invariant).

### Function: `_find_node(graph, node_id)`
> Linear scan for a node by ID. Tuple lookup (frozen graph stores nodes as a tuple). Linear scan is fine for v1 (graphs are < 10 nodes).

## Module: `spec_compiler.py`

### Function: `compile_selection(selection, prompt)`
> Compile an *IRSelection* into a *WorkRequestGraph*. Args: selection: The deterministic archetype selection. prompt: The original raw prompt (stored in metadata). Returns: A WorkRequestGraph with nodes and edges following the archetype template. Returns an empty graph for REJECT.

## Module: `tests/__init__.py`

