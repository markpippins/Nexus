# Specification: voyager

This document details the implementation specifications for `voyager` (Mildred V2), a filesystem acquisition layer for the Nexus ecosystem.

## 1. The Inference Constraint Hierarchy

To ensure system stability and auditability, `voyager` operates within a strict hierarchy of inference. Each layer consumes outputs from lower layers but is prohibited from redefining lower-layer truth.

1.  **Observation (fs-crawler)**: Observes physical reality (Filesystem snapshots).
2.  **Topology (Topology Engine)**: Describes structural relationships (Geometry/Movement).
3.  **Identity (Identity Engine)**: Preserves entity continuity (Physical/Structural similarity).
4.  **Semantics (LOSM)**: Assigns meaning and concept mapping.
5.  **Intent (WRP)**: Assigns intent to act (Requirement derivation).
6.  **Action (Executor)**: Performs physical actions.

**Core Invariant**: Higher layers (e.g., LOSM) cannot merge entities or redefine observation groupings established by lower layers (Identity).

**Drift Governance Invariant**: Identity is the sole authority on **what** changed (Drift) and **how much** it changed (Magnitude). LOSM is the sole authority on **interpreting semantic significance** (Impact) and **determining system response** (Action Policy). LOSM must never redefine physical drift logic or magnitude thresholds.

## 2. System Capability Contract Matrix (SCCM)

The SCCM defines the authoritative rulebook for what each subsystem is allowed to READ, WRITE, TRANSFORM, and what it must be BLIND TO. This enforces the Inference Constraint Hierarchy at the structural level.

### Subsystem Contracts

| Subsystem | READ SCOPE | WRITE SCOPE | TRANSFORM SCOPE | BLIND TO |
| :--- | :--- | :--- | :--- | :--- |
| **voyager** | Filesystem only | FileObservation, DirectoryObservation, FileDeleted, ObservationEdgeHint, MetadataSpanEmitted | None (No clustering or identity reasoning) | LOSM outputs, Entity graph, WorkRequests |
| **Topology Engine** | Observations, Filesystem adjacency, Change history | TopologySignal | Structural pattern extraction only | Identity entities, Semantic spans, LOSM outputs |
| **Identity Engine** | Observations, TopologySignals, ObservationEdgeHints | IdentityCandidate, Entity, EntityDrift | Continuity clustering & Drift detection | Semantic spans, LOSM outputs, Embeddings, Text content |
| **LOSM (Semantic)** | Entity graph, TopologySignals, MetadataSpanEmitted, EntityDrift | RequirementCandidate | Semantic interpretation only | Raw observations, Identity internals, Physical invariants (inodes) |
| **WRP** | RequirementCandidate, Entity graph (read-only) | WorkRequest, Execution scheduling state | Prioritization, Decomposition, Scheduling | Raw filesystem data, Identity inference logic |
| **Executor** | WorkRequest only | ExecutionRun, Artifact, ExecutionEvent | None (No intent generation) | LOSM, Identity, Topology, Raw observations |

## 3. Forbidden Adjacency Rules

To prevent leakage between layers, the following data flow edges are strictly forbidden:

*   **fs-crawler → LOSM** ❌ (No direct semantic inference)
*   **fs-crawler → WRP** ❌ (No direct requirement derivation)
*   **identity → WRP** ❌ (No direct intent generation)
*   **identity → executor** ❌ (No direct action triggering)
*   **LOSM → identity mutation** ❌ (Semantics cannot redefine structural identity)
*   **WRP → identity mutation** ❌ (Intent cannot redefine identity)
*   **executor → any upstream system** ❌ (Actions cannot rewrite history or inference)

## 4. Enforcement Mechanisms

Correctness is enforced structurally through three layers of validation:

1.  **Schema Enforcement (Compile-time)**: All event types are strictly validated against the SCCM-defined write scopes.
2.  **Transport Filtering (Runtime)**: NATS subjects and access control lists (ACLs) enforce allowed producers and consumers for each event domain.
3.  **Capability Tags (Metadata Layer)**: Every event includes origin metadata, epoch IDs, and source event IDs for provenance. Consumers MUST reject events that violate their read scope or origin constraints.
    ```json
    {
      "origin_layer": "fs-crawler",
      "epoch_id": "uuid-v4",
      "source_event_ids": ["uuid-v4"],
      "allowed_consumers": ["topology", "identity", "losm"]
    }
    ```

## 5. Interface Definitions (Event Schema)

All events follow the **CER (Canonical Event Record)** pre-normalization pattern. Events are emitted to NATS subjects following the pattern `nexus.fs.v1.>`.

### Common Envelope (CER-Ready)
Aligned with `nexus/go/wrp/ccnf-ref/ccnf/types.go`.

```json
{
  "event_id": "uuid-v4",
  "event_version": 1,
  "ccnf_version": 1,
  "system": "nexus",
  "domain": "fs",
  "epoch_id": "uuid-v4", // Identifies the specific scan/acquisition cycle
  "timestamp": 1623050000, // Epoch seconds (int64)
  "source_event_ids": [], // List of IDs (events or domain objects) this event is derived from
  "actor": {
    "id": "voyager-host-01",
    "type": "service"
  },
  "intent": {
    "action": "observe",
    "target_type": "file | directory"
  },
  "payload": { ... }
}
```

### Event Types

#### `FileObservation` (replaces `FileDiscovered`)
Emitted when a file is seen. This is a Layer 1 **Observation** (immutable filesystem snapshot).

*   **Payload**:
    *   `observation_id`: UUID (unique for this specific observation).
    *   `path`: Absolute path to the file.
    *   `size`: File size in bytes.
    *   `mtime`: Last modification time (epoch seconds).
    *   `inode`: Filesystem inode.
    *   `device_id`: Filesystem device ID.
    *   `content_hash`: Optional SHA256 of full content.
    *   `fast_hash`: First 4KB hash for quick identification.
    *   `stat`: Raw stat output (subset).

#### `DirectoryObservation` (replaces `DirectoryDiscovered`)
Emitted when a directory is encountered.
*   **Payload**:
    *   `observation_id`: UUID.
    *   `path`: Absolute path.
    *   `stat`: Raw stat output.

#### `FileDeleted`
Emitted when a previously known path is no longer present.
*   **Payload**:
    *   `path`: Absolute path.
    *   `last_known_observation_id`: UUID.

#### `TopologySignal`
Emitted by the Topology Engine. Models structural-only relationships between observations. It represents the "geometry of information," not semantics.

*   **Payload**:
    *   `signal_id`: UUID.
    *   `observation_ids`: List of related observation UUIDs.
    *   `structure`: 
        *   `type`: "containment | adjacency | symmetry | repetition | evolution | vanishing"
        *   `scope`: "file | directory | subtree"
    *   `geometry`:
        *   `path`: Directory path.
        *   `added_members`: List of structural member names (filenames/dirnames) added since last scan.
        *   `removed_members`: List of structural member names removed since last scan.
        *   `changed_members`: List of structural member names whose state (observation_id) changed.
        *   `status`: "missing_from_scan" (for vanishing signals).
        *   `path_depth`: 0
        *   `branch_factor`: 0
        *   `sibling_similarity`: 0.0
        *   `rename_distance`: 0.0
    *   `pattern`: { `detected_pattern`: "string", `confidence`: 0.0 }
    *   `constraints`: { `purely_structural`: true }

**Key Constraint**: No semantic labels (e.g., "project", "docs") are allowed in the signal.

#### `EntityDrift`
Emitted by the Identity Engine. Represents detected physical changes in a stable entity, including a non-semantic assessment of change magnitude.
*   **Payload**:
    *   `drift_id`: UUID.
    *   `entity_id`: UUID.
    *   `observation_id`: The observation that triggered the drift detection.
    *   `delta`: Object describing the changes (e.g., `{"size": {"old": 100, "new": 120}}`).
    *   `magnitude`: "TRACE | MINOR | MAJOR | MASSIVE" (Physical significance).
    *   `confidence`: float.

#### `ObservationEdgeHint` (replaces `IdentityCandidate` in this layer)
Weak structural signals emitted by the crawler to assist the Identity Engine. Does **not** imply identity authority.
*   **Payload**:
    *   `hint_id`: UUID.
    *   `observation_ids`: [UUID, UUID].
    *   `evidence`: {
        "type": "inode_match | path_continuity | rename_chain",
        "confidence": float
    }

#### `MetadataSpanEmitted`
Emitted by the Extractor Pipeline. Aligns with `nexus/python/ingest/models.py`. Consumed exclusively by **LOSM** for semantic interpretation.
*   **Payload**:
    *   `observation_id`: Reference to the `FileObservation` id.
    *   `span`: { `id`, `text`, `start`, `end`, `span_type`, `confidence`, `features`, `provenance` }

---

## 6. Identity Model (3-Layer Continuity Graph)

Identity is defined as **continuity of existence across structural transformations**, not semantic similarity.

1.  **Layer 1: Observation**: Raw physical truth (inode, device_id, size, mtime, hashes). "Something existed at this point in time."
2.  **Layer 2: Identity Candidate**: Probabilistic hypothesis of continuity generated by the Identity Engine using `ObservationEdgeHints` and `TopologySignals`.
3.  **Physical Drift Assessment**: A sub-stage of Identity that classifies the significance of detected changes (TRACE, MINOR, MAJOR, MASSIVE) before semantic interpretation.
4.  **Layer 3: Entity**: Resolved, stable identity container.

### Identity Engine Internal Structures

*   **PhysicalFingerprint**: Encapsulates the physical invariants of a file or directory.
    ```json
    {
      "device_id": 12345,
      "inode": 67890,
      "size": 1024,
      "mtime": "1623050000"
    }
    ```
*   **IdentityNode**: Represents a persistent entity hypothesis.
    ```json
    {
      "entity_id": "uuid",
      "confidence": 0.0-1.0,
      "created_from": ["observation_id"],
      "state": { "last_seen": "ts", "canonical_path": "...", "inode_history": [] }
    }
    ```
*   **ObservationLink**: A claim of continuity between an observation and an identity.
    ```json
    {
      "from_observation": "uuid",
      "to_identity": "uuid",
      "basis": ["inode_match", "rename_chain", "topology_containment"]
    }
    ```

**Identity Engine Constraints**:
*   **Allowed Signals**: Physical invariants (inode, device_id, size, mtime, hashes) and Structural invariants (topology signals, rename chains, movement coherence).
*   **Prohibited Signals**: File types, extensions, folder names, inferred purpose, LOSM signals, and **embeddings** (Embeddings are semantic and belong to LOSM).
*   **Stability Rule**: Identity is a function of physical + structural continuity only.

---

## 7. Scanner Loop & Acquisition Logic

The scanner focuses on producing **Observations**. It uses a local state cache (Redis) to avoid redundant emissions but remains "wrong in a reversible way."

### Pseudo-code

```python
def scanner_loop(root_paths):
    redis = connect_redis() # Performance cache, not source of truth
    nats = connect_nats()

    for root in root_paths:
        for entry in walk_filesystem(root):
            # 1. Capture Raw Observation
            observation = capture_observation(entry)
            
            # 2. Check Cache (Efficiency only)
            state_key = f"fs:cache:{entry.path}"
            cached_state = redis.get(state_key)
            
            if should_emit(observation, cached_state):
                # 3. Emit Observation Event
                nats.publish("nexus.fs.v1.observation", observation)
                
                # 4. Generate early Observation Edge Hints (Weak signals)
                if cached_state and cached_state.inode == observation.inode:
                    # Structural hint: same inode usually suggests continuity
                    emit_observation_edge_hint(observation.id, cached_state.observation_id, "inode_match")
                
                trigger_extraction_pipeline(observation)
            
            # Update cache
            redis.set(state_key, observation.to_cache_format(), ex=86400)
```

---

## 8. Failure Handling

| Failure Scenario | Strategy |
| :--- | :--- |
| **Permission Denied** | Log and emit `ObservationFailed` event. Do not retry automatically. |
| **NATS Unavailable** | Buffer events locally (Redis list or disk) or halt scanner to prevent loss. |
| **Corrupt File (Extraction)** | Extractor emits `MetadataSpanEmitted` with `span_type: "NOISE"` and error details in features. |
| **Redis Down** | Fallback to "stat everything" mode (performance hit) or wait for recovery. |

---

## 9. Minimum Viable Implementation (MVI)

The MVI focuses on stable acquisition of chat transcripts and PDFs.

1.  **Scanner**: Basic recursive `os.walk` or `pathlib`.
2.  **State**: Redis-backed `mtime` cache.
3.  **Classification**: `python-magic` or file extension mapping.
4.  **Extractors**:
    *   **Text/Markdown**: Basic full-file span.
    *   **HTML (Transcripts)**: Use `nexus/python/ingest/html-importer` logic to extract turns.
    *   **PDF**: `PyMuPDF` or `pdfplumber` to extract text blocks as spans.
5.  **Persistence**: 
    *   NATS for real-time flow.
    *   Postgres for `File` and `Directory` discovery records (sync'ed from NATS).
    *   pgVector for storing initial embeddings of text spans.

---

## 10. Identified Gaps & Priorities

1.  **Identity Resolution (High Priority)**: Building the standalone Identity Engine that consumes hints and signals to produce stable Entities.
2.  **LOSM Input Filtering**: Ensuring LOSM only consumes Entities, Topology, and Spans (no raw observations).
3.  **Refined Topology Evolution (Medium Priority)**: Enhancing the Topology Engine to track move/rename deltas across different paths using inode history.
4.  **Deterministic Serialization (Medium Priority)**: Ensuring `voyager` (Python) produces JSON that matches Go's `ccnf-ref` serialization contract.
5.  **Back-pressure (Low Priority)**: Handling millions of small files without overwhelming NATS or Redis.
6.  **Security (Medium Priority)**: Service account permissions for scanning sensitive transcript folders.
7.  **Vectorization Strategy (High Priority)**: Downstream `ai` agents (LOSM) consume `MetadataSpanEmitted` and store embeddings in `pgVector`.
8.  **Requirement Extraction (High Priority)**: Tuning the extraction for chat transcripts to identify "Requirements" signals.

---

## 11. Epistemic Provenance & Auditability

The system provides a "self-explaining" audit trail by recursively following `source_event_ids` and `epoch_id`.

1.  **Requirement Traceability**: A `RequirementCandidate` emitted by LOSM links back to the `Entity` (Identity) and the `MetadataSpanEmitted` (Semantics). Canonical provenance for semantic objects is the **Entity**, not the raw Observation.
2.  **Identity Traceability**: An `Entity` links back to the `FileObservation` (Observation) events that confirmed its continuity.
3.  **Structural Traceability**: A `TopologySignal` links to the set of `FileObservations` that defined the directory structure at that `epoch_id`.

## 13. Semantic Reaction Policy (LOSM)

LOSM handles physical drift by applying a semantic interpretation and policy to the non-semantic `DriftMagnitude` provided by the Identity Engine.

### 1. Significance Assessment (Inference)
LOSM maps physical magnitude to semantic impact, potentially considering entity context.

| Magnitude | Semantic Impact | Meaning |
| :--- | :--- | :--- |
| **TRACE** | LOW | Minor physical perturbation; meaning likely unchanged. |
| **MINOR** | MEDIUM | Detectable physical change; meaning may have drifted. |
| **MAJOR** | HIGH | Substantial physical change; meaning likely significantly altered. |
| **MASSIVE** | CRITICAL | Total physical overhaul; meaning probably lost or replaced. |

### 2. Action Policy (Governance)
LOSM determines the system's reaction based on the inferred semantic impact.

| Semantic Impact | Action Policy | Description |
| :--- | :--- | :--- |
| **LOW** | IGNORE | No semantic action required. |
| **MEDIUM** | EVALUATE | Re-evaluate if specific requirements are still valid. |
| **HIGH** | REPROCESS | Likely requires partial re-extraction or re-indexing. |
| **CRITICAL** | INVALIDATE | Previous semantic artifacts should be considered stale. |

**Policy Enforcement**:
*   LOSM MUST NOT use `delta` fields (size, mtime) to re-calculate magnitude.
*   LOSM MUST NOT attempt to merge or split entities based on content similarity (that is an Identity Engine role, but restricted to physical invariants).
*   LOSM defines "Significance" (Impact) and "Response" (Action) only in terms of its own semantic domain.

## 12. Infrastructure & Governance Integration

*   **NATS**: Primary transport for all events.
*   **Postgres/pgVector**: Projection storage for "Current State" and semantic index.
*   **Redis**: High-speed lookup for scan efficiency (Observation cache).
*   **CCNF/CER**: Events are designed to be converted into Canonical Event Records.
*   **Governance**: Follows CEGL/ADR as defined in `go/wrp/ccnf-ref`.


 