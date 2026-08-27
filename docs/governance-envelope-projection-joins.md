# Governance Envelope Projection Joins — resolution/PEB Design (W1.08)

**Item:** Wave 1.08 [engineer, architect decision reserved] — thread
`c757b1af-781d-4a01-a6a5-c36f0301c8cc`.
**Status:** design draft for engineer/architect review. **No schema changes are
applied by this item**; every persistence step lands as a separate
implementation To Do (§7) gated by W1.10 activation criteria.
**Grounding:** ratified W1.01 field contract, W1.03 compatibility boundaries,
W1.05 wire contract (`nexus/typespec/v1/governance-envelope/`), W1.06 JSON-LD
identity, W1.04 canonical serialization. Agent records: intent `12c935db`,
this design (R2 id in the completion reply).
**Operator direction note:** devops role is executing under explicit operator
instruction; the architect ruling reserved by AC6 is surfaced in §8, not
assumed.

---

## 1. Problem

An admission envelope (W1.05 `GovernanceEnvelope`) carries identities only:
proposition/posture/doctrine UUIDs, contract id/version/digest, workflow node,
timestamps, evaluation fingerprint, and — after PEB admission — receipt
identities. Nothing on disk today tells you **which physical rows** those
identities denote, **which version of the law corpus** was in force at
`evaluated_at`, or **how to re-derive the same verdict** months later. The
governance loop's replay authority (architect ruling `ff7b06b2`) requires all
three.

Today's writers are advisory record-then-act bridges
(`nexus/python/cascade/peb_admission.py`, two paths: canonical
`resolution.admit_and_record`, fallback direct `INSERT INTO peb.transactions
ON CONFLICT (idempotency_key) DO NOTHING`). Their `input` JSONB already
carries a payload hash string, but nothing binds it to a versioned, queryable
law snapshot.

## 2. Principle: immutable evidence vs mutable current projections (AC1)

Two strictly separated planes; the envelope sits at their seam.

| Plane | Contents | Mutability | Store |
|---|---|---|---|
| **Evidence plane** | admission envelopes, their law snapshots, verdicts, fingerprints, receipts | append-only, never UPDATE (corrections create a new linked envelope) | `peb` schema (transactional authority) |
| **Projection plane** | "current best interpretation" rows consumed by UIs/planners (e.g. doctrine text per version, posture per family, per-subject gate history rollups) | rebuildable, derived; safe to drop/rebuild | `resolution` + dedicated projection tables, regenerated from the evidence plane |

Rule: the evidence plane is written **before** any projection is updated
(record-then-act already enforces this at admission time); projections may lag
and are rebuilt from evidence. This mirrors the R-D ruling (`2487aef3`, V129):
current-state lives in resolution, events in peb.transactions.

## 3. Envelope ↔ resolution.* joins (law references)

Every envelope law reference resolves into the existing V125-shaped corpus:

| Envelope field | Resolution row (PK) | Join surface | Notes |
|---|---|---|---|
| `law.proposition_ids[]` | `resolution.proposition.id` | direct PK lookup | V125 registered `pg:ready` etc. with deterministic UUIDs |
| `law.frame_values[]` | `resolution.frame_dimension` + `frame_dimension_value` | `(dimension.name, value)` or value id | e.g. `pg:system_mapped=true`; envelope stores value ids or scalars — §3.1 |
| `law.posture_ids[]` | `resolution.enforcement_posture.id` (V129) | direct PK | mode ∈ enforced/shadow at effective date |
| `law.doctrine_ids[]` | doctrine projection row (§4) | versioned projection | **not** a `peb.doctrine` table (none exists; §4) |
| `contract.*` | contract artifact registry (§3.2) | `(contract_id, version)` | digest must match recorded artifact |
| `workflow.node_id` | wind node projection (registry exported by W1.07 bundle) | `(workflow, node_id)` | identity-only |
| `fingerprint.evaluation_fingerprint` | recomputable via W1.11 canonicalizer | — | the drift canary |

### 3.1 Frame-value binding (scalar vs reference)

Envelope frame rows (`{frame, value}`) bind in one of two modes, detected
deterministically:

1. **Reference mode** — `value` is a `frame_dimension_value.id` (UUID shape).
   Join `resolution.proposition_frame_value` directly.
2. **Scalar mode** — `value` is a scalar (e.g. `"production"`, `true`, `0.7`).
   Join via `frame_dimension.name = frame` then match
   `frame_dimension_value.value` by scalar equality after W1.04
   canonicalization (booleans → `true/false` strings per V125 practice).

The adapter resolves both; the envelope itself never embeds resolution row
payloads — identity or scalar only (no second store of law content).

### 3.2 Contract identity registry (new, minimal)

A tiny append-only registry table keyed `(contract_id, contract_version)`
holding the TypeSpec-generated artifact digest (the `artifact-hashes.json`
digests the W1.07 bundle already pins). This is the join target for
`contract.contract_digest`. Until it exists, the digest in
`conformance/artifact-hashes.json` is the compatibility source (W1.03
"adopt via adapter" disposition). No TypeSpec change needed — the registry
records what the compiler already emits.

## 4. PEB doctrine references without activating dormant tables (AC2)

There is **no `peb.doctrine` table** anywhere in the tree (verified: zero
matches). Doctrine today is:

1. **Ratified record-backed doctrine** — architect decision records (e.g.
   `peb.decisions` ADRs, currently dormant per W1-R1) and agent-record
   doctrine entries tagged/type-stamped in nebula.
2. **Registered law fragments** — V125's `pg:*` rows in `resolution.*`.

Design: a **doctrine projection table** in `resolution` (or nebula — §7 D3
leaves the schema choice to the architect), one row per doctrine version:

```
doctrine_projection (
  doctrine_id      uuid  PK-part,          -- the envelope's doctrine_ids[] value
  doctrine_version int   PK-part,
  source_kind      text,                   -- 'peb_decision' | 'agent_record' | 'resolution_rule'
  source_ref       text,                   -- ADR number / record UUID / rule UUID
  content_digest   text,                   -- sha256 over the canonical doctrine text
  effective_from   timestamptz,
  superseded_by    uuid  NULL,             -- set by insertion of a newer version row
  created_at       timestamptz
)
```

- The envelope's `law.doctrine_ids[]` join here by `doctrine_id` with the
  **as-of** selection in §5.
- **No `peb.doctrine` table is created or assumed.** When the architect later
  ratifies a first-class doctrine surface, this projection becomes one of its
  rebuildable views (evidence plane stays authoritative).
- Dormant `peb.decisions` is **not written** by anything in this design; the
  projection's `source_kind='peb_decision'` rows would read ADRs only after
  the architect activates that surface (W1.10 criteria).

## 5. Bitemporal / replay semantics (AC3)

Two time axes, both already present in the corpus patterns:

- **Valid time** (doctrine/law effective dating): `effective_from` rows,
  supersession-by-insertion (V129 pattern). "What did the law say at
  `evaluated_at`?" = pick the row with max `effective_from <= evaluated_at`
  per doctrine/proposition, and its `superseded_by IS NULL OR
  effective_from > evaluated_at` (i.e., not yet superseded at that instant).
- **Transaction time** (evidence immutability): `peb.transactions.created_at`
  + append-only envelopes. "What did we claim at admission?" = the stored
  envelope row itself, never recomputed.

**Replay lookup** — deterministic, three steps:

1. Fetch stored envelope by `envelope_id` (evidence plane; immutable).
2. Resolve every law reference **as-of `law.effective_at`** (fallback
   `evaluation.evaluated_at`), using the §3 joins under valid-time selection.
3. Recompute `evaluation_fingerprint` (W1.11 canonicalizer) over the stored
   envelope and compare to the stored fingerprint. Equal → verdict replayed;
   different → drift flagged (doctrine changed under the envelope, or
   canonicalization version drift), handled as a NEW evaluation, never a
   mutation of the old envelope (W1.03 tombstone rules).

Replay never consults current-state projections; they are advisory views for
humans, not replay inputs (W1.07 AC4 boundary respected).

## 6. V125 posture and existing gate-transaction mapping (AC4)

Current `peb.transactions` rows written by the advisory bridges carry:
`entity_id` (e.g. lease id or candidate id), `tool_name` (gate name),
`admission_result` (ADMITTED/REJECTED), `input` JSONB (the gate payload,
including the W1.04 fingerprint string), `idempotency_key`
(`peb:<gate>:<entity>:<uuid>` shape), `created_at`.

Mapping to the new envelope, **without data loss and without rewriting
history**:

| Existing column | Envelope field | Mapping |
|---|---|---|
| `id` | — (transaction id) | receipt lineage: `authority.peb_transaction_id` for NEW envelopes; old rows keep their id untouched |
| `idempotency_key` | — | unchanged; new envelope-bearing rows extend the key vocabulary (`peb:envelope:<envelope_id>:<attempt>`) |
| `entity_id` | `semantic.subject_id` | same identifier; `subject_type` from gate name (`lease`/`promotion_candidate`/…) |
| `tool_name` | `contract.operation` + `workflow.node_id` | gate registry table maps `sol_lease_dispatch`→`admit_execution`/`node-admission` etc. (the W1.07 operation table already enumerates the surface) |
| `admission_result` | `evaluation.disposition` | ADMITTED→allow, REJECTED→reject; refuse/unknown only exist going forward |
| `input` JSONB | `inputs.input_fingerprint` + snapshot | payload hash already stored ≈ fingerprint; full snapshot stays in `input` (evidence), envelope cites it |
| `created_at` | `evaluation.evaluated_at` | same instant (advisory record-then-act wrote it at evaluation time) |
| `before_hash`/`after_hash`/`state_delta` | (post-admission state) | unchanged; orthogonal to the envelope |

Backfill posture: existing rows are **grandfathered evidence** — a one-time
backfill generates retroactive envelopes for them (separate To Do, §7 D2)
with `envelope_version=1`, `contract_version` recorded as the then-current
cap, and `law.doctrine_ids=[]` (V125 corpus registered 2026-08-24; pre-V125
rows legitimately cite an empty law set — the honest value, not a null
pretense). `peb.violations`/`peb.traces` are untouched.

## 7. Implementation To Dos (AC5 — separate, gated, none authorized by this design)

| # | To Do | Depends on | Gating |
|---|---|---|---|
| D1 | `governance_contract_registry` migration (append-only `(contract_id, version, digest, artifact_path)`) — Flyway in `nexus/sql/` continuing the V1xx series, `ON CONFLICT DO NOTHING`, deterministic UUIDs per house pattern | this design accepted | W1.10 criteria; R9 barium replication ask at apply time |
| D2 | `envelope_backfill` migration + runner for existing gate transactions (§6 mapping; `law.doctrine_ids=[]` for pre-V125 rows) | D1 | same |
| D3 | doctrine projection table + loader (§4; schema owner: architect ruling) | this design accepted | W1.10 + doctrine query-surface decision |
| D4 | write-path adapter v2 in `peb_admission.py`: accept an assembled envelope, write evidence row + cite receipt (idempotency key extension) | D1 | engineer review; advisory semantics preserved (fail-open to advisory, never flips a gate) |
| D5 | replay lookup helper (`resolution` function or python module) implementing §5 steps 1–3 | D1, D2 | W1.09 replay fixtures consume it |
| D6 | indexes: `peb.transactions(entity_id, created_at DESC)`, projection `(doctrine_id, effective_from DESC)` | D1–D3 | normal review |
| D7 | replication: apply D1–D6 to barium (192.168.1.212) with the R9 confirm-first rule; document in change log | D1–D6 | R9 user confirmation each step |

Each lands as its own To Do thread with its own acceptance criteria; none is
implicit in W1.08 acceptance.

## 8. Open items for the architect (AC6 — explicitly reserved, not assumed)

1. **`peb.decisions` participation in the first slice:** the design works
   with `peb.decisions` fully dormant (doctrine projection rows of
   `source_kind='peb_decision'` simply cannot be minted until activation).
   Options: (a) keep dormant — first slice joins only resolution law +
   contract registry (recommended; zero coupling to W1.10), or (b) activate a
   read-only ADR citation path. **Ruling requested; default (a) is designed.**
2. **Doctrine projection schema home:** `resolution.doctrine_projection`
   (suggested, matches "current state in resolution") vs a nebula-backed
   table. Default: resolution.
3. **Whether `peb.transactions` gains an `envelope_id` column now or the
   citation lives in `input.envelope_id` (no-DDL option).** Resolved
   (2026-08-27, W1.12): the TypeSpec `PebTransaction` contract now carries
   `envelope_id` as an optional field, and the Python `PebTransaction`
   domain model + API carry it through. The physical DDL column is still a
   clean later migration (D1/D4 in section 7); until then, `input` JSONB
   carries `envelope_id` (the no-DDL option, queryable via the idempotency-key
   vocabulary).

---

**Self-check against the six acceptance criteria:** AC1 §2; AC2 §4 (no
`peb.doctrine` activated or created); AC3 §5; AC4 §6; AC5 §7; AC6 §8.
