# PEB-as-MCP-Server Design Specification (v2 — Revised)

**Status:** Design — post-critique revision  
**Date:** 2026-06-15  
**Supersedes:** `.agent/peb/` (aspirational markdown — this spec makes it operational)

---

## 0. Conceptual Correction (Critical)

This spec was originally written as *"a system of MCP tools that enforce governance."*
That framing is wrong. The correct framing is:

> **PEB is a deterministic state transition kernel with MCP as interface.**
> Tools are facades. The kernel is the truth machine. MCP is transport.

This is not cosmetic. Every structural decision below follows from this inversion:

| Wrong (v1) | Correct (v2) |
|-------------|--------------|
| 10 independent MCP tools with implicit sequencing | One `PebTransaction` kernel; all tools are facades |
| Governance logic distributed across tool endpoints | Single **Admission Control Layer** gates every mutation |
| Prompts embed authority rules | Prompts carry **only hashes, URIs, and non-normative summaries** |
| Static `role → action` authority matrix | **Capability-based authority tokens** (scoped, composable) |
| Full SHA-256 recompute on every decision | **Incremental Merkle hash** per document key |
| State/trace/decision boundary implied | Enforced: TRACE=observational, DECISION=causal, STATE=authoritative |

---

## 0.1 Summary

The Persistent Engineering Brain (PEB) is a **cognitive governance service** —
not a brain, not an orchestrator, not a reasoning engine. It has three jobs:

1. **State storage** — decisions, invariants, architecture facts, trajectory
2. **Constraint enforcement** — validate transforms/invariants/authority before agents act
3. **Context injection** — inject relevant PEB state into agent prompts

MCP (Model Context Protocol) is the transport abstraction:

| PEB Job | MCP Primitive | Note |
|---------|---------------|------|
| State storage | **Resources** | Expose PEB state as URI-addressed resources |
| Constraint enforcement | **Tools** | Thin facades over the governance kernel |
| Context injection | **Prompts** | Informational only — hashes, URIs, summaries |

---

## 1. System Architecture

### 1.1 The Kernel (Not Tools)

```
┌──────────────────────────────────────────────────────────┐
│                     PebGovernanceEngine                    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Admission Control Layer                 │    │
│  │  (Every request — no exceptions)                  │    │
│  │                                                    │    │
│  │  1. Capability check    → does entity hold token?  │    │
│  │  2. Invariant check     → does action violate law? │    │
│  │  3. Transition check    → is state move legal?     │    │
│  │  4. Transform check     → is delta valid?          │    │
│  │  5. Resource check      → does entity own target?  │    │
│  │                                                    │    │
│  │  Decision: ALLOW / REJECT / ROUTE                  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │              PebTransaction Engine                │    │
│  │                                                    │    │
│  │  begin(idempotency_key)                            │    │
│  │    ├── validate(invariants, authority, transition) │    │
│  │    ├── execute(mutation)                           │    │
│  │    ├── record(decision_or_trace)                   │    │
│  │    ├── finalize(hash)                              │    │
│  │    └── return(receipt, state_hash)                 │    │
│  │  commit()                                          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Invariant + Authority Store              │    │
│  │  - peb_state     (authoritative facts)             │    │
│  │  - peb_decisions (causal log)                      │    │
│  │  - peb_traces    (observational DAG)               │    │
│  │  - peb_violations(exception system)                │    │
│  │  - peb_capabilities(entity->token map)              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │           Hash Service (isolated)                 │    │
│  │  - Incremental Merkle root per document key       │    │
│  │  - Rolling hash per decision chain                │    │
│  │  - O(1) per mutation, not O(n)                    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
        ▲            ▲            ▲
        │            │            │
  ┌─────┴────┐ ┌─────┴────┐ ┌─────┴──────┐
  │ MCP Res.│ │ MCP Tools│ │ MCP Prompts│
  │(read)   │ │(facades) │ │(read-only) │
  └──────────┘ └──────────┘ └────────────┘
```

### 1.2 Key Invariant

Every state mutation **must** pass through:
1. `AdmissionController` (always gates)
2. `PebTransaction` (always sequences)

No MCP tool, no background process, no direct SQL bypasses this.
Tools are stateless facades that deserialize, call `GovernanceEngine`, serialize response.

### 1.3 Layer Authority

| Layer | Property | Mutation Path | Consumed By |
|-------|----------|--------------|-------------|
| **STATE** | Authoritative | Only via `PebTransaction` | Tools, Resources, Prompts |
| **DECISION** | Causal | Append-only via `PebTransaction` | Audit, hash chain |
| **TRACE** | Observational | Append-only via `PebTransaction` | Analytics, replay, learning |
| **VIOLATION** | Exception | Append-only via `AdmissionController` | Observation stream, alerts |

**Rule:** Traces never feed state computation. Decisions are the *only* causal link
between state transitions. STATE is the ground truth — everything else is derived.

---

## 2. Backing Store Schema

### 2.1 Table: `peb_state`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `key` | VARCHAR UNIQUE | `invariants`, `architecture`, `trajectory`, `intent` |
| `content` | JSONB | Structured state (not raw markdown — structured facts) |
| `metadata` | JSONB | `{ version, checksum, last_updated, author }` |
| `checksum` | VARCHAR | SHA-256 of `content` (independent per key) |
| `version` | INT | Monotonic counter |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Why JSONB not TEXT:** Structured state is queryable by tools. Human-readable
markdown is an *export view*, not the source of truth.

### 2.2 Table: `peb_decisions`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `transaction_id` | UUID FK → `peb_transactions` | Links decision to the transaction that created it |
| `adr_number` | VARCHAR | e.g., `ADR-007` |
| `title` | VARCHAR | |
| `status` | VARCHAR | `draft`, `accepted`, `superseded`, `rejected` |
| `summary` | JSONB | Structured rationale (not free text) |
| `affected_keys` | TEXT[] | Which `peb_state` keys changed |
| `entropy_class` | VARCHAR | From CCNF: `collapser`, `shaper`, `neutral` |
| `before_hash` | VARCHAR | `peb_state_hash` at transaction start |
| `after_hash` | VARCHAR | `peb_state_hash` after commit |
| `author_id` | VARCHAR | Who made the decision |
| `parent_decision_id` | UUID | Links to previous decision (Merkle chain) |
| `rollback_of` | UUID | If this decision rolls back a prior one |
| `created_at` | TIMESTAMPTZ | |

**Key change from v1:** `before_hash` and `after_hash` are now scoped to the
*transaction*, not absolute. Multiple decisions in one transaction share the
same hash pair. `parent_decision_id` forms the Merkle decision chain.

### 2.3 Table: `peb_traces`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `transaction_id` | UUID FK → `peb_transactions` | Links to producing transaction |
| `work_request_id` | VARCHAR | Associated WorkRequest |
| `parent_trace_id` | UUID NULL | Parent segment (DAG) |
| `stage` | VARCHAR | Cognitive role or skill |
| `inputs` | JSONB | State summary at entry |
| `causal_entries` | JSONB | Why transformation occurred |
| `rejected_alternatives` | JSONB | Branch points considered and discarded |
| `confidence` | FLOAT | 0.0–1.0 |
| `status` | VARCHAR | `observational` (always — traces never authoritative) |

**Key rule:** `status` is always `observational`. This is enforced at the
database level — no downstream consumer may treat trace as truth.

### 2.4 Table: `peb_violations`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `transaction_id` | UUID NULLABLE | Transaction during which violation occurred |
| `violation_type` | VARCHAR | `authority_leakage`, `state_dependency`, `semantic_normalization`, `rcl_violation`, `transform_invalid` |
| `severity` | VARCHAR | `hard` (halt pipeline), `soft` (route to observation) |
| `entity_id` | VARCHAR | Who caused the violation |
| `capability_attempted` | VARCHAR | What capability was attempted |
| `context` | JSONB | Full request context |
| `resolution` | VARCHAR | `rejected`, `routed`, `clarified` |
| `created_at` | TIMESTAMPTZ | |

### 2.5 Table: `peb_capabilities`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | |
| `entity_id` | VARCHAR | Agent, service, or human identifier |
| `capability` | VARCHAR | Scoped token: `cap:emit_work_request`, `cap:mutate_state:key=invariants` |
| `granted_by` | VARCHAR | Who granted this capability |
| `expires_at` | TIMESTAMPTZ | Optional TTL |
| `created_at` | TIMESTAMPTZ | |

**Capability tokens follow the pattern:**
```
cap:<action>[:scope=<resource_type>:<filter>]
cap:emit_work_request
cap:validate_transform
cap:mutate_state:key=invariants
cap:read_state:key=trajectory
cap:append_trace:work_request_id=wr-042
```

This replaces the static `role → action` matrix entirely.

### 2.6 Table: `peb_transactions`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | Transaction ID |
| `idempotency_key` | VARCHAR UNIQUE | Caller-provided; enables safe retry |
| `entity_id` | VARCHAR | Who initiated the transaction |
| `admission_result` | VARCHAR | `allowed`, `rejected`, `routed` |
| `tool_name` | VARCHAR | Which MCP tool facade invoked this transaction |
| `input` | JSONB | Full request payload |
| `output` | JSONB | Full response payload |
| `before_hash` | VARCHAR | `peb_state_hash` at begin |
| `after_hash` | VARCHAR | `peb_state_hash` at commit |
| `state_delta` | JSONB | What changed (keys + new checksums) |
| `created_at` | TIMESTAMPTZ | |
| `committed_at` | TIMESTAMPTZ | |

**This is the audit spine.** Every state mutation has a transaction row linking
admission, input, output, hash delta, and entity. No mutation is untraceable.

---

## 3. Resource Definitions

### 3.1 URI Scheme

All PEB resources are addressed under `peb://state/`:

| URI | Returns | Subscribable |
|-----|---------|:------------:|
| `peb://state/invariants` | Current invariants (JSONB) + metadata | Yes |
| `peb://state/architecture` | Current architecture facts (JSONB) | Yes |
| `peb://state/trajectory` | Current identity trajectory (JSONB) | Yes |
| `peb://state/intent` | Current intent facts (JSONB) | Yes |
| `peb://state/hash` | `{ peb_state_hash, thought_context_hash, cognitive_mode }` | Yes |
| `peb://state/hash/document/{key}` | Individual document Merkle hash | Yes |
| `peb://state/mode` | Current cognitive mode | Yes |
| `peb://state/decisions` | Decision log (latest 20) | Yes |
| `peb://state/decisions/{id}` | Single decision | Yes |
| `peb://state/transitions` | Current transition table (from losm-ir) | No |
| `peb://state/traces/{work_request_id}` | Observational trace DAG | Optional |
| `peb://state/transactions/{id}` | Single transaction record (audit) | No |
| `peb://state/capabilities/{entity_id}` | Capability tokens for entity | Optional |

### 3.2 State Hash Resource

The `peb://state/hash` resource returns:

```json
{
  "peb_state_hash": "merkle:4a8f1c...",
  "document_hashes": {
    "invariants": "sha256:a1b2...",
    "architecture": "sha256:c3d4...",
    "trajectory": "sha256:e5f6...",
    "intent": "sha256:g7h8..."
  },
  "last_decision_hash": "sha256:i9j0...",
  "last_decision_id": "uuid:...",
  "thought_context_hash": "sha256:k1l2...",
  "cognitive_mode": "planning",
  "version": 7
}
```

**Computation (incremental, O(1) per mutation):**

```
document_hashes[key] = SHA256(peb_state.content WHERE key=key)

last_decision_hash = SHA256(
    decision.id ++ decision.parent_decision_id ++
    decision.after_hash
)

peb_state_hash = SHA256(
    "invariants:"    ++ document_hashes["invariants"]    ++
    "architecture:"  ++ document_hashes["architecture"]  ++
    "trajectory:"    ++ document_hashes["trajectory"]    ++
    "intent:"        ++ document_hashes["intent"]        ++
    "last_decision:" ++ last_decision_hash
)
```

Each document hash is independently computed and cached. Decision chain is a
Merkle link — `decision_n` includes `hash(decision_n-1)`. Cost per mutation is
O(1), not O(n).

**COGNITIVE_MODE** is derived from the current WorkStatus (from losm-ir):

| WorkStatus | Cognitive Mode |
|------------|----------------|
| NEW | intake |
| INTAKE | analyzing |
| PLAN_GENERATION | planning |
| PLAN_REVIEW | critiquing |
| PLAN_APPROVAL_GATE | approving |
| SPEC_GENERATION | specifying |
| EXECUTION | executing |
| VALIDATION | validating |
| COMPLETION | reflecting |
| BLOCKED | escalating |
| FAILED | escalating |

---

## 4. Tool Definitions (Thin Facades)

All tools in this section are **thin facades** over the `PebGovernanceEngine`.
Every tool call:

1. Deserializes the request
2. Opens a `PebTransaction` with an idempotency key
3. Passes through the **Admission Control Layer**:
   - Capability check → `peb_capabilities` table
   - Invariant check → hard laws + RCL
   - Transition check → losm-ir transition table
   - Transform check → RGEM validation (if applicable)
   - Resource check → entity ownership of target state
4. Executes the mutation (if ALLOW)
5. Records decision/trace/violation (if applicable)
6. Finalizes hash (incremental)
7. Commits the transaction
8. Returns the response

**Admission is not optional.** It runs on every tool invocation. There is no
"skip admission" path. The `admission_result` is stored in `peb_transactions`
for every call.

### 4.1 Admission Control — Shared Primitive

Every tool facade calls this before touching state:

```
AdmissionResult = PebGovernanceEngine.admit(
    entity_id:       string,     // who is acting
    capability:      string,     // what they want to do (token)
    action_context:  JSONB,      // the full request payload
    current_state:   WorkStatus, // current pipeline state
    target_state:    WorkStatus? // desired next state (if transition)
    proposed_delta:  JSONB?      // what they want to change (if transform)
)
→ Result<Allow, Reject<Violation>, Route<ExceptionEvent>>
```

**Allow** → proceed to transaction execution.  
**Reject** → hard halt; violation recorded.  
**Route** → soft violation; ExceptionEvent emitted; pipeline continues.

### 4.2 `peb_validate_transition`

**Purpose:** Check whether a WorkStatus transition is legal.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is requesting |
| `from_state` | string (enum: WorkStatus) | Current pipeline state |
| `to_state` | string (enum: WorkStatus) | Desired next state |

| Returns | Type | Description |
|---------|------|-------------|
| `allowed` | boolean | Whether the transition is legal |
| `reason` | string or null | Reason if not allowed |
| `admission_result` | string | `allowed`, `rejected`, `routed` |
| `transaction_id` | UUID | Audit reference |

**Implementation:** No direct logic. Calls `GovernanceEngine.admit()` with
capability `cap:validate_transition`. The engine delegates to
`losm_ir.transition.validate_transition()` for the transition table check.

### 4.3 `peb_check_invariants`

**Purpose:** Validate an action against hard laws + capabilities.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is acting |
| `proposed_action` | JSONB | What they want to do |

| Returns | Type | Description |
|---------|------|-------------|
| `passed` | boolean | All checks passed |
| `violations` | array | `[{ type, severity, message }]` |
| `missing_capabilities` | string[] | Capability tokens the entity lacks |
| `admission_result` | string | |
| `transaction_id` | UUID | |

**Implementation:** Calls `GovernanceEngine.admit()`. The engine checks:
1. Does entity hold the required capability token?
2. Does action violate any hard law? (state dependency, authority leakage,
   semantic normalization)
3. Are invariants from `peb_state` satisfied?

### 4.4 `peb_record_decision`

**Purpose:** Append a decision. This is a **state mutation** — goes through
full admission + transaction.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is recording |
| `title` | string | Decision title |
| `summary` | JSONB | Structured rationale |
| `affected_keys` | string[] | Which `peb_state` keys change |
| `entropy_class` | string | `collapser`, `shaper`, `neutral` |
| `commit_ref` | string or null | Git commit |

| Returns | Type | Description |
|---------|------|-------------|
| `decision_id` | UUID | Created decision |
| `adr_number` | string | e.g., `ADR-007` |
| `transaction_id` | UUID | |
| `peb_state_hash_before` | string | Before this transaction |
| `peb_state_hash_after` | string | After this transaction |

**Side effects (within PebTransaction):**
1. Admission check: entity must hold `cap:record_decision`
2. If `affected_keys` includes `invariants` or `architecture`: entity must hold
   `cap:mutate_state:key=<key>`
3. Creates `peb_decisions` row with `parent_decision_id` linking to last decision
4. Updates `peb_state` checksums for affected keys
5. Computes new `peb_state_hash` (incremental, O(1))

### 4.5 `peb_validate_transform`

**Purpose:** Validate a proposed Transform before execution (RGEM integration).

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who proposes |
| `state_view` | JSONB | What the transform needs to see |
| `context` | JSONB | `{ rules, invariants, allowedTransforms, executionMode }` |
| `proposed_delta` | JSONB | What the transform will change |
| `work_request_id` | string | Associated WorkRequest |

| Returns | Type | Description |
|---------|------|-------------|
| `valid` | boolean | Transform passes all checks |
| `validation_failures` | array | Structured failure reasons |
| `authorized` | boolean | Entity holds required capabilities |
| `trace_id` | UUID or null | Trace scaffold allocated if valid |
| `transaction_id` | UUID | |

**Implementation:** Calls `GovernanceEngine.admit()` with:
- Capability: `cap:propose_transform` or `cap:execute_transform`
- Invariant checks against proposed_delta
- Transform signature validation (from Plurality spec):
  - StateView ⊆ entity's allowed reads (resource check)
  - StateDelta ⊆ entity's allowed writes (capability check)
  - Context rules ⊆ PEB invariants (consistency check)
- If valid, allocates a `peb_traces` row with `status = 'observational'`

### 4.6 `peb_report_violation`

**Purpose:** Route a detected violation. This tool exists so that agents that
detect violations *during* execution can report them — it's the only tool that
skips the admission invariants check (since the violation may be about the
admission layer itself).

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who detected the violation |
| `violation_type` | string | `authority_leakage`, `state_dependency`, `semantic_normalization`, `rcl_violation`, `transform_invalid` |
| `severity` | string | `hard`, `soft` |
| `context` | JSONB | Full request context |
| `capability_attempted` | string or null | What capability was attempted |

| Returns | Type | Description |
|---------|------|-------------|
| `resolution` | string | `halted`, `routed`, `clarified` |
| `resolution_detail` | string | Explanation |
| `violation_id` | UUID | Created record |
| `transaction_id` | UUID | |

**Logic (per exception_policy.md):**
- **Hard breach** → resolution `halted`. Pipeline stops. Human attention needed.
- **Soft uncertainty** → resolution `routed`. ExceptionEvent emitted to
  observation stream. Pipeline continues.
- **Clarification** → resolution `clarified`. Passed through to cognitive layers.

### 4.7 `peb_append_trace_segment`

**Purpose:** Append an observational trace segment. Traces are **never
authoritative** — they record what happened but don't affect state.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is recording |
| `work_request_id` | string | Associated WorkRequest |
| `parent_trace_id` | string or null | Parent segment (DAG) |
| `stage` | string | Cognitive role or skill |
| `inputs` | JSONB | State summary at entry |
| `causal_entries` | JSONB | Why transformation occurred |
| `rejected_alternatives` | JSONB | Branch points considered and discarded |
| `confidence` | float | 0.0–1.0 |

| Returns | Type | Description |
|---------|------|-------------|
| `trace_id` | UUID | |
| `segment_sequence` | int | Sequence within WorkRequest |
| `transaction_id` | UUID | |

**Implementation:**
1. Admission: entity must hold `cap:append_trace`
2. Trace is marked `status = 'observational'` (enforced at DB level)
3. No state checksum update — traces never affect `peb_state_hash`

### 4.8 `peb_request_clarification`

**Purpose:** Emit a REQUEST_FOR_CLARIFICATION when an agent lacks context.

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is requesting |
| `work_request_id` | string | Associated WorkRequest |
| `ambiguity` | string | What is unclear |
| `options_considered` | JSONB | What the agent considered |
| `proposed_resolution` | string or null | Suggested way forward |

| Returns | Type | Description |
|---------|------|-------------|
| `clarification_id` | UUID | |
| `status` | string | `queued`, `routed_to_human`, `auto_answered` |
| `transaction_id` | UUID | |

**Implementation:**
1. Admission: entity must hold `cap:request_clarification`
2. Creates clarification record
3. Routes to appropriate channel based on configuration (human queue,
   auto-resolver, or observation stream)

### 4.9 `peb_extension_proposal`

**Purpose:** When PEB is silent on an issue, propose an extension
(per evolution_policy.md).

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Who is proposing |
| `gap_description` | string | What PEB is silent about |
| `proposed_content` | JSONB | Proposed structured change |
| `target_key` | string | Which `peb_state` key to extend |
| `rationale` | string | Why this extension is needed |

| Returns | Type | Description |
|---------|------|-------------|
| `proposal_id` | UUID | |
| `status` | string | `pending_review`, `auto_accepted`, `rejected` |
| `transaction_id` | UUID | |

**Implementation:**
1. Admission: entity must hold `cap:propose_extension`
2. Proposal is recorded in a `peb_violations` row with `severity = 'soft'`
   and `resolution = 'clarified'` (routed to observation for human review)

### 4.10 `peb_get_state_hash`

**Purpose:** Read-only. Returns current hashes without opening a transaction.

| Parameter | Type | Description |
|-----------|------|-------------|
| (none) | | |

| Returns | Type | Description |
|---------|------|-------------|
| `peb_state_hash` | string | Current root hash |
| `document_hashes` | object | Per-key hashes |
| `last_decision_hash` | string | |
| `thought_context_hash` | string | |
| `cognitive_mode` | string | |

**Implementation:** Reads from cache (invalidated on transaction commit). No
admission required — hashes are public information.

---

## 5. Prompt Definitions (Informational Only)

**Critical design rule:** Prompts are **read-only summaries**. They never
embed authority rules, invariant enforcement logic, or mode constraints.
Those live exclusively in the `PebGovernanceEngine` and the MCP tool layer.

If a prompt and a tool disagree about what is allowed, **the tool wins**.
The prompt is context; the tool is enforcement. This eliminates the
dual-enforcement-path problem.

### 5.1 `peb_context_injection`

**Purpose:** The UNIVERSAL_READ.md replacement — injects live PEB hashes and
pointers into agent context. Informational only.

**Template:**

```
=== PEB Context (Read-only) ===

State Hash:  {{PEB_STATE_HASH}}
Mode:        {{COGNITIVE_MODE}}

Recent decisions:
  {{RECENT_DECISIONS_SUMMARY}}

Resources:
  Invariants   → peb://state/invariants
  Architecture → peb://state/architecture
  Decisions    → peb://state/decisions
  Traces       → peb://state/traces/{work_request_id}

For enforcement, use MCP tools (peb_check_invariants, peb_validate_transform).
This context is informational only — tools define the governance boundary.
```

**Dynamic sections:**
- `{{PEB_STATE_HASH}}` — from `peb://state/hash`
- `{{COGNITIVE_MODE}}` — from `peb://state/hash`
- `{{RECENT_DECISIONS_SUMMARY}}` — last 5 decision titles + URIs (no rationale)

### 5.2 `peb_cognitive_mode_prompt`

**Purpose:** Returns the current cognitive mode description. No tool
suggestions, no constraints — just mode label + pointer to relevant resources.

| Parameter | Type | Description |
|-----------|------|-------------|
| `mode` | string | From WorkStatus mapping |

| Returns | Type | Description |
|---------|------|-------------|
| `mode_label` | string | Human-readable mode name |
| `description` | string | One-line mode description |
| `relevant_resources` | string[] | URIs useful in this mode |

### 5.3 `peb_role_contract` (Removed)

Role contracts are **enforced by the capability system**, not by prompts.
Agents discover their capabilities by calling `peb_check_invariants` or
`peb_validate_transform` and observing whether admission passes or rejects.
Capability tokens are stored in `peb_capabilities` — prompts have no
business duplicating them.

---

## 6. Meta-Policy → Kernel Mapping

Each meta-policy maps to a behavior of the `PebGovernanceEngine`, not to
individual tools. Tools are facades; the kernel is where policies execute.

| Policy | Enforced In | Trigger | Kernel Behavior |
|--------|-------------|---------|-----------------|
| **Evolution** | `AdmissionController` + `PebTransaction.commit()` | `peb_extension_proposal` tool, or direct mutation where PEB is silent | ADR Candidate recorded → kernel evaluates whether to auto-accept or defer; if accepted, `commit()` updates `peb_state` |
| **Evolution** | `PebTransaction.commit()` | `peb_record_decision` tool | Decision appended; state checksums updated; hash recomputed |
| **Exception** | `AdmissionController.reject()` | Hard law breach during admission | Pipeline HALT; `peb_violations` written with `severity=hard`; transaction rolls back |
| **Exception** | `AdmissionController.route()` | Soft law uncertainty during admission | `ExceptionEvent` emitted to observation stream; `peb_violations` written with `severity=soft`; transaction allowed to proceed |
| **Trace** | `PebTransaction.record()` | Cognitive boundary executes `peb_append_trace_segment` | DAG segment appended with `status='observational'`; no state hash change |
| **Uncertainty** | `AdmissionController` or direct tool | Entity lacks context (calls `peb_request_clarification`) | Clarification routed; entity may proceed or wait based on configuration |
| **Violation** | `AdmissionController` + `PebTransaction` | Detected during admission or reported via `peb_report_violation` | If hard: halt + rollback. If soft: route + continue. |

---

## 7. losm-ir ↔ PEB State Transition Mapping

### 7.1 State → Cognitive Mode

| losm-ir WorkStatus | PEB Cognitive Mode | Admission Checks at Entry |
|-------------------|--------------------|---------------------------|
| `NEW` | intake | Entity has `cap:process_work_request` |
| `INTAKE` | analyzing | Entity has `cap:validate_invariants` |
| `PLAN_GENERATION` | planning | Entity has `cap:propose_transform` |
| `PLAN_REVIEW` | critiquing | Entity has `cap:invalidate_transform` |
| `PLAN_APPROVAL_GATE` | approving | Entity has `cap:approve_plan` |
| `SPEC_GENERATION` | specifying | Decision log has an accepted plan |
| `EXECUTION` | executing | Entity has `cap:execute_transform` |
| `VALIDATION` | validating | Entity has `cap:validate_output` |
| `COMPLETION` | reflecting | Entity has `cap:record_decision` |
| `BLOCKED` | escalating | Violation record exists for this WR |
| `FAILED` | escalating | Hard violation recorded |

### 7.2 Transition → Kernel Invocation

Every state transition passes through `AdmissionController` before `PebTransaction`
executes:

| Transition (from → to) | Capability Required | Kernel Validates |
|------------------------|--------------------|------------------|
| NEW → INTAKE | `cap:validate_transition` | losm-ir table allows transition |
| INTAKE → PLAN_GENERATION | `cap:propose_transform` | Invariants satisfied; entity holds capability |
| PLAN_GENERATION → PLAN_REVIEW | `cap:invalidate_transform` | All proposed transforms have been validated |
| PLAN_REVIEW → PLAN_APPROVAL_GATE | `cap:approve_plan` | Remaining transforms valid; no unresolved critiques |
| PLAN_APPROVAL_GATE → SPEC_GENERATION | `cap:mutate_state:key=spec` | Decision to proceed was recorded |
| SPEC_GENERATION → EXECUTION | `cap:execute_transform` | Decision recorded; spec exists |
| EXECUTION → VALIDATION | `cap:validate_output` | Execution trace has been appended |
| VALIDATION → COMPLETION | `cap:record_decision` | Output passes success criteria |
| Any → BLOCKED | None (violation-triggered) | Soft violation → admission routes |
| Any → FAILED | None (violation-triggered) | Hard violation → admission rejects |

### 7.3 Transform Signature → losm-ir Types

The formal Transform signature from Plurality (section 19) is validated by
the kernel, not by individual tools:

| Transform Component | Kernel Validation | losm-ir Type |
|--------------------|-------------------|--------------|
| `StateView` | Entity has `cap:read_state` for each key in view | `Graph` (from `losm_ir.graph`) |
| `StateDelta` | Entity has `cap:mutate_state:key=X` for each delta target | `MutationRecord` (from `losm_ir.execution_receipt`) |
| `Context.rules` | Rules ⊆ PEB invariants (consistency check) | `InvocationContract` (from `losm_ir.executor_registry`) |
| `Trace` | Recorded as `status='observational'` — never feeds state | `peb_traces` table |
| `ValidationFailure` | Returned if any admission check fails | `ValidationResult` (from `losm_ir.transition`) |

---

## 8. Implementation Priorities (Kernel-First Order)

The `PebGovernanceEngine` kernel must exist before any MCP tool works correctly.
Phases are sequenced by dependency — no phase assumes tools from a later phase.

### Phase 1: Kernel Core + Storage

**Goal:** `PebGovernanceEngine` exists, `AdmissionController` gates all access,
`PebTransaction` sequences state mutations. State is queryable and incrementally
hashed.

**Deliverables:**
- `PebGovernanceEngine` (kernel): `admit()`, `begin()`, `commit()`, `rollback()`
- `AdmissionController`: capability check + invariant check + transition check
- `PebHashService`: incremental Merkle hashing (O(1) per mutation)
- PostgreSQL tables: `peb_state`, `peb_decisions`, `peb_transactions`, `peb_capabilities`
- MCP Resources: `peb://state/*` (all URIs from section 3.1)
- MCP Tool: `peb_get_state_hash` (read-only, no transaction needed)
- MCP Tool: `peb_validate_transition` (thin facade over kernel)

**What does NOT exist yet:** decision recording, transform validation, traces,
violations, extension proposals, clarifications. The kernel validates
transitions and exposes state — nothing more.

**Verification:** Calling `peb_validate_transition(NEW → INTAKE)` with an
entity that has `cap:validate_transition` returns `allowed=true`. Calling it
without the capability returns `rejected` with a violation.

### Phase 2: Decision + Capability System

**Goal:** Capability-based authority enforcement is live. Decisions are the
causal link between state transitions.

**Deliverables:**
- MCP Tool: `peb_record_decision` (thin facade → PebTransaction)
- MCP Tool: `peb_check_invariants` (thin facade → AdmissionController)
- Capability assignment workflow (how entities get their tokens)
- `peb_state` content seeded from `.agent/peb/` artifacts

**Kernel additions:**
- `PebTransaction.execute()` now checks that `peb_state` keys referenced in
  the decision exist (state dependency invariant)
- `AdmissionController` validates capability tokens against `peb_capabilities`

**Verification:** An entity without `cap:mutate_state:key=invariants` calling
`peb_record_decision` with `affected_keys=['invariants']` is rejected by
admission.

### Phase 3: Transform Validation + Trace DAG

**Goal:** Transforms are validated before execution (RGEM integration). Trace
DAG is recorded but never affects state.

**Deliverables:**
- PostgreSQL table: `peb_traces`
- MCP Tool: `peb_validate_transform` (thin facade → kernel transform check)
- MCP Tool: `peb_append_trace_segment` (thin facade → PebTransaction.record())

**Kernel additions:**
- Transform signature validation: StateView ⊆ reads, StateDelta ⊆ writes,
  Context rules ⊆ PEB invariants
- Trace recording with `status='observational'` (enforced at DB level)
- `peb_state_hash` does **not** change when trace is appended

**Verification:** A valid transform proposal creates a trace scaffold.
An invalid transform proposal (StateDelta exceeds entity's capabilities) is
rejected. Trace rows always have `status='observational'`.

### Phase 4: Violation + Exception + Clarification

**Goal:** Violation routing, exception events, clarification requests. The
full policy spectrum.

**Deliverables:**
- PostgreSQL table: `peb_violations`
- MCP Tool: `peb_report_violation` (skips invariant admission — may report
  admission failures)
- MCP Tool: `peb_request_clarification` (routes to human or auto-resolver)
- MCP Tool: `peb_extension_proposal` (routes to observation stream)
- Observation stream integration (Event Log from Event System Design)

**Kernel additions:**
- `AdmissionController.route()` — soft violations emit `ExceptionEvent`
- `AdmissionController.reject()` — hard violations halt + rollback
- Pipeline middleware that calls admission at every stage boundary

**Verification:** A soft invariant violation produces an `ExceptionEvent` in
the observation stream without halting. A hard authority breach halts the
pipeline and rolls back the transaction.

---

## 9. Integration Points

### 9.1 With conduit-mcp (Active MCP Server)

The PEB MCP server runs alongside the existing `conduit-mcp` server. It is a
**separate MCP server** that conduit-mCP agents connect to for governance:

```
Agent
  → conduit-mcp (plans, tickets, sessions)
  → peb-mcp    (invariants, authority, decisions, traces)
```

### 9.2 With Temporal (conduit)

Each Temporal activity should call PEB tools at entry/exit:
- Activity start → `peb_validate_transition(current, next)`
- Activity end → `peb_append_trace_segment`

### 9.3 With Nebula (Knowledge Layer)

Nebula workspace documents are not PEB state. Nebula feeds the pipeline with
domain knowledge; PEB governs how that knowledge is used. The boundary:
- Nebula: "Here is the system architecture document"
- PEB: "This executor may not modify architecture facts"

### 9.4 With losm-ir (IR Type System)

The `losm_ir.transition.validate_transition()` function is the core validation
primitive for state transitions. The PEB MCP server wraps it as an MCP tool
(`peb_validate_transition`) and extends it with:
- Invariant checks before the transition
- Authority checks on the entity requesting the transition
- Trace recording after the transition

---

## 10. File System Status (Per 3-Authority Resolution)

The existing `.agent/peb/` markdown files become **artifacts only** once the
PEB MCP server is operational:

| File | Future Status | Reason |
|------|---------------|--------|
| `.agent/peb/invariants.md` | Audit export of `peb_state` where key='invariants' | DB is source of truth |
| `.agent/peb/architecture.md` | Audit export of `peb_state` where key='architecture' | DB is source of truth |
| `.agent/peb/trajectory.md` | Audit export of `peb_state` where key='trajectory' | DB is source of truth |
| `.agent/peb/intent.md` | Audit export of `peb_state` where key='intent' | DB is source of truth |
| `.agent/peb/decision_log.md` | Audit export of `peb_decisions` table | DB is source of truth |
| `.agent/peb/meta/*.md` | Design reference — policy document | Policy logic moves to tool implementations |
| `.agent/peb/contracts/*.md` | Design reference — contract template | Dynamic prompt replaces template |
| `.agent/peb/contracts/UNIVERSAL_READ.md` | **No longer used** | Replaced by `peb_context_injection` prompt |

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| **Hash computation becomes bottleneck** | Cache `peb_state_hash`, invalidate on `peb_record_decision` or `peb_state` update |
| **Transform validation slows pipeline** | Validate transforms async; reject invalid ones without blocking valid ones |
| **PEB state diverges from database** | Single source of truth (PostgreSQL); file export is read-only projection |
| **Policy contradictions** | Hard invariants > soft policies; `peb_check_invariants` validates all before execution |
| **Over-governance blocks legitimate work** | `peb_request_clarification` is escape valve; soft violations route rather than halt |

---

## 12. Appendix A: Conduit RGEM Inversion — Design Validation

> **Notice:** This appendix is additive — it does not deprecate any prior
> content. It records the architectural validation provided by the Conduit RGEM
> conversation (transcript: `chats/Conduit RGEM Spec.html`), which independently
> converged on the same kernel→tools inversion that PEB v2 embodies.

### A.1 What the RGEM Transcript Established

The Conduit RGEM conversation defined **Conduit 2.0** as a unified execution +
semantics + governance runtime with the following properties:

- **Architectural inversion:** Frameworks (PGV, CGEL, PEB, LOSM) are no longer
  the system's definition. The *runtime* interprets and enforces frameworks
  as plugins.
- **RGEM as schema:** RGEM becomes the semantic schema of Conduit, not the
  system itself.
- **Tickets = stateful control tokens:** Not tracking artifacts — they carry
  execution authority.
- **Receipts = truth reconstruction primitives:** Not logs — they enable
  recovery after failure.
- **Governance = runtime constraint enforcement:** Not policy documentation.

### A.2 Alignment With PEB v2 Design

The PEB v2 spec (this document) was already designed with the same inversion:

| Conduit 2.0 Property | PEB v2 Equivalent |
|----------------------|--------------------|
| Runtime interprets frameworks | `PebGovernanceEngine` kernel enforces policies; MCP tools are facades |
| Frameworks are plugins | PGV/CGEL/LOSM inform state transitions and invariants but are consumed by the kernel, not by tools directly |
| Tickets = control tokens | Capability tokens (`peb_capabilities`) carry scoped execution authority |
| Receipts = truth reconstruction | `PebTransaction` + `peb_decisions` + Merkle hash chain enable deterministic replay and audit |
| Governance = runtime enforcement | `AdmissionController` gates every mutation; there is no "admission skip" path |

### A.3 Implications

1. **PEB v2 does not need revision** — the RGEM analysis validates the existing kernel→tools model as correct.

2. **When Conduit 2.0 materializes**, PEB becomes one of its interpretive layers:
   - Conduit 2.0 runtime → dispatches each mutation through PEB's `PebGovernanceEngine`
   - PEB remains a separate MCP server, but its *invocation* is managed by the Conduit runtime

3. **The ticket/receipt lifecycle** (from the transcripts) should integrate with PEB:
   - Tickets → carry `capability` fields that PEB's `AdmissionController` validates
   - Receipts → recorded in `peb_traces` with `status='observational'`
   - Proposed receipts → flow through `peb_extension_proposal` for evidence-backed proposals

### A.4 Reference

- Transcript: `chats/Conduit RGEM Spec.html` — full conversation defining Conduit 2.0
- This spec §1.1 — `PebGovernanceEngine` kernel architecture (independently converged)
- This spec §4.1 — `AdmissionControl` shared primitive
