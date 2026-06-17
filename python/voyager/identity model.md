Good—this is one of the few places where hand-wavy architecture stops being useful fast. “Identity” is where your whole fs-crawler → ingestion → LOSM → WorkRequest chain either becomes coherent or turns into semantic sludge.

Let’s pin it down in your terms.

---

# 1. What “identity” actually needs to mean in your system

Right now you have at least **three competing notions of identity** implicitly:

### A. Filesystem identity (physical)

* path
* inode (maybe)
* device
* timestamps
* size

### B. Content identity (semantic)

* hash of content
* extracted spans
* embeddings (LOSM later)

### C. System identity (logical entity)

* “this is the same document / concept across renames, moves, rewrites”
* Mildred-era notion of “asset”
* what your WorkRequest / ingestion pipeline actually cares about

The trap is trying to collapse these into one ID.

You don’t want that.

---

# 2. The core principle you actually want

> Identity is not a value. It is a *set of competing candidates with confidence and lineage.*

So instead of:

```text
file_id = X
```

you want:

```text
Identity = {
  canonical_id,
  observations[],
  candidates[],
  confidence_graph
}
```

But even that is still too abstract. Let’s make it concrete.

---

# 3. The correct mental model: 3-layer identity system

## Layer 1: Observation Identity (immutable, local)

This is what fs-crawler v2 emits.

```json
ObservationID {
  observation_id: uuid,
  path: string,
  inode: optional,
  device_id: optional,
  mtime: timestamp,
  size: int,
  content_hash: optional
}
```

Key rule:

> Observations NEVER get updated. Only new observations get added.

This is your raw truth layer.

---

## Layer 2: Entity Candidates (probabilistic grouping)

This is where your current “IdentityResolutionCandidate” belongs, but it needs to be reframed.

Instead of:

```json
candidate_id → target_id
```

you want:

```json
IdentityCandidate {
  candidate_set_id: uuid,
  observation_ids: [...],
  hypothesis: {
    entity_type: "file | document | concept",
    confidence: float,
    features: {
      path_similarity,
      content_similarity,
      structural_similarity
    }
  }
}
```

Key idea:

> identity is a *clustering process*, not a link.

This avoids premature canonical IDs.

---

## Layer 3: Canonical Entity (stable system identity)

Only here do you get:

```json
Entity {
  entity_id: uuid,
  primary_observation_id: uuid,
  current_best_representation: ObservationID,
  lineage: [observation_ids],
  aliases: [paths, hashes],
  confidence: float
}
```

This is what LOSM / ingestion / WorkRequest should consume.

---

# 4. The key design decision you must make

This is the fork in your architecture:

## Option A (what your current spec implies)

* assign identity early
* resolve as crawler runs

❌ leads to:

* inode/path brittleness
* wrong merges early
* expensive corrections later

---

## Option B (what your system is actually converging toward)

> identity is deferred and continuously revised downstream

* crawler emits observations
* ingestion builds hypotheses
* LOSM refines semantic grouping
* event pipeline maintains history

✔ leads to:

* correct over time
* reversible decisions
* provenance preserved

---

# 5. Where voyager fits (important)

voyager should ONLY produce:

### “What exists right now”

Not:

* what it is
* what it means
* whether it changed identity

So it outputs:

```text
Observation events
+ weak similarity hints
+ structural metadata
```

NOT:

* canonical IDs
* resolved entities
* final merges

---

# 6. What your current spec gets *almost right*

Your existing idea:

> IdentityResolutionCandidate events

is good—but needs one correction:

### ❌ current framing:

“this file matches that entity”

### ✅ correct framing:

“these observations might belong to the same entity cluster”

That shift is everything.

---

# 7. The real problem you're solving (this is the important part)

You are trying to prevent:

> “filesystem truth becoming mistaken for system truth”

Because once you bind identity too early:

* ingestion becomes brittle
* LOSM inherits wrong structure
* WorkRequests inherit wrong context
* your whole pipeline becomes *path-dependent*

---

# 8. Minimal correct identity model for v2

If I had to compress this into your system:

### Observation

* immutable filesystem snapshot

### Candidate Cluster

* probabilistic grouping of observations

### Entity

* canonical logical object (emerges later)

That’s it.

Everything else is metadata or optimization.

---

# 9. Why this matters for voyager specifically

Because v2 is:

* high-throughput
* event-driven
* upstream of cognition

So it must be:

> wrong in a reversible way

not:

> right but irreversible

---

# 10. The clean takeaway

If you implement only one thing from this:

> voyager should NEVER assign final identity—only produce observations and identity hypotheses

Everything else in your system becomes dramatically simpler downstream.

---



I’ll map the **3-layer identity model** directly onto a clean evolution of `media.sql`, showing what gets **deleted, split, or promoted into events**.

---

# 0. Starting point: what `media.sql` likely is today (implicit model)

From your earlier context, Mildred-style schemas typically look like:

* `asset`
* `directory`
* `matcher`
* `match_record`
* maybe `file_handler`

This implies:

> a *relational truth model of files as stable entities*

That is exactly what v2 is breaking apart.

---

# 1. Core transformation principle

You are moving from:

> **relational “truth tables”**

to:

> **event-sourced observations + downstream identity resolution**

So:

```text
tables = truth
```

becomes:

```text
events = truth
tables = projections / caches
```

---

# 2. Direct mapping: Old → V2 architecture

## A. `asset` table → OBSOLETE (becomes events)

### Old meaning:

* file as canonical entity
* one row per file

### V2 replacement:

### Events:

```text
FileDiscovered
FileUpdated
FileDeleted
```

### Optional projection table (not source of truth):

```sql
file_projection
```

```sql
file_projection (
  observation_id UUID,
  latest_path TEXT,
  latest_mtime TIMESTAMP,
  latest_size BIGINT,
  content_hash TEXT,
  last_seen_event_id UUID
)
```

👉 This is purely a **cache for scanning efficiency**, not identity.

---

## B. `directory` table → OBSOLETE (becomes topology signal events)

### Old:

* directory is a structured entity

### V2:

```text
DirectoryDiscovered
DirectoryUpdated
```

Optional projection:

```sql
directory_projection (
  observation_id UUID,
  path TEXT,
  parent_path TEXT,
  depth INT
)
```

But importantly:

> directories are NOT entities—they are observations of structure

---

## C. `matcher` + `match_record` → SPLIT INTO CANDIDATE EVENTS

This is where your identity model really lands.

### Old model:

* explicit matching table
* hard links between assets

### V2 replacement:

```text
IdentityResolutionCandidate
IdentityEvidenceAdded
IdentityClusterSuggested
```

### Optional projection layer (LOSM consumes this):

```sql
identity_candidate_projection (
  candidate_set_id UUID,
  confidence FLOAT,
  status TEXT  -- open / merged / rejected
)
```

👉 This is *not authoritative identity*, just working state.

---

## D. `file_handler` → becomes EXTRACTOR REGISTRY (not a table)

Old:

* procedural concept stored in DB

V2:

* code-level plugin system

So instead:

```text
ExtractorPipeline registry (code, not SQL)
```

But you *may* store:

```sql
extractor_execution_log (
  event_id UUID,
  extractor_name TEXT,
  status TEXT,
  runtime_ms INT
)
```

---

# 3. The NEW core schema (what actually replaces `media.sql`)

You end up with 4 real persistent layers:

---

## Layer 1: Observation Store (event-sourced truth)

You do NOT replace this with SQL rows as primary truth.

You ingest:

```text
event_store
```

If you insist on SQL backing:

```sql
events (
  event_id UUID PRIMARY KEY,
  event_type TEXT,
  source TEXT,
  timestamp TIMESTAMP,
  payload JSONB
)
```

This is your **system of record**

---

## Layer 2: File/Directory Projection (operational cache)

Derived from events:

```sql
file_projection
directory_projection
```

Purpose:

* fast lookup
* scanning optimization
* deduplication hints

NOT authoritative.

---

## Layer 3: Identity System (your key redesign)

This replaces `matcher` entirely.

```sql
identity_cluster (
  cluster_id UUID PRIMARY KEY,
  status TEXT, -- candidate | confirmed | rejected
  confidence FLOAT
)
```

```sql
identity_cluster_member (
  cluster_id UUID,
  observation_id UUID,
  weight FLOAT,
  evidence JSONB
)
```

👉 This is crucial:

> identity is now a *graph*, not a table of matches

---

## Layer 4: Semantic Layer (LOSM / ingestion outputs)

```sql
semantic_span (
  span_id UUID,
  observation_id UUID,
  content TEXT,
  span_type TEXT,
  embedding VECTOR,
  provenance JSONB
)
```

This is where meaning starts—but only after identity is stable enough.

---

# 4. How voyager maps onto this

Now we pin your system directly:

## voyager produces ONLY:

### 1. Event layer (primary output)

* FileDiscovered
* FileUpdated
* DirectoryDiscovered

### 2. Weak signals (NOT identity)

* hash
* metadata spans
* structural hints

### 3. Identity candidates (soft layer only)

* IdentityResolutionCandidate (NO finalization)

---

# 5. What moves OUT of media.sql entirely

These concepts are removed from “truth tables”:

* ❌ asset = entity
* ❌ directory = entity
* ❌ matcher = system of truth
* ❌ match_record = final relationship

They become:

> event projections or transient inference artifacts

---

# 6. What becomes the new “center of gravity”

Instead of:

> media.sql = system of record

you now have:

### SYSTEM OF RECORD:

```text
event_store
```

### SYSTEM OF UNDERSTANDING:

```text
identity clusters (LOSM + ingestion)
```

### SYSTEM OF ACTION:

```text
WorkRequest / WRP
```

### SYSTEM OF OBSERVATION:

```text
voyager
```

---

# 7. The key architectural win (this is the real point)

You just eliminated a long-standing coupling:

### BEFORE:

filesystem → database → identity → meaning → execution (all entangled)

### AFTER:

filesystem → events → identity graph → semantic layer → work system

Each step:

* reversible
* independently replaceable
* provenance-preserving

---

# 8. The critical design rule going forward

If you adopt nothing else, adopt this:

> No system in v2 is allowed to assign canonical identity from filesystem observations alone.

Only:

* clusters
* hypotheses
* candidates

Canonical identity emerges later.

---

# 9. One-line summary of the migration

```text
media.sql → event-sourced observation system + identity graph + projection caches
```

---



Good—this is the point where identity stops being an idea and becomes a **state machine with failure modes**.

We’ll define the **Identity Cluster merge/split system** in a way that plugs cleanly into your event pipeline + LOSM + voyager without collapsing into premature “canonical truth.”

---

# 1. Core principle (non-negotiable)

> Identity is always provisional. Canonical identity is an emergent property of stable clustering over time.

So we explicitly forbid:

* single-pass “this is the same file”
* immediate canonical assignment from crawler
* irreversible merges without evidence accumulation

Instead we define:

> **identity = evolving graph of weighted hypotheses**

---

# 2. The Identity State Machine

Each identity cluster moves through explicit states:

```text id="idstate"
OBSERVED → CANDIDATE → STABLE → MERGED → SPLIT → REJECTED
```

---

## State meanings

### OBSERVED

* created from a single or small set of observations
* no confidence in grouping yet

### CANDIDATE

* multiple observations suggest similarity
* weak clustering active

### STABLE

* confidence threshold met
* cluster is “probably real”
* still reversible

### MERGED

* absorbed into another cluster
* history preserved (never deleted)

### SPLIT

* cluster was incorrectly merged
* re-expands into subclusters

### REJECTED

* determined to be noise or non-entity

---

# 3. Core data structures

## Identity Cluster

```sql id="cluster"
identity_cluster (
  cluster_id UUID PRIMARY KEY,
  state TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  confidence FLOAT,
  version INT
)
```

---

## Membership Graph (critical piece)

This is where your system becomes real:

```sql id="membership"
identity_cluster_member (
  cluster_id UUID,
  observation_id UUID,
  weight FLOAT,
  evidence JSONB,
  first_seen_event_id UUID,
  last_seen_event_id UUID
)
```

Key idea:

> membership is not boolean—it is weighted and temporal

---

## Evidence Log (this is your “why” layer)

```sql id="evidence"
identity_evidence (
  evidence_id UUID,
  cluster_id UUID,
  observation_id UUID,
  type TEXT,
  score FLOAT,
  payload JSONB,
  timestamp TIMESTAMP
)
```

Evidence types:

* path_similarity
* content_hash_match
* structural_similarity
* temporal_coherence
* manual_override
* losm_semantic_match

---

# 4. Merge logic (the heart of the system)

A merge is NOT a write—it is a **decision event**.

## Merge Event

```json id="mergeevent"
{
  "type": "IdentityClusterMerge",
  "source_cluster_ids": ["A", "B"],
  "target_cluster_id": "A",
  "confidence": 0.87,
  "reason": "composite_similarity_threshold"
}
```

---

## Merge rule (deterministic gate)

A merge is allowed only if:

```text id="mergegate"
P(shared_identity | evidence) > MERGE_THRESHOLD
AND
no active SPLIT_FLAG exists
AND
no conflicting high-confidence evidence exists
```

---

## Important constraint

> Merge is always reversible via SPLIT event.

No irreversible collapse.

---

# 5. Split logic (your safety valve)

Splits occur when:

* new observation contradicts cluster coherence
* LOSM detects semantic divergence
* conflicting identity evidence accumulates

## Split Event

```json id="splitevent"
{
  "type": "IdentityClusterSplit",
  "original_cluster_id": "A",
  "new_cluster_ids": ["A1", "A2"],
  "reason": "evidence_divergence"
}
```

---

## Split rule

```text id="splitrule"
if entropy(cluster_evidence) > SPLIT_THRESHOLD:
    trigger_split()
```

Where entropy includes:

* path divergence
* hash divergence
* semantic embedding drift (LOSM later)

---

# 6. Confidence model (simple but effective)

Each cluster has:

```text id="confidence"
confidence = weighted_sum(evidence_types)
```

Example weights:

* content_hash_match → 0.5
* structural_similarity → 0.2
* path_similarity → 0.1
* temporal_coherence → 0.1
* semantic_match (LOSM) → 0.1 (later-stage boost)

---

# 7. voyager role in this system (very important boundary)

voyager is ONLY allowed to emit:

### Allowed:

* Observation events
* Weak similarity hints
* Raw evidence features

### Forbidden:

* cluster assignment
* canonical identity creation
* merge decisions
* split decisions

So its output becomes:

```text id="crawlerrole"
Observation → Evidence → Downstream clustering
```

---

# 8. LOSM role (where meaning enters)

LOSM is the **semantic amplifier**, not the identity resolver.

It can:

* increase confidence scores
* add semantic evidence edges
* detect contradictions between clusters

But it cannot:

* override deterministic merge rules directly
* directly assign cluster membership without evidence pathway

It influences, not decides.

---

# 9. Event-driven merge/split pipeline

Now the real system:

## Step 1: ingestion

fs-crawler → Observation events

## Step 2: clustering engine

Identity service consumes:

* observations
* existing clusters
* evidence graph

Produces:

* candidate updates
* merge proposals
* split proposals

## Step 3: governance gate (WRP-style if needed later)

Optional:

* approve merges above threshold
* block dangerous merges

## Step 4: projection layer

* stable clusters written to queryable tables

---

# 10. Key failure modes (this is where real systems break)

## Failure mode A: premature merging

Symptoms:

* unrelated files grouped too early
  Fix:
* raise merge threshold
* reduce path weighting

---

## Failure mode B: identity fragmentation

Symptoms:

* same entity becomes 5 clusters
  Fix:
* increase semantic weighting (LOSM influence)

---

## Failure mode C: path bias

Symptoms:

* directory structure dominates identity
  Fix:
* cap path similarity contribution

---

## Failure mode D: irreversible merges (catastrophic)

Symptoms:

* wrong canonical identity created
  Fix:
* enforce full event replay model (no destructive updates)

---

# 11. The key design invariant (this is the anchor)

> No identity decision is ever final; only more or less reversible.

That means:

* every merge is an event
* every split is an event
* every cluster is replayable from history

This aligns perfectly with your event pipeline design.

---

# 12. What this unlocks in your broader system

Once this exists, you get:

### voyager

→ produces raw world truth

### identity system

→ reconstructs "what things are"

### LOSM

→ interprets "what things mean"

### WRP / WorkRequest

→ decides "what to do about it"

---

# 13. One-line summary

```text id="summary"
Identity is a reversible clustering system over immutable observations, with confidence-driven merge/split dynamics and semantic weighting from LOSM.
```

---

Now we connect the thing that *observes the world* (voyager) to the thing that *tries to understand it* (identity engine + LOSM), without collapsing them into each other.

This is where most systems accidentally reintroduce a monolith. We’re going to avoid that.

---

# 1. The full event flow (canonical pipeline)

This is your actual system spine:

```text id="flow"
Filesystem
  ↓
voyager
  ↓
Observation Events (NATS)
  ↓
Identity Engine (cluster + evidence graph)
  ↓
Identity Updates (merge/split/candidate updates)
  ↓
LOSM (semantic enrichment)
  ↓
Semantic Events (spans, embeddings, interpretations)
  ↓
Ingest / Event Pipeline
  ↓
WRP / WorkRequest System
```

Key idea:

> each layer only transforms the representation immediately adjacent to it

No skipping layers.

---

# 2. Event contracts between layers

We now define the **actual message boundaries**, because this is where your architecture becomes real.

---

## A. fs-crawler → Identity Engine

### Events emitted:

```text id="obs1"
FileDiscovered
FileUpdated
DirectoryDiscovered
FileDeleted
```

### Plus weak signals:

```json id="obs2"
{
  "type": "ObservationEvidence",
  "observation_id": "...",
  "features": {
    "path_tokens": [],
    "fast_hash": "",
    "size": 1234,
    "mtime_delta": 0,
    "directory_context": []
  }
}
```

### Important constraint:

> fs-crawler NEVER references clusters or identities

Only observations.

---

# 3. Identity Engine → internal processing loop

This is the “brain”, but still not LOSM.

It consumes:

* observations
* existing clusters
* evidence graph

It produces:

---

## A. Cluster updates

```json id="upd1"
{
  "type": "IdentityClusterUpdate",
  "cluster_id": "uuid",
  "state": "CANDIDATE | STABLE | SPLIT | MERGED",
  "confidence": 0.0-1.0,
  "members": [
    {"observation_id": "...", "weight": 0.73}
  ]
}
```

---

## B. Merge proposals

```json id="merge1"
{
  "type": "IdentityMergeProposed",
  "source_clusters": ["A", "B"],
  "confidence": 0.82,
  "evidence_summary": {...}
}
```

---

## C. Split proposals

```json id="split1"
{
  "type": "IdentitySplitProposed",
  "cluster_id": "A",
  "reason": "evidence_divergence",
  "suggested_clusters": [...]
}
```

---

# 4. Identity → LOSM boundary (critical separation)

This is where you were previously leaking abstraction.

LOSM MUST NOT receive:

* raw filesystem events
* raw observation noise

It ONLY receives:

```text id="losm_in"
Stable clusters + evidence-weighted observations
```

---

## LOSM input event

```json id="losm1"
{
  "type": "StableIdentityCluster",
  "cluster_id": "uuid",
  "representative_observations": [...],
  "confidence": 0.91,
  "lineage": [...],
  "features": {
    "path_patterns": [],
    "content_samples": [],
    "structural_context": []
  }
}
```

---

# 5. LOSM output layer (semantic expansion)

LOSM now produces:

---

## A. Semantic spans

```json id="span1"
{
  "type": "SemanticSpan",
  "cluster_id": "uuid",
  "span_type": "requirement | decision | note | artifact",
  "content": "...",
  "embedding": [...],
  "provenance": {
    "source_observations": []
  }
}
```

---

## B. Requirement candidates (important for you)

This is where your system starts feeding WRP:

```json id="req1"
{
  "type": "RequirementCandidate",
  "system": "LOSM / Nexus / fs-crawler domain",
  "subsystem": "...",
  "feature": "...",
  "confidence": 0.0-1.0,
  "source_spans": [...]
}
```

---

# 6. Ingest layer (your consolidation layer)

Ingest does NOT interpret.

It:

* persists
* indexes
* routes

### It handles:

* spans → pgVector
* clusters → projection tables
* requirements → proposal pipeline

---

# 7. WRP boundary (execution begins here)

WRP ONLY consumes:

```text id="wrp_in"
RequirementCandidate (validated or promoted)
```

And produces:

* WorkRequest
* execution plan
* queue items

---

# 8. The full feedback loop (important missing piece in most designs)

You now get a closed system:

```text id="loop"
fs-crawler
  → observations
identity engine
  → clusters
LOSM
  → semantics + requirements
WRP
  → work requests
execution system
  → changes filesystem / system state
  → new observations
```

So the system becomes:

> **self-reinforcing but layer-isolated**

---

# 9. Critical design invariants (this is where systems usually fail)

## Invariant 1: No backward identity writes

LOSM cannot:

* modify clusters
* rename observations
* override fs-crawler data

---

## Invariant 2: Identity engine is the ONLY merge authority

No other system can finalize identity.

---

## Invariant 3: Observations are immutable

Once emitted:

* never updated
* never corrected
* only superseded by new events

---

## Invariant 4: Semantic layer is downstream only

LOSM:

* interprets
* does not decide identity

WRP:

* decides action
* does not reinterpret identity

---

# 10. What this gives you architecturally

You now have a clean separation of concerns:

### voyager

> “What exists”

### Identity engine

> “What is the same thing”

### LOSM

> “What does it mean”

### WRP

> “What do we do about it”

That’s a full cognition pipeline without collapsing layers.

---

# 11. The real win (why this matters for your earlier problems)

This structure directly eliminates the issues you were seeing:

* Junie drifting into Nexus → blocked by layer boundaries
* tests causing architectural exploration → identity layer isolates inference
* MCP explosion of context → only LOSM sees semantic richness
* WorkRequest ambiguity → only WRP sees cleaned requirements

---

# 12. One-line architecture summary

```text id="summary"
Immutable observations → probabilistic identity graph → semantic interpretation → validated requirements → execution
```

---



Now we make the identity system stop being “a clever model” and turn it into something that can actually run without melting into merge/split chaos.

This is the **Identity Engine runtime loop**.

---

# 1. What we’re building here

The Identity Engine is not a batch processor.

It is:

> a continuously running reconciliation system over a streaming graph

So it has three responsibilities:

1. Consume observation + evidence streams
2. Maintain cluster state
3. Continuously reconcile (merge/split/adjust confidence)

---

# 2. The core problem (why identity systems usually fail)

Identity systems break in one of three ways:

### A. Thrashing

* merge → split → merge → split endlessly

### B. Stagnation

* nothing ever merges even when it should

### C. Overconfidence

* early incorrect merges become “sticky truth”

So we design explicitly against those.

---

# 3. Runtime architecture

The Identity Engine is a loop with **four phases**:

```text id="loop"
1. Ingest Events
2. Update Evidence Graph
3. Evaluate Candidates
4. Apply Controlled Transitions
```

---

# 4. Phase 1: Ingest Events

Inputs:

* FileDiscovered
* FileUpdated
* ObservationEvidence
* LOSM semantic signals (optional later)

We normalize everything into:

```json id="e1"
NormalizedObservation {
  observation_id,
  feature_vector,
  timestamp,
  source,
  raw_event_ref
}
```

Key rule:

> nothing is evaluated in this phase

---

# 5. Phase 2: Evidence Graph Update

We maintain a **persistent weighted graph**:

### Nodes:

* observation_id
* cluster_id

### Edges:

* similarity relationships
* evidence links

Example:

```text id="g1"
(observation A) --0.82--> (cluster X)
(observation A) --0.44--> (cluster Y)
```

Edges are:

```json id="g2"
{
  "source": "...",
  "target": "...",
  "weight": 0.0-1.0,
  "type": "hash | path | semantic | temporal",
  "timestamp": "..."
}
```

Important:

> edges accumulate over time; they are never overwritten, only reweighted

---

# 6. Phase 3: Candidate Evaluation (the “thinking step”)

This is where clusters are *considered*, not changed.

We compute:

## A. Cluster affinity score

```text id="score"
affinity(A, B) =
  w1*content_similarity +
  w2*structural_similarity +
  w3*temporal_coherence +
  w4*semantic_similarity
```

But crucially:

> LOSM semantic similarity is optional and low-weight early

---

## B. Stability score

Each cluster has:

```text id="stable"
stability =
  observation_count *
  coherence_score *
  time_persistence_factor
```

---

## C. Decision surface

We classify relationships into:

```text id="decision"
NO ACTION
INCREASE CONFIDENCE
MERGE CANDIDATE
SPLIT CANDIDATE
```

But nothing changes yet.

---

# 7. Phase 4: Controlled transitions (this is the safety core)

Now we actually mutate state—but only under constraints.

---

## A. Merge rule (anti-thrashing gate)

A merge only occurs if:

```text id="merge"
affinity > MERGE_THRESHOLD
AND
stability(A) > MIN_STABILITY
AND
no recent split event on either cluster
AND
confidence_delta > epsilon
```

### Anti-thrash rule:

> if a merge was undone recently, block re-merge for cooldown period

---

## B. Split rule (entropy-based)

We compute cluster entropy:

```text id="entropy"
H(cluster) =
  divergence of feature distributions
  + semantic drift (LOSM later)
```

Split occurs only if:

```text id="splitrule"
H(cluster) > SPLIT_THRESHOLD
AND
no recent merge cooldown active
```

---

## C. Cooldown system (critical missing piece in most designs)

Every cluster has:

```text id="cooldown"
merge_cooldown_until
split_cooldown_until
```

This prevents oscillation.

---

# 8. The “commit phase” (important design decision)

Nothing is applied immediately.

Instead:

### Step 1: propose transition

### Step 2: validate against cooldown + invariants

### Step 3: commit event

Example:

```json id="commit"
{
  "type": "IdentityClusterMergeCommitted",
  "clusters": ["A", "B"],
  "new_cluster": "A",
  "reason": "stable_affinity",
  "confidence": 0.91
}
```

---

# 9. Why this avoids your earlier failure modes

## Avoids thrashing

* cooldown windows
* stability gating

## Avoids stagnation

* accumulating evidence graph
* increasing confidence over time

## Avoids overconfidence

* no early canonical identity
* clusters remain mutable until stability threshold is high

---

# 10. Where LOSM plugs in (carefully)

LOSM only participates as:

### Late-stage signal amplifier

It contributes:

* semantic similarity edges
* contradiction flags
* requirement extraction

But:

> it does NOT trigger merges directly

It only influences weights in Phase 3.

---

# 11. Runtime loop (putting it all together)

Here is the actual engine loop:

```python id="loopcode"
while True:
    events = consume_event_stream()

    observations = normalize(events)

    update_evidence_graph(observations)

    candidates = evaluate_cluster_affinities()

    transitions = compute_valid_transitions(candidates)

    for t in transitions:
        if validate_cooldowns(t) and validate_invariants(t):
            commit_transition(t)

    sleep(SHORT_INTERVAL)
```

---

# 12. The key architectural insight

This system is NOT trying to be correct in one pass.

It is:

> continuously converging toward stable identity under streaming uncertainty

That is the difference between:

* static schema matching (old Mildred)
* and evolving identity graph (v2)

---

# 13. What this unlocks for your broader system

Once this loop exists:

### voyager

→ becomes pure signal generator

### Identity engine

→ becomes reconciliation layer

### LOSM

→ becomes semantic interpreter

### WRP

→ becomes decision/action layer

You now have a **clean epistemic stack**:

```text id="stack"
signal → structure → meaning → action
```

---

# 14. One-line summary

```text id="summary"
Identity is a continuously reconciled graph of observations governed by stability, cooldown, and evidence-weighted affinity, with controlled merge/split transitions.
```

---

We’re going to define the **Evidence Graph as a real, scalable data structure**, not just a conceptual one.

---

# 1. The core constraint you must respect

You are building over:

* potentially millions of files
* continuous scans (voyager)
* streaming updates
* repeated similarity evaluation

So the real constraint is:

> You cannot compare everything to everything.

That kills most naive identity systems.

---

# 2. The correct abstraction: partitioned evidence graph

Instead of a single global graph, you use:

```text id="graph"
Shard → Local Evidence Graph → Global Index
```

So you get:

* fast local reasoning
* bounded comparison sets
* cheap candidate narrowing

---

# 3. Layered graph architecture

## Layer 1: Observation Index (immutable log)

This is your base truth store:

```sql id="obs"
observations (
  observation_id UUID PRIMARY KEY,
  path TEXT,
  inode BIGINT,
  device_id BIGINT,
  content_hash TEXT,
  size BIGINT,
  mtime TIMESTAMP,
  feature_blob JSONB
)
```

Indexing:

* (device_id, inode)
* (content_hash)
* (path prefix btree)
* (mtime range)

👉 This layer is optimized for lookup, not reasoning.

---

## Layer 2: Candidate Buckets (blocking layer)

This is the most important scaling trick.

We group observations into **comparison buckets**:

```sql id="bucket"
observation_bucket (
  bucket_id UUID,
  bucket_type TEXT,  -- "path", "hash_prefix", "embedding_cluster"
  bucket_key TEXT
)
```

Examples:

* `/projects/nexus/python/`
* `hash_prefix: a83f`
* `embedding_cluster: 192`

👉 This prevents global comparisons.

---

## Layer 3: Evidence Edges (sparse weighted graph)

This is your real identity graph:

```sql id="edge"
evidence_edge (
  source_observation_id UUID,
  target_observation_id UUID,
  weight FLOAT,
  type TEXT,  -- hash | path | semantic | temporal
  last_updated TIMESTAMP,
  decay FLOAT
)
```

Key property:

> edges are sparse and decay over time

---

## Layer 4: Cluster Membership Graph

```sql id="cluster"
cluster_membership (
  cluster_id UUID,
  observation_id UUID,
  weight FLOAT,
  last_seen TIMESTAMP
)
```

This is NOT derived once—it is continuously updated.

---

# 4. The critical scalability trick: “candidate narrowing before scoring”

Every comparison MUST follow this pipeline:

```text id="pipeline"
1. Bucket lookup
2. Candidate filtering
3. Edge reuse check
4. Only then similarity scoring
```

---

## Step 1: Bucket lookup

Given an observation:

* find hash bucket
* find path bucket
* find embedding bucket (LOSM later)

This yields:

> ~50–500 candidates instead of millions

---

## Step 2: Candidate filtering

We apply cheap filters:

* same filesystem? (device_id)
* similar path prefix?
* similar size range?
* similar modification time window?

---

## Step 3: Edge reuse

If edge already exists:

> reuse + decay update instead of recompute

This is huge for performance.

---

## Step 4: expensive similarity only here

Only now do you run:

* content similarity
* structural similarity
* LOSM semantic similarity

---

# 5. Edge decay system (prevents graph corruption over time)

Each edge has:

```text id="decay"
weight = weight * exp(-λ * time_since_last_update)
```

So:

* old weak matches fade
* strong repeated signals persist
* stale relationships disappear naturally

---

# 6. Index strategy (this is where most systems break)

You need 4 indexes:

## A. Path index (prefix tree / btree)

* fast directory narrowing
* supports crawler locality

---

## B. Hash index

* exact match clustering
* duplicate detection

---

## C. Bucket index

* candidate narrowing layer

This is your *performance backbone*

---

## D. Optional embedding index (LOSM)

* only used AFTER identity narrowing
* never global search

---

# 7. Cluster formation strategy (incremental, not global)

Clusters are NOT recomputed.

They evolve via:

### Incremental update rules:

```text id="cluster_update"
on new edge:
  update cluster membership weights
  recompute local centroid
```

No full graph recomputation.

---

# 8. Memory model (important for voyager scale)

You explicitly separate:

### Hot state (Redis)

* active observations
* recent edges
* recent buckets

### Cold state (Postgres)

* full event history
* full observation log
* cluster history

### Derived state (rebuildable)

* clusters
* bucket assignments
* edge weights

👉 Everything is replayable from events.

---

# 9. How voyager uses this graph

voyager does ONLY:

### Writes:

* observations
* bucket assignments
* weak initial edges (optional)

### Does NOT:

* update clusters
* resolve identity
* enforce merges

---

# 10. Identity engine now becomes a streaming reducer

The engine consumes:

* observation stream
* bucket expansions
* existing edges

And produces:

* edge updates
* cluster updates
* merge/split proposals

---

# 11. The key performance invariant

You must enforce:

> Average comparisons per observation ≈ O(log n) or bounded constant via buckets

NOT:

> O(n²) global similarity

This is the difference between:

* prototype system
* production system

---

# 12. Why this fits your architecture perfectly

This design aligns with your entire stack:

### voyager

→ produces bounded local truth

### Identity engine

→ maintains sparse evolving graph

### LOSM

→ enriches *edges*, not raw data

### WRP

→ consumes only stable clusters

---

# 13. One-line architecture summary

```text id="summary"
A partitioned, decaying, bucket-indexed sparse evidence graph enables scalable identity resolution over streaming filesystem observations.
```

---

# 14. The real takeaway (important)

You now have the missing piece that turns your system from:

> “interesting architecture”

into:

> “can actually scale and not collapse under its own inference load”

Because you’ve eliminated the fundamental failure mode:

> global identity comparison explosion

---


This is the point where your system either becomes **self-stabilising intelligence plumbing** or turns into “semantic feedback soup.”

We’re going to make sure it behaves like the first one.

---

# 1. The core problem we are solving

You now have:

* fs-crawler → observations
* identity engine → structural clustering
* LOSM → semantic understanding

The danger is obvious:

> LOSM can “think hard” and accidentally destabilize identity.

So we need a rule:

> Semantic understanding can *influence* identity, but never directly *rewrite it*.

---

# 2. The correct abstraction: LOSM is a “soft signal producer”

LOSM does NOT output truth.

It outputs:

```text id="signal"
semantic signals with bounded authority
```

Think:

* “this looks like the same concept”
* “these files likely belong together”
* “this span suggests shared intent”

NOT:

* “these are the same entity”
* “merge cluster A and B”

---

# 3. The LOSM → Identity interface (critical boundary)

We define a single constrained event type:

## Semantic Influence Event

```json id="sie"
{
  "type": "SemanticIdentitySignal",
  "source": "LOSM",
  "scope": {
    "observation_ids": [...],
    "cluster_ids": [...]
  },
  "signal_type": "support | contradict | refine",
  "strength": 0.0-1.0,
  "features": {
    "embedding_similarity": 0.0-1.0,
    "intent_match": 0.0-1.0,
    "context_overlap": 0.0-1.0
  },
  "provenance": {
    "model": "losm-v1",
    "span_ids": [...]
  }
}
```

Key constraint:

> LOSM only emits *signals about relationships*, never structural mutations.

---

# 4. Identity engine interpretation layer (the filter)

Now we introduce a **semantic intake filter** inside the identity engine.

This is where signals become *safe or ignored*.

---

## Step 1: Signal normalization

All LOSM signals are converted into:

```text id="norm"
NormalizedSemanticEdgeSuggestion
```

---

## Step 2: Weight mapping

We map semantic signals into edge adjustments:

| Signal type | Effect                                |
| ----------- | ------------------------------------- |
| support     | increase edge weight                  |
| contradict  | decrease edge weight                  |
| refine      | redistribute weights across neighbors |

---

## Step 3: Hard caps (anti-instability rule)

We enforce:

```text id="caps"
max semantic influence per cycle = α
max weight change per edge = β
```

So LOSM cannot flood the system.

---

# 5. The key mechanism: “influence, not mutation”

Instead of:

> LOSM → modifies cluster

we do:

> LOSM → modifies edge weights → identity engine decides cluster changes

So LOSM is:

> a **gradient signal generator**, not a decision maker

---

# 6. How semantic signals modify the evidence graph

We now connect LOSM to your earlier graph design.

---

## A. Edge reinforcement

If LOSM says “support”:

```text id="reinforce"
edge.weight += η * signal_strength
```

Where η is small (e.g. 0.05–0.2)

---

## B. Edge decay suppression

Support signals can also slow decay:

```text id="decay"
decay_rate *= (1 - γ * signal_strength)
```

So semantically consistent relationships persist longer.

---

## C. Contradiction handling (very important)

If LOSM says “contradict”:

We do NOT delete edges.

We:

* reduce weight
* mark edge as “conflicted”
* increase entropy score of cluster

```text id="conflict"
edge.conflict_flag = true
cluster.entropy += δ
```

This is what triggers future split candidates—not immediate action.

---

# 7. The entropy bridge (how splits actually happen safely)

This is the key coupling point.

LOSM does NOT trigger splits.

Instead:

### Step 1:

LOSM injects contradictions → increases cluster entropy

### Step 2:

Identity engine evaluates:

```text id="entropy2"
if entropy(cluster) > SPLIT_THRESHOLD:
    propose_split()
```

So LOSM influences *pressure*, not *action*.

---

# 8. The full feedback loop (now complete)

You now have a closed system:

```text id="loop"
fs-crawler
  → observations
identity engine
  → structural graph
LOSM
  → semantic influence signals
identity engine
  → updated weights + entropy shifts
identity engine
  → merges/splits
```

But critically:

> only identity engine can mutate structure

---

# 9. Anti-chaos safeguards (this is what keeps it from going unstable)

## 1. Influence budget per cycle

LOSM influence is capped:

```text id="budget"
Σ influence per cluster per cycle ≤ constant K
```

Prevents runaway semantic takeover.

---

## 2. Signal aging

Semantic signals decay:

```text id="aging"
signal_strength *= exp(-λ * time)
```

So stale interpretations don’t dominate structure.

---

## 3. Agreement reinforcement bias

Repeated LOSM agreement increases confidence slowly:

> consistency over time matters more than single strong signals

---

## 4. Structural inertia

Clusters resist change:

```text id="inertia"
larger clusters require exponentially more evidence to modify
```

Prevents fragmentation.

---

# 10. Why this solves your earlier “inference explosion” problem

This directly addresses what you saw earlier:

* models wandering into Nexus context
* over-interpreting structure
* speculative system rewriting

Because now:

> inference is explicitly constrained into *weighted influence signals with bounded authority*

Not free-form reasoning that can mutate system state.

---

# 11. What this enables in your broader architecture

Now everything becomes cleanly layered:

### voyager

→ produces raw truth

### Identity engine

→ stabilizes structure

### LOSM

→ provides semantic gradient field

### WRP

→ acts only on stabilized structure

---

# 12. One-line model of the system

```text id="summary"
LOSM produces bounded semantic influence signals that adjust an evidence-weighted identity graph, where structural changes emerge only through thresholded stability dynamics in the identity engine.
```

---

# 13. The real architectural insight (this is the key)

You’ve now built a system where:

> meaning can shape structure, but cannot directly rewrite it

That is the difference between:

* chaotic agent systems
* and controlled cognitive pipelines

---

If you want to continue, the next natural step is:

> defining the **WRP boundary model: how stable identity clusters become actionable WorkRequests without reintroducing ambiguity**

That’s where cognition finally turns into execution safely.


We’ll define the LOSM → WRP contract as a strict boundary: LOSM proposes structure, WRP decides action.

1. The core principle (non-negotiable)

LOSM produces candidate intent. WRP produces commitment to work.

So:

LOSM = “this might be a requirement”
WRP = “this is a work item we will execute”

No blending.

2. The contract object: RequirementCandidate

This is the ONLY allowed output from LOSM into WRP.

{
  "type": "RequirementCandidate",
  "candidate_id": "uuid",
  "source": {
    "identity_clusters": ["..."],
    "semantic_spans": ["..."],
    "evidence_signals": ["..."]
  },
  "classification": {
    "system": "LOSM / Nexus / fs-crawler-derived domain",
    "subsystem": "string | null",
    "feature": "string | null",
    "title": "short human-readable label",
    "description": "detailed explanation"
  },
  "intent": {
    "problem_statement": "...",
    "proposed_change": "...",
    "rationale": "..."
  },
  "constraints": {
    "technical": [],
    "architectural": [],
    "operational": []
  },
  "priority": 0-10,
  "confidence": 0.0-1.0,
  "traceability": {
    "provenance_ids": [],
    "cluster_ids": []
  }
}
3. What LOSM is allowed to do

LOSM is allowed to:

A. Extract structure
detect requirements from spans
group related observations
infer subsystem boundaries
B. Produce candidates
generate RequirementCandidate objects
attach confidence
attach provenance
C. Rank importance
but NOT schedule or execute
4. What LOSM is NOT allowed to do

This is where your architecture is protected.

LOSM cannot:

create WorkRequests
decide execution order
mutate WRP queue
interpret candidates as “to be done”

It cannot cross this line:

“this should be implemented next”

That belongs to WRP only.

5. WRP intake model (strict filter gate)

WRP consumes candidates through a validation layer:

Step 1: Schema validation

Reject if missing:

classification.system
title
description
traceability
Step 2: Deduplication
if similar_candidate_exists(candidate):
    merge_or_increment_confidence()

WRP does NOT accept duplicates as separate work.

Step 3: Intent clarity filter

WRP checks:

if ambiguity(intent) > threshold:
    reject or return_to_losm
Step 4: Scope classification

WRP enforces:

Type	Action
feature-level	eligible for WorkRequest
subsystem-level	may require decomposition
system-level	rejected or split upstream
6. Conversion: RequirementCandidate → WorkRequest

Only after validation:

{
  "wr_id": "uuid",
  "intent": "derived from requirement.intent.proposed_change",
  "constraints": "mapped from requirement.constraints",
  "priority": "normalized",
  "context": {
    "source_candidate_id": "...",
    "cluster_ids": [...]
  },
  "status": "NEW"
}
7. Critical design rule (prevents your earlier “inference explosion”)

LOSM defines what is worth considering
WRP defines what is real work

This prevents:

semantic speculation becoming tasks
exploratory ideas becoming execution artifacts
architectural drift leaking into runtime systems
8. Confidence → gating behavior

We explicitly map confidence:

0.0 – 0.4  → discard or archive
0.4 – 0.7  → candidate pool only
0.7 – 0.9  → eligible for WRP review
0.9 – 1.0  → auto-queue eligible (still not auto-execute)

No direct execution ever.

9. The feedback loop (important missing piece)

WRP can send signals back:

A. rejection feedback
“not actionable”
“too broad”
“incorrect classification”
B. refinement request
RequirementCandidate → LOSM for decomposition

So LOSM improves over time.

10. System-wide flow now becomes clean
fs-crawler
  → observations

identity engine
  → clusters

LOSM
  → RequirementCandidates

WRP
  → WorkRequests

executor
  → system changes
11. The key architectural insight (this is the real win)

You’ve now created a strict separation:

LOSM:

“What might matter”

WRP:

“What we will do”

Executor:

“What actually happens”

This prevents:

inference leakage into execution
semantic overreach becoming system mutation
architectural exploration becoming runtime action
12. One-line contract definition
LOSM generates structured, traceable requirement hypotheses; WRP validates, filters, and converts them into executable WorkRequests under strict ambiguity and scope constraints.
13. Why this completes your earlier problem space

This is the missing closure point:

fs-crawler solved observation
identity solved “what is the same thing”
LOSM solved “what does it mean”
WRP now solves “what do we do”

No layer is allowed to collapse into another.



If you want, next step we can map this directly onto:

* your `media.sql` evolution plan
* your event schema changes
* and how LOSM should consume identity candidates without collapsing them too early

1. What WRP actually is

WRP is not a task list.

It is:

a dependency-aware, provenance-tracked execution scheduler over validated intent

So its job is not “store work.”

Its job is:

decide when work is allowed to exist
decide what order it executes in
ensure nothing executes without sufficient grounding
2. Core data model: WorkRequest (final form)

We refine your earlier model into something execution-safe.

{
  "wr_id": "uuid",
  "status": "NEW | VALIDATED | QUEUED | RUNNING | BLOCKED | COMPLETED | FAILED",

  "intent": "...",
  "priority": 0-10,

  "classification": {
    "system": "...",
    "subsystem": "...",
    "feature": "..."
  },

  "constraints": {
    "resource_limits": {},
    "time_limits": {},
    "safety_constraints": []
  },

  "dependencies": {
    "depends_on": ["wr_id"],
    "blocks": ["wr_id"],
    "soft_dependencies": ["wr_id"]
  },

  "provenance": {
    "requirement_candidate_id": "...",
    "identity_cluster_ids": [],
    "losm_span_ids": []
  },

  "execution": {
    "harness": "executor.py | opencode | ollama | etc",
    "model_role": "planner | engineer | analyst",
    "retry_policy": {},
    "idempotency_key": "..."
  }
}
3. The WRP system is a DAG, not a queue

This is critical.

You are not building:

FIFO job queue

You are building:

Directed Acyclic Graph of executable intent

Node = WorkRequest
Edge = dependency relationship
WR1 → WR2 → WR3
      ↘
        WR4
4. Scheduling model (how work actually runs)

WRP runs a continuous scheduler loop:

Step 1: candidate selection
eligible = WRs where:
  status == VALIDATED
  AND dependencies_satisfied
  AND not blocked
Step 2: prioritization

We compute a score:

score =
  priority_weight
  + urgency_factor
  + dependency_depth_bonus
  - risk_penalty

Important:

deeper dependency chains can increase priority (to unblock graph)

Step 3: execution slot allocation

WRP enforces:

concurrency limits per model/harness
per-role quotas (planner vs engineer)
system resource caps

So:

max_parallel_engineers = N
max_parallel_planners = M
Step 4: dispatch

Only here do we invoke:

executor.py
opencode
ollama
external agents
5. Status lifecycle (critical control mechanism)

This is what prevents chaos:

NEW
  ↓
VALIDATED
  ↓
QUEUED
  ↓
RUNNING
  ↓
COMPLETED

Failure paths:

RUNNING → FAILED
QUEUED → BLOCKED
VALIDATED → REJECTED (rare but allowed)
6. Blocking system (your governance layer)

A WorkRequest can be BLOCKED for:

A. Missing dependency
upstream WR not completed
B. Low confidence provenance
LOSM signal insufficient
C. Scope violation
too large / needs decomposition
D. Conflicting intent
overlaps with existing WR

Blocked WRs are NOT deleted.

They are re-evaluated periodically.

7. Dependency semantics (this is where systems usually break)

We define 3 types:

Hard dependency

must complete before execution

Soft dependency

improves execution context but not required

Blocker dependency

prevents execution entirely if active

8. Decomposition engine (critical bridge back to LOSM)

WRP can send work back upstream:

WR (too large) → RequirementCandidate split request → LOSM

So WRP is not just a sink—it is a refinement feedback system.

9. Execution isolation model (prevents cascading failure)

Each WorkRequest runs in:

isolated context
defined harness
explicit model role

So:

Role	Purpose
planner	decomposes tasks
engineer	implements
analyst	inspects outputs

This prevents “role bleed” (your earlier Junie issue pattern).

10. Retry + failure semantics (important for real systems)

We define strict retry behavior:

max_retries = n
backoff = exponential
failure_classification:
  - transient → retry
  - structural → revalidate
  - logical → send back to LOSM

Key idea:

failures are routed, not just retried

11. Idempotency (prevents duplicate execution chaos)

Every WR has:

idempotency_key = hash(intent + dependencies + classification)

So WRP can safely:

restart
recover
deduplicate
12. Global system shape (now fully connected)

You now have a complete pipeline:

fs-crawler
  → observations

identity engine
  → clusters

LOSM
  → requirement candidates

WRP
  → DAG of WorkRequests

executor
  → system changes

→ feedback loop back into fs-crawler
13. The real architectural insight (important)

You’ve now cleanly separated:

1. Reality capture

(fs-crawler)

2. Structure inference

(identity engine)

3. Meaning inference

(LOSM)

4. Action planning

(WRP)

5. Execution

(runtime)

Each layer:

only sees adjacent abstraction
never directly mutates non-adjacent layers
14. The key stability property you just achieved

No inference system can directly execute anything.

That’s the entire safety model.

15. One-line definition of WRP
WRP is a dependency-aware, provenance-validated DAG scheduler that converts LOSM-derived requirement candidates into controlled, role-assigned, executable WorkRequests under strict isolation and resource constraints.


Now we cross the final line: turning structured intent into actual system changes without letting the system start “thinking creatively” at execution time.

This is where most architectures quietly collapse—because execution layers start improvising.

We’re going to explicitly forbid that.

1. What the executor actually is

The executor is NOT:

an agent
a planner
a reasoning system
a tool that “figures things out”

It is:

a deterministic WorkRequest interpreter with bounded tool dispatch

Think:

“compiler + syscall router”, not “assistant”

2. Core principle

The executor must never introduce new intent.

It can only:

interpret a WorkRequest
select a predefined harness
execute a bounded operation
return structured results

Nothing else.

3. Execution model overview
WRP → WorkRequest → Executor → Harness → Tool/System → Result Event → WRP/LOSM

Executor sits in the middle as a routing layer only.

4. The Executor contract

Each WorkRequest is compiled into an ExecutionPlan:

{
  "wr_id": "...",
  "harness": "python | opencode | ollama | shell | api",

  "role": "planner | engineer | analyst",

  "entrypoint": {
    "module": "executor.py",
    "function": "run_task"
  },

  "inputs": {
    "intent": "...",
    "constraints": {},
    "context": {}
  },

  "outputs": {
    "event_types": ["ExecutionSucceeded", "ExecutionFailed"]
  }
}

Important:

no free-form prompt generation inside executor

5. Harness system (this is your real control surface)

Harnesses are predefined execution environments.

Examples:
Python harness
runs deterministic scripts
no model inference unless explicitly allowed
OpenCode harness
bounded code generation + patch application
Ollama harness
model invocation for restricted tasks only
Shell harness
command execution with allowlist
6. Harness registry (critical design element)
HARNESS_REGISTRY = {
    "python": PythonHarness(),
    "opencode": OpenCodeHarness(),
    "ollama_engineer": OllamaHarness(role="engineer"),
    "ollama_planner": OllamaHarness(role="planner"),
    "shell_safe": ShellHarness(allowlist=[...])
}

Key rule:

WorkRequests never specify arbitrary commands—only harness IDs.

7. Execution pipeline (deterministic stages)

Each WorkRequest passes through 5 stages:

Stage 1: Compilation

Convert WR → ExecutionPlan

Validation:

required fields present
harness exists
role allowed
dependencies resolved
Stage 2: Binding

Attach:

filesystem context (if needed)
git state (if needed)
database snapshot (if needed)

No inference yet.

Stage 3: Dispatch
harness = HARNESS_REGISTRY[plan.harness]
result = harness.execute(plan)
Stage 4: Result normalization

All outputs become:

{
  "wr_id": "...",
  "status": "SUCCESS | FAILED",
  "artifacts": [],
  "events": [],
  "logs": []
}
Stage 5: Emission

Executor emits:

ExecutionSucceeded
ExecutionFailed
ArtifactProduced

Back into WRP pipeline.

8. The most important constraint: no runtime inference expansion

This is where your earlier systems were leaking.

We explicitly enforce:

Executor is forbidden from generating new WorkRequests

It can only:

complete
fail
request clarification upstream (WRP/LOSM)
9. Safe failure routing (critical for stability)

Failures are not just errors—they are classified:

TYPE A: transient → retry in WRP
TYPE B: missing info → send back to LOSM
TYPE C: invalid WR → reject upstream
TYPE D: system error → escalate

Executor does NOT decide retry logic—it reports classification only.

10. Context scoping (prevents “Junie problem” at execution layer)

Each execution gets:

Hard boundary:
only files listed in WR context
only allowed directories
only declared APIs
Soft boundary:
read-only exploration allowed only if explicitly granted

No “just looking around”.

11. Role-based execution models

You already implicitly designed this; now we formalize it:

Planner role
decomposes tasks (but only inside models)
no filesystem writes
Engineer role
produces code / patches
allowed to modify artifacts
Analyst role
reads outputs
produces structured reports only
12. Why roles matter (this is important)

Without roles:

models drift into each other’s responsibilities

Which is exactly what you saw earlier:

tests → architecture exploration
agents → filesystem wandering
inference → uncontrolled expansion

Roles are your cognitive containment system.

13. Artifact system (execution output structure)

Everything produced is an artifact:

{
  "artifact_id": "...",
  "type": "code | report | patch | log | data",
  "source_wr": "...",
  "content_ref": "...",
  "provenance": {
    "harness": "...",
    "model": "...",
    "timestamp": "..."
  }
}

No raw unstructured output survives.

14. Full system closure loop

Now everything connects cleanly:

fs-crawler → observations
identity → structure
LOSM → requirements
WRP → execution planning
executor → deterministic execution
→ artifacts + events
→ back into fs-crawler / identity
15. The key architectural achievement

You now have:

a system where inference is progressively constrained until execution becomes deterministic

That is extremely rare in agentic architectures.

Most systems do the opposite.

16. One-line definition of executor
The executor is a deterministic harness-routing engine that converts validated WorkRequests into isolated, role-bound execution plans and emits structured artifacts and outcome events without introducing new intent or inference.
17. The real final insight (this is the synthesis point)

You have now built a full epistemic stack:

Observation (fs-crawler)
Identity (graph resolution)
Semantics (LOSM)
Intent (WRP)
Execution (Executor)

Each layer:

reduces ambiguity instead of expanding it

We’re now defining system-wide provenance as a first-class graph, not metadata sprinkled across tables.

1. What provenance actually needs to solve

You’re not just tracking:

where a file came from

You’re tracking:

how an observation became an identity
how identity became a requirement
how requirement became a WorkRequest
how WorkRequest became execution
how execution produced artifacts
how artifacts fed back into the system

So provenance is:

the causal spine of the entire system

Not logs. Not audit trails. A graph of transformation.

2. Core model: Provenance Node Graph

Everything becomes a node:

Observation
IdentityCluster
SemanticSpan
RequirementCandidate
WorkRequest
ExecutionRun
Artifact

And everything is connected by edges:

DERIVED_FROM
TRANSFORMED_INTO
SUPPORTS
CONTRADICTS
TRIGGERED
PRODUCED
3. The universal provenance record

Every event in your system emits this:

{
  "event_id": "uuid",
  "entity_type": "Observation | Cluster | WR | Artifact | etc",
  "entity_id": "...",

  "causality": {
    "parents": [
      {
        "type": "Observation",
        "id": "..."
      }
    ],
    "operation": "merge | split | classify | execute | extract"
  },

  "context": {
    "system": "fs-crawler | identity | losm | wrp | executor",
    "harness": "optional",
    "model": "optional"
  },

  "timestamp": "...",
  "confidence": 0.0-1.0
}

Key idea:

every transformation must declare what it came from

4. Why this is not just logging

Logs are:

linear
ephemeral
local to a system

Provenance graph is:

cross-layer
persistent
queryable causality

You can answer:

“why does this WorkRequest exist?”
“what observation originally triggered this subsystem?”
“which LOSM signal influenced this merge?”
“what execution produced this artifact?”
5. The provenance DAG (system-wide view)
Filesystem
  ↓
Observation
  ↓
IdentityCluster
  ↓
SemanticSpan
  ↓
RequirementCandidate
  ↓
WorkRequest
  ↓
ExecutionRun
  ↓
Artifact
  ↓
(feedback loop)
Observation

But importantly:

every arrow is explicitly recorded, not implied

6. Provenance compression (critical for scale)

If you literally stored every edge naïvely, you’d drown.

So we introduce compression rules:

A. Edge collapsing

Repeated transformations:

A → B → C → D

can be compressed into:

A → D (collapsed lineage pointer)

while still retaining full trace in cold storage.

B. Lineage hashing

Each entity gets:

lineage_hash = hash(all parent IDs + operation type)

So identical transformations can be deduplicated.

C. Time-window folding

Provenance chains older than N days:

moved to cold store
replaced with summary node
7. Provenance as a query system (this is where it becomes powerful)

You can now ask:

“Why does this WorkRequest exist?”

Trace:

WR → RequirementCandidate → SemanticSpan → Cluster → Observation
“What system changes caused this artifact?”
Artifact → ExecutionRun → WorkRequest → LOSM → Identity → fs-crawler
“What LOSM signals influenced this merge?”
ClusterMerge → SemanticIdentitySignals → LOSM spans → observations
8. Provenance enforcement rules (critical safety layer)

These are non-negotiable invariants:

Rule 1: No orphan nodes

Every entity must have at least one parent unless it is:

filesystem root observation
manually injected bootstrap artifact
Rule 2: No untracked mutation

If something changes:

there must be a provenance event

No silent updates.

Rule 3: Cross-layer transparency

No system may hide transformation steps.

Even LOSM inference must emit:

input spans
output signals
confidence
Rule 4: Immutable history

Provenance edges are:

append-only
never edited
only superseded
9. How provenance integrates with your stack

Now each layer becomes fully traceable:

fs-crawler
emits Observation nodes
links to filesystem state
Identity engine
emits cluster transformations
records merge/split causality
LOSM
emits semantic influence edges
attaches confidence-weighted reasoning traces
WRP
records requirement derivation chains
tracks validation decisions
Executor
records execution lineage
attaches artifacts + runtime metadata
10. The “global truth property”

Because everything is connected:

you can reconstruct the entire system state at any point in time

This gives you:

replayability
auditability
debugging at system scale
rollback reasoning (conceptually, not literally undoing execution)
11. The key architectural insight (this is the synthesis)

You are no longer building:

systems that produce outputs

You are building:

a causal machine where every output is explainable by traversing a single graph

12. Why this closes your original design tension

You were oscillating between:

chat-driven inference systems
deterministic pipelines
agent orchestration
audit logging

Provenance unifies all of it:

inference is allowed, but never untraceable
execution is allowed, but never context-free
evolution is allowed, but never opaque

13. One-line definition of your full system now
A layered cognitive pipeline where all observations, inferences, decisions, and executions are nodes in a persistent provenance graph enabling full causal traceability across fs-crawler, identity resolution, semantic interpretation, work request planning, and deterministic execution.
14. The real endpoint (what you’ve actually built)

If we step back:

You didn’t design “a toolchain”.

You designed:

a self-documenting computational organism with enforced causal transparency

We’re now defining the Provenance Query + Cognitive UI layer: how you navigate the entire causal graph without drowning in it.

1. The core problem (why this layer matters)

You now have a complete system that records:

observations
identity evolution
semantic interpretation
requirements
work execution
artifacts
full lineage

But that creates a new problem:

the truth is now too large to inspect directly

So the UI layer is not “display.”

It is:

controlled traversal of causal space

2. The abstraction: Provenance is a queryable graph, not a log

We define a single mental model:

Everything is a node.
Everything is traversable.
Everything has constrained visibility depending on intent.

So UI becomes:

a graph query engine with multiple projection modes

3. Core query primitives

These are the only operations the UI should expose at the base layer:

A. Trace backward (causal origin)
trace_back(entity_id, depth=n)

Returns:

parent chain
transformation steps
originating observations

Used for:

“why does this exist?”
B. Trace forward (impact propagation)
trace_forward(entity_id, depth=n)

Returns:

derived artifacts
downstream WorkRequests
affected clusters

Used for:

“what did this cause?”
C. Subgraph extraction (bounded context)
subgraph(seed, radius, filter)

Used for:

“show me everything related to this feature/system”

This is your primary UI workhorse.

D. Path query (causal chain reconstruction)
path(A → B)

Used for:

“how did this requirement become this artifact?”
E. Time slice query
timeline(entity, t1, t2)

Used for:

evolution of clusters
drift in semantics
execution history
4. UI becomes layered projections (not screens)

Instead of multiple UIs, you get views over the same graph.

View 1: Loose Pipes (Execution View)

This is your current system:

WorkRequests
queues
execution logs

It is:

“what is running”

View 2: Nebula (Semantic Construction View)

This becomes:

RequirementCandidates
LOSM spans
identity clusters

It is:

“what might matter”

View 3: Provenance Explorer (Causal Debug View)

This is new:

full trace_back / trace_forward
system causality graph
dependency visualization

It is:

“why did this happen”

View 4: System Atlas (Structural View)

This is:

identity clusters
subsystem grouping
topology of systems/features

It is:

“what exists in the system”

5. Key design shift: UI is not navigation, it is slicing

Traditional UI thinking:

“pages and panels”

Your system:

“graph slices under different constraints”

So every view is just:

projection(graph, filter, traversal_rule)
6. Cognitive interaction model (this is the important part)

You don’t “click around.”

You issue intent-based queries:

Example 1

“why was this WorkRequest created?”

Becomes:

trace_back(WorkRequest_id)
→ RequirementCandidate
→ LOSM spans
→ identity clusters
→ filesystem observations
Example 2

“what broke if I change this subsystem?”

Becomes:

trace_forward(cluster_id)
→ impacted WRs
→ affected artifacts
→ execution runs
Example 3

“show me everything related to voyager identity model”

Becomes:

subgraph(seed=cluster(fs-crawler), radius=3, filter=identity)
7. The key UI innovation: “Context Windows are Graph Cuts”

This is the bridge to your earlier token concerns.

Instead of feeding massive context:

you generate minimal causal subgraphs

So the UI does:

automatic graph slicing
relevance ranking
provenance compression

Result:

you never pass full system state to models, only causal slices

8. Why this unifies Nebula + Loose Pipes

You already noticed the split:

Nebula = planning / exploration
Loose Pipes = execution / audit

In this model:

System	Becomes
Nebula	semantic subgraph explorer
Loose Pipes	execution slice of graph
New layer	provenance explorer (missing piece)

They are no longer separate apps.

They are:

different projections over the same graph

9. The most important UI rule

The UI must never invent structure that is not in the provenance graph.

It can:

filter
aggregate
collapse
expand

It cannot:

reinterpret causality
reclassify meaning
generate new relationships

That remains backend-only.

10. Cognitive safety feature: bounded traversal

To prevent UI overload:

We enforce:

max depth per query
max node fanout
weighted traversal cutoff

So the UI always shows:

“what is most causally relevant”, not “everything”

11. The real architectural insight (this is the synthesis point)

You now have:

Backend truth system

→ provenance graph

Semantic system

→ LOSM

Execution system

→ WRP + executor

Cognitive interface

→ graph projection engine

So instead of:

multiple tools with different mental models

You now have:

one system with multiple constrained views

12. One-line definition of the UI layer
A provenance-driven graph query interface that presents filtered causal subgraphs of the system across semantic, structural, and execution dimensions, enabling traceable navigation of all system state without requiring global context loading.
13. The real endpoint (what this gives you in practice)

This is the key payoff:

You can now:

debug system behavior by tracing causality
design features by exploring semantic clusters
monitor execution without logs
understand intent without reading transcripts
reduce everything to bounded graph slices


let's go back to "defining the exact LOSM → Identity feedback loop (how semantic signals safely adjust edge weights without destabilizing clusters)"

