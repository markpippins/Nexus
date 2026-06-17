# Architecture: voyager (Mildred V2)

## Vision
`voyager` is the evolutionary successor to the original Mildred system. It shifts from a relational monolith focused on static state storage to a lightweight, event-driven acquisition layer within the Nexus ecosystem. Its primary mission is to transform filesystem observations into a stream of high-fidelity semantic events.

## Core Goals

### 1. Zero-Normalization Acquisition
- **Lossless Observation**: Capture filesystem objects (files and directories) with minimal initial interpretation.
- **Provenance First**: Maintain strict links back to the source filesystem, capturing exact paths, timestamps, and permissions as the primary signal.
- **Decoupled from Interpretation**: Separation of "what is there" (acquisition) from "what it means" (cognition).

### 2. Semantic Topology Inference
- **Topology as Signal**: Recognize that filesystem structures (nesting, naming conventions) are implicit encodings of ontology, workflows, and intent.
- **Pattern Recognition**: Use configurable pattern matchers (e.g., legacy `directory_pattern` and `directory_amelioration`) to emit semantic hints rather than hardcoded database flags.
- **Structural Semantics**: Treat the directory tree as a graph of relationships rather than just a path string.

### 3. Identity and Entity Resolution
- **Structural Continuity**: Beyond basic hashing, utilize physical invariants (inodes, device IDs) and structural signals to preserve entity identity.
- **Observation Edge Hints**: Emit `ObservationEdgeHint` events from the acquisition layer to assist the downstream Identity Engine.
- **Separation of Identity from Meaning**: Ensure identity resolution is grounded in physical/structural continuity, preventing semantic drift from destabilizing entity stability.

### 4. Nexus Ecosystem Integration
- **Event-Driven**: All observations are emitted as structured events to the `nexus/python/event-pipeline`.
- **Interoperability**: Align with `nexus/python/ingest` patterns (e.g., Span-based metadata) and provide signals for `nexus/python/ai` (LOSM) for deeper content analysis.
- **System of Record**: The Event Pipeline acts as the history; `voyager` is the observer.

### 5. Capability-Governed Distributed Architecture
- **Inference Constraint Hierarchy**: Strict separation between observation, topology, identity, semantics, intent, and execution layers.
- **Cognitive Privilege Boundaries**: Each subsystem is restricted by a "System Capability Contract Matrix" (SCCM) that defines its read/write/transform/blind scopes.
- **Structural Correctness**: Enforcement of forbidden adjacency rules prevents semantic drift from polluting structural truth (e.g., identity resolution is blind to embeddings and inferred purpose).

### 6. Epistemic Provenance and Auditability
- **Self-Explaining Infrastructure**: Every semantic artifact (e.g., a requirement candidate) must be traceable back through its specific contract layers to a raw physical observation.
- **Source Event Links**: Events maintain immutable links to their parent signals (`source_event_ids`), preserving a verifiable chain of custody across the inference hierarchy.
- **Auditability via Boundaries**: System correctness is verified by inspecting boundary compliance (SCCM) rather than just model behavior.

### 7. Temporal Reasoning and Drift Detection
- **Entity Evolution**: Move beyond point-in-time identity to track the evolution of entities over time.
- **Drift as a First-Class Signal**: Explicitly detect and emit changes in physical state (size, mtime, hashes) as `EntityDrift` events, providing a history of transformations.
- **Physical Significance Assessment**: Classify drift magnitude (TRACE to MASSIVE) using non-semantic heuristics to filter noise before semantic re-evaluation.
- **Semantic Reaction Policy**: Formalize the boundary where Identity defines the physical change (Drift) and LOSM defines the semantic significance (Impact) and system response (Action Policy). LOSM is prohibited from redefining physical drift logic.
- **Structural Drift**: Track the evolution of directory subtrees (additions, removals, member state changes) via `TopologySignal` evolution patterns.
- **Governance Context**: Provide the necessary temporal evidence for downstream systems (LOSM, WRP) to assess the significance of change and detect configuration or data drift.

## Data Model Evolution
The legacy `media.sql` model is being transitioned:

| Legacy Concept | V2 Evolution |
| :--- | :--- |
| `asset` table | `FileObservation` / `FileDeleted` events |
| `directory` table | `DirectoryObservation` / `TopologySignal` events |
| `asset` (drift) | `EntityDrift` events |
| `matcher` / `match_record` | `ObservationEdgeHint` -> `IdentityCandidate` |
| `file_handler` | Pluggable `MetadataExtractors` emitting `MetadataSpans` |
| MySQL Schema | Nexus Event Store (Append-only History) |

## Key Components
- **Scanner**: Low-level filesystem crawler optimized for producing immutable Observations.
- **Extractor Pipeline**: Lightweight handlers producing `Spans` for downstream LOSM consumption.
- **Topology Engine**: Infers structural geometry and evolution (nesting, adjacency, drift) from path hierarchies.
- **Identity Engine**: Authority for clustering observations into stable Entities and detecting physical drift based on structural and physical invariants.
- **Event Issuer**: Marshals signals into CER format for the Nexus Event Pipeline.

## Non-Goals
- **Decision Making**: `voyager` does not decide which file to delete or which "artist" is the canonical one. It provides evidence for these decisions.
- **Cognitive Interpretation**: Complex LLM-based understanding is deferred to downstream agents in the `ai` (LOSM) layer.
- **Direct Database Management**: No direct writes to a global relational state; everything goes through the event loop.
