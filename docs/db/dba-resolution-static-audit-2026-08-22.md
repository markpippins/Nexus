# DBA audit — `resolution` schema (static source review)

**Run:** 2026-08-22  
**Role:** DBA  
**Scope:** Resolution migrations, consolidated schema, schema reference, and repository SQL call sites.  
**Mode:** Static only. `pg_isready -h localhost -p 5432 -U pguser -d nexus` returned **no response**. This report cannot establish the live catalog, data, grants, trigger attachment, or applied migration history.

## CRITICAL

### C1. The documented full-schema recovery source does not produce the documented current Resolution contract

**Promise:** `resolution_schema_consolidated.sql` is the “current canonical schema state” and the README presents it as the full-swap recovery path.

**Static fact:** the consolidated dump has neither the four v31 framing objects (`frame_dimension`, `frame_dimension_value`, `semantic_type_required_dimension`, `proposition_frame_value`) nor v32’s context-aware, three-column evaluator. It instead contains the old one- and two-argument `evaluate_proposition` functions returning `(disposition, all_passed)`. The README says the last apply was through v30 and does not prescribe v31/v32 as mandatory post-restore steps.

**Impact:** a documented fresh/full restore cannot represent frame commitments and restores obsolete evaluator semantics. Recovery, bootstrap, and catalog-versus-source verification will disagree with the intended system.

**Required action:** choose one authority model. Refresh both consolidated artifacts after v31/v32, or document and automate the exact ordered incremental chain after a consolidated restore. Add a clean-database assertion for the v31 tables and the single v32 function signature/return shape.

**Evidence:** `resolution/README.md` lines 18–19 and 54–56; `resolution_schema_consolidated.sql` around lines 766–880; `resolution_migration_v31.sql`; `resolution_migration_v32.sql`.

## GAP

### G1. `run_reconciliation_sweep()` has overlapping defaulted overloads

**Promise:** the sweep signatures use defaults, implying a simple operational entry point.

**Static fact:** the consolidated schema defines both `run_reconciliation_sweep(p_batch_limit integer DEFAULT 50)` and `run_reconciliation_sweep(p_stale_after interval DEFAULT interval '1 hour', p_batch_limit integer DEFAULT 50)`. Both match a zero-argument call. PostgreSQL overload resolution cannot select one based on the number of defaults consumed, so `resolution.run_reconciliation_sweep()` is ambiguous (`function ... is not unique`). No tracked invocation was found, but the defaults make that a likely scheduler/operator call.

**Detection:** only an invocation test; no Resolution integration test was found.

**Required action:** expose exactly one zero-argument public entry point. Remove defaults from the interval overload, rename it, or use a non-overlapping wrapper; test every supported arity.

**Evidence:** `resolution_schema_consolidated.sql` lines 1163–1210; `resolution_migration_v25b.sql`; `resolution_scheduler_v1.sql`.

### G2. Claim–evidence links are described as append-only but can be rewritten or deleted

**Promise:** `execution_claim_evidence` is documented as “append-only/expire-not-delete.” The admission function reads this relation to establish confirmed supporting evidence.

**Static fact:** the table has FKs, vocabulary checks, and an active-duplicate partial unique index, but no immutability trigger. The sole immutable trigger is attached to `execution_evidence`, not the link table. A direct `UPDATE` can alter `verification_state`, `role`, or endpoints; a direct `DELETE` removes the link. The partial index does not prevent that.

**Impact:** evidence content remains immutable but the claimed fact that it confirmed a specific claim can be retrospectively changed. The provenance guarantee used by admission is therefore convention-bound.

**Required action:** decide whether links are truly immutable. If yes, enforce insert-only plus a narrow, explicit expiry transition and restrict direct writes. If no, correct the comment and admission-audit expectations.

**Evidence:** `resolution_migration_v28_execution_claim_evidence.sql` lines 185–229; `resolution_migration_v30_verified_execution_admission.sql` lines 112–118; consolidated trigger list contains only `trg_execution_evidence_immutable` for this area.

### G3. “Durable” execution-admission receipts have no immutability or sole-write-surface enforcement

**Promise:** `execution_admission_receipt` is a durable, idempotent Resolution-side assessment record.

**Static fact:** it has primary/foreign keys and a unique `peb_transaction_id`, but no immutability trigger or stored-procedure-only write surface in tracked SQL. A principal with direct `UPDATE`/`DELETE` may rewrite the admitted result/reason or remove the idempotency record, enabling a later different assessment for the same transaction ID.

**Detection:** none at schema level; inspect live grants when PostgreSQL returns.

**Required action:** if receipts are audit facts, make them append-only and restrict direct mutation. If corrections are needed, represent them as superseding receipts instead of overwrites.

**Evidence:** `resolution_migration_v30_verified_execution_admission.sql` lines 27–49 and 157–167; no receipt trigger exists in the consolidated dump.

### G4. No executable repository test covers v31/v32’s database contract or bootstrap topology

**Promise:** v32 claims verified overload cleanup and the four context outcomes; v31 depends on a trigger for cross-table semantics.

**Static fact:** no Resolution SQL/integration test was found. There is no tracked clean-bootstrap test that verifies the intended migration chain, a single evaluator signature, refusal non-writes, non-object/unknown-context behavior, or cross-dimension reference rejection.

**Required action:** add a clean-database integration test covering all four v32 outcomes and negative v31 frame-value cases. It should also assert that the official restore/bootstrap path reaches the tested schema.

## DRIFT

### D1. The schema reference documents a superseded evaluator API

`nexus/docs/resolution-schema-reference.md` documents two evaluator overloads returning two columns. v32 documents a single three-argument function returning `(disposition, all_passed, context_status)`. Consumers generated from the reference cannot observe refusal status and may rely on obsolete overloads.

**Action:** regenerate the reference from the authoritative catalog once C1’s source-of-truth decision is resolved, and add a release check.

### D2. Migration-status language conflicts with the documented applied state

v28 calls its revision “unapplied,” while the README says v28–v30 were applied on 2026-08-20 and the consolidated dump contains their objects. This does not prove live drift, but it makes source review unable to distinguish pending DDL from historical DDL.

**Action:** keep one reliable migration ledger and remove stale “unapplied” language.

## OBSERVATION

### O1. Admission policy does not explicitly require an Asserted semantic claim

`admit_verified_execution_claim` rejects `Rejected`, `Disputed`, `Stale`, and `Retracted`, but permits `Proposed` and `Pending` claims to return `admitted = true` when evidence/context checks pass. This is an authority-policy decision, not a unilateral DBA fix: v28 says an `Asserted` claim requires evaluation and independent evidence, while v30 frames admission as distinct from PEB settlement.

**Decision needed:** state whether PEB admission may proceed before semantic assertion. If not, require `v_claim.disposition = 'Asserted'`; if yes, document and test why pending/proposed is sufficient.

### O2. v31’s trigger-based framing rule is sensible, but its live attachment remains unverified

The v31 trigger enforces reference ownership, value kind, and scalar castability. That is a database-enforced design only if the target catalog has the trigger attached and callers lack a bypassing write path. PostgreSQL is unavailable, so neither fact was verified.

## Since last run

The prior retained report, `nexus/docs/db/dba-audit-2026-07-22.md`, was a live cross-schema audit and has no Resolution-specific baseline. This is the first retained Resolution-focused pass found in `nexus/docs/db`.

New findings: C1 consolidated-state drift; G1 default-overload ambiguity; G2–G3 history/audit guarantees not enforced by tracked DDL; G4 missing executable contract coverage; D1–D2 documentation/status drift.

Still unverified while PostgreSQL is down: actual catalog and applied versions, table grants, trigger attachment, orphans, duplicate edges, vocabulary values, and live impact.
