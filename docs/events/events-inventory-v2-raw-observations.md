# Events — Raw Observation Inventory (v2)

> **What this is.** The correction pass. v1 cataloged *event types* — tasteful,
> filtered, already-decided. That was premature: the mandate was to inventory
> **everything that happens** at the observation layer, then decide worthiness
> later. This document is the basement-with-a-flashlight pass: raw observable
> facts crawled from implementations and the live database, per system.
>
> **The pipeline this feeds** (chat's framing):
> `observed occurrence → candidate event → canonical event type → should publish? → bus/topic → payload/schema`
>
> This doc covers **stages 1–2 only**, deliberately. Nothing here is judged
> worthy of the bus. If it happens, it's listed.

## How this was grounded

- **AST crawl** of every `.py` in 23 Python project dirs (`python/nexus_core`,
  `ir`, `address`, `nats_envelope`, `tackle`, `conduit`, `timeclock`,
  `heartbeat`, `operator_svc`, `steward`, `vision`, `vision-srv`, `cascade`,
  `rover`, `voyager`, `voyager-adapter`, `auditor`, `epistemologist`, `meep`,
  `substance`, `fs`, `nebula-mcp-client`, `util`) — per function: **raise
  branches** (with message), **return shapes**, **caught exceptions**, emit-ish
  calls, outbound calls, route decorators.
- **Route/status/throw/state-write grep** of ~47 TypeScript projects
  (`typescript/*`).
- **Live DB**: CHECK constraints (state machines), triggers (enforcement +
  notification), tables carrying status/state columns, and `DISTINCT event_type`
  from the tables that already store events (`cascade.events`, `wind.events`,
  `peb.governance_events`).
- **Operation inventory** of all 103 `bin/` scripts (curl methods, psql
  writes, exit codes, ports touched).
- **Rust/Go** CCNF verifier structure.

Legend: `✅` = emits/stores today (measured, not remembered) · `◻` = observed
occurrence, candidate raw event only.

---

## 0. Cross-cutting: the DB is the authoritative state-machine vocabulary

Every state machine below was extracted verbatim from live CHECK constraints.
These are the *actual* transition vocabularies — any candidate transition event
must use these values.

| Schema.table | Column | Allowed values |
|---|---|---|
| conduit.work_request_events | event_type | WORKREQUEST.CREATED, VISION.IR_PRODUCED, STATE.TRANSITION_PROPOSED, STATE.TRANSITION_APPROVED, STATE.TRANSITION_COMMITTED, EXECUTION.STARTED, EXECUTION.COMPLETED, EXECUTION.FAILED, SYSTEM.CRON_TRIGGERED, WR_SUBMITTED, WR_VALIDATED, WR_QUEUED, WR_CLAIMED, WR_ACKED, WR_SETTLED, WR_REJECTED, WR_FAILED, WR_NOOP, WR_DEFERRED |
| conduit.work_request_state | current_state | PROPOSED, PLANNING, PENDING, IMPLEMENTING, REVIEW, COMPLETED, FAILED, CANCELLED |
| execution.attempts | status | CREATED, RUNNING, SUCCEEDED, FAILED, TIMED_OUT |
| execution.leases | status | ACTIVE, EXPIRED, RELEASED |
| execution.receipts | type | ABANDONED, API_LIMIT, BLOCK, CANCELLED, CCNF_EXECUTION, CRITIQUE, CRITIQUE_PASS, CRITIQUE_REJECT, EXECUTION_COMPLETE, HOLD, IMPLEMENTATION, PLANNING, PLAN_BLOCK, PLAN_CREATE, PROPOSED, REQUEUED, REVIEW, REVIEW_PASS, REVIEW_REJECT |
| execution.requests | status | DRAFT, COMPILED, VALIDATED, ADMITTED, READY, COMPLETED, FAILED, CANCELLED |
| kernel.intent | status | active, completed, abandoned, superseded |
| kernel.receipt | receipt_type | proposed, plan_create, planning, implementation, review_pass, review_reject, transition_committed, transition_rejected, intent_registered, artifact_registered, policy_violated, notification_sent |
| nebula.agendas_history | status | draft, ready_for_review, in_review, specified, archived |
| nebula.agent_records_history | record_type | report, analysis, assessment, inspection, prompt, response, engineering_log, architecture_note, decision |
| nebula.harvest_candidates_history | status | pending, linked, useful, rejected, promoted, superseded |
| nebula.harvest_candidates_history | type | requirement, principle, rejected_alternative, tension, rationale, mixed |
| nebula.implementation_plans_history | status | draft, pending, approved, work_requested, completed, archived |
| nebula.intent_records_history | source_type | transcript, audit_plan, manual, candidate |
| nebula.intent_records_history | status | draft, refined, decomposed, archived |
| nebula.open_questions_history | status | OPEN, IN_DELIBERATION, RESOLVED, WONT_FIX, DEFERRED |
| nebula.op_registry_history | status | active, deprecated, superseded |
| nebula.projections_history | type | deterministic, inference |
| nebula.requirements_history | req_type | Epic, Story, Task, Bug |
| nebula.requirements_history | status | Backlog, ToDo, InProgress, Active, Blocked, Done, Cancelled, Accepted |
| nebula.requirement_verifications_history | status | PENDING, APPROVED, REJECTED, DEFERRED |
| nebula.segment_sets | status | active, archived |
| nebula.specifications_history | revision_type | created, revised, merged, split, retired |
| nebula.work_requests_history | business_status | DRAFT, APPROVED, DISPATCHED, COMPLETED, CANCELLED |
| nebula.work_sessions_history | status | Pending, Completed |
| nebula.work_sessions_history | parent_type | system, subsystem, feature, requirement |
| semantics.asset_identity_claim | claim_type | identity, supersession, derivation, consolidation, split |
| semantics.asset_identity_claim | status | open, resolved, rejected |
| semantics.asset_relation | relation_type | supersedes, derives_from, contradicts, consolidates_into, split_from, owns, member_of, equivalent |
| semantics.evidence_item | verification_state | candidate, confirmed, contested, superseded |
| semantics.statement_evidence | statement_type | source_observation, agent_record, work_request, implementation_plan, harvest_candidate, representation_relationship, concept_relationship |
| tackle.agent_scheduler | schedule_type | interval, cron, manual, event |
| tackle.providers | type | openai, anthropic, google, ollama, opencode, codex, spring_ai, lm_server, custom |
| tackle.role_leases | status | ACTIVE, EXPIRED, RELEASED |
| vision.receipts | type | (same 19 as execution.receipts) |
| wind.tickets | status | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| wind.workflow_instances | status | ACTIVE, COMPLETED, FAILED, PAUSED |
| assembly.post_artifact_refs | artifact_type | intent_record, requirement, agenda_item, spec, implementation_plan, harvest, harvest_candidate |
| assembly.post_supporting_refs | ref_type | spec, cross_reference, source_url, evidence, attachment |
| assembly.reactions | reaction_type | LIKE, LOVE, ANGER, SADNESS, SURPRISE |
| throttler.links | type | link, separator |

**DB-level enforcement triggers** (these fire on writes — each is an observable
occurrence in its own right):

- `conduit`: `trg_enforce_state_transition` (BEFORE INSERT on
  work_request_events — rejects illegal transitions), `trg_update_wr_state`
  (AFTER INSERT — materializes state), `trg_notify_wr_event`,
  `trg_bridge_to_wind_events` (AFTER INSERT → wind bridge)
- `execution`: `trg_attempt_lease_consistency` (BEFORE — rejects
  attempt/lease mismatch), `trg_receipts_immutable` (BEFORE — guards
  append-only receipts)
- `kernel`: `trg_authorize_receipt`, `trg_authorize_transition` (BEFORE — authz
  gate), `trg_notify_transition` (AFTER)
- `peb`: `trg_notify_governance_event` (AFTER INSERT)
- `nebula`: `trg_conversation_blocks/snapshots_insert` (INSTEAD OF),
  `trg_harvests_history_auto_segment` (AFTER — auto-segments docklang
  harvests), `trg_notify_open_question_event`, `trg_member_expired`,
  `trg_segment_expired`
- `vision`: INSTEAD-OF view triggers over artifacts/branches/
  governance_events/lifecycle_events/receipt_ingest_records/work_request_edges;
  `trg_receipt_governance`, `trg_receipts_assign_sequence`,
  `trg_auto_ir_version`, `trg_vision_work_requests_asset`
- `wind`: `trg_bridge_ticket_to_cascade` (ON UPDATE status →
  COMPLETED/CANCELLED), `trg_bridge_instance_to_cascade` (ACTIVE →
  COMPLETED/FAILED)
- `voyager`: `updated_at` on entity / identity_candidate / requirement_candidate
- `semantics`: `trg_statement_evidence_check_statement`; registry service →
  asset link

---

## 1. What is already on the bus (measured `DISTINCT event_type`, live)

**cascade.events** (21): `harvest.captured`, `candidate.discovered`,
`candidate.assessed`, `candidate.promoted`, `candidate.escalated`,
`candidate.greenlit`, `intent_record.created`, `question.created`,
`agenda.item_added`, `ripple.assessed`, `evaluation.started`,
`evaluation.failed`, `evaluation.completed`, `harness.started`,
`harness.failed`, `harness.completed`, `test.event`, `wind.instance.completed`,
`wind.instance.failed`, `wind.ticket.completed`

**wind.events** (7): `harvest.created`, `wr.submitted`, `wr.validated`,
`wr.queued`, `wr.claimed`, `wr.acked`, `wr.deferred`

**peb.governance_events** (12): `receipt:PROPOSED`, `receipt:PLAN_CREATE`,
`receipt:PLANNING`, `receipt:IMPLEMENTATION`, `receipt:REVIEW`,
`receipt:REVIEW_PASS`, `receipt:REVIEW_REJECT`, `receipt:REQUEUED`,
`receipt:API_LIMIT`, `receipt:BLOCK`, `receipt:HOLD`, `receipt:CANCELLED`

**conduit.work_request_events**: the 19-value event_type CHECK (see §0).

**kernels**: `kernel.event_log`, `kernel.transition_event`.

**Other event-ish tables**: `conduit.lineage_log`, `conduit.kernel_delta_log`,
`conduit.cost_logs`, `cascade.nats_publish_log`, `registry.status_events`,
`tackle.session_logs`, `tackle.system_logs`, `voyager.topology_signal`,
`vision.governance_events_history`, `vision.lifecycle_events_history`.

**Known emitters (code)**:
- `python/rover/event_emitter.py` — the canonical emitter: `emit_event` core +
  20 typed wrappers, each with a fixed `event_type` (harvest.captured,
  candidate.discovered/classified/completed/promoted/assessed/greenlit/
  escalated, intent_record.created, agenda.created/item_added,
  embedding.created, cross_reference.created,
  requirement.promoted_to_plan, question.created, ripple.assessed)
- `python/cascade/*` — subscribers that read cascade.events and emit
  (admission → `emit_wr_validated`; assessment → `emit_assessment`;
  inference → `publish_result`; kernel/obs subscribers → `enqueue_publish`)
- `wind-srv` — `publishToNats` (6), `publish` (2)
- `harness-srv` — `emitGovernanceReceipt` (5), `emitEvent` (4)
- `conduit-mcp` — `emit` (11), `emitToolEvent` (5), `emitGovernanceUpdate`,
  `emitEvent`
- `vision_bridge.py` — `issue_receipt` / `issue_receipt_raw` → vision.receipts
- `cli_executor.py` / `execution_worker.py` — `_emit_vision_receipt` /
  `issue_execution_receipt` completion tails
- `voyager` — `publisher.publish` (NATS js/nc), `topology.emit_signals`
- `address/tts` — NATS subscriber loop
- `substance` — listens for `trg_segment_expired` NOTIFY
- `peb-srv` — `emit`, governance insert
- `kernel-srv` — `emit` (1)

---

## 2. WRP core — `python/nexus_core/wrp` + `python/ir` + `python/address` + `python/nats_envelope`

### addressing.py
- `content_hash(raw)` → sha256[:12] — **◻ hash computed**
- `make_address(realm, graph, trajectory, node_id, version)` → `cal://…`
  — **◻ address minted**
- `parse_address(address)` → dict | **None** — **◻ address parsed / address
  unparseable / address rejected**

### identity.py
- `canonical_json(value)` → canonical encoding; `_encode_*` variants:
  string/array/map/float/bool/null — **◻ canonical encode done**
- `normalize_intent(intent)` → `RAISE ValueError("cannot normalize intent:
  empty action…")` | normalized verb — **◻ intent normalized / intent rejected
  (empty action)**
- `derive_identity(doc)` → `RAISE ValueError("no action in intent")` |
  `(entity_key, 'event', scope)` — **◻ identity derived / identity missing
  (no action)**
- `derive_entity_key` → **◻ entity key derived** (chat's decomposition applies
  here: canonical / existing / newly derived / ambiguous / missing /
  conflicting identity)

### conduit_wrp_reducer.py
- `wrp_state_category(state)` → mapped | **'active' default** — **◻ state
  categorized**
- `receipt_to_wrp_state(receipt_type)` → WRP state
- `determine_abstraction_level(...)` → **L1 | L2 | L3 | L4**
- `level_to_visibility_scope` → scope
- `reduce(plan_id, …, receipts)` → WRPProjection — **◻ projection reduced /
  receipt appended**
- `extract_ir_opcodes`, `projection_schema_shape`

### states.py / kernel.py
- `is_valid_transition(from, to)` → bool — **◻ transition checked (allowed /
  rejected)**
- `KernelDelta.__post_init__` → `RAISE ValueError("delta_id is required")`;
  `is_ok` / `is_error` — **◻ delta invalid (missing id)**

### harness/ (launcher + enums)
- `parse_execution_mode` → **INTERACTIVE | mode** (ValueError caught)
  — **◻ execution mode parsed / unrecognized**
- `HarnessLauncher.build()` → cmd; `prepare_role_prompt_file` → path;
  `from_harness_row` (Tuple caught → default opencode launcher)
  — **◻ launcher built / fallback launcher used / prompt file prepared**

### ir/ — the lease/arbitration state machine
- `lease_lifecycle.transition(lease, to_status)` → `RAISE ValueError` |
  new lease — **◻ lease transition attempted / rejected (illegal)**
- `lease_lifecycle.apply_timeout` → EXPIRED | None — **◻ lease window expired**
- `lease_lifecycle.is_terminal` / `can_retry` — **◻ lease terminal / retryable**
- `lease_pool.acquire` → None | binding — **◻ lease acquired / acquire missed**
- `lease_pool.at_capacity` — **◻ pool at capacity**
- `lease_pool.find_preemption_target` → None | lowest — **◻ preemption target
  found**
- `lease_pool.preempt` → None | entry — **◻ lease preempted**
- `lease_pool.consolidate_idle(target_executor)` → n — **◻ idle leases
  consolidated**
- `arbitration_engine.score/select/select_with_load` — capability fit 0/1/
  matched-count — **◻ arbitration scored / lease selected / no match**
- `scheduler.ingest` → entries; `process_unassigned` → dispatched;
  `process_preemption`; `cycle` → telemetry — **◻ event ingested / work
  unassigned / dispatched / preempted**
- `work_surface.add` → entry; `_move_status` (UNASSIGNED/DEFERRED);
  `unassigned`/`deferred_due` — **◻ work added / deferred / due**
- `dispatcher.dispatch` → None | dispatch_event — **◻ dispatch emitted**
- `event_projection.select` (Tuple caught) — **◻ projection selected**
- `state_dag.mutate` → `RAISE ValueError` | version — **◻ state version
  committed / mutation rejected**
- `state_replay.replay` → dag — edges CAUSED_BY / INVALIDATES — **◻ edge type
  inferred**
- `state_view.project` — **◻ state view projected**
- `mutation_rules` CollapseChainRule (`applies`: exactly 1 parent + 1 child),
  MergeIdleLeasesRule — **◻ chain collapsed / idle leases merged**
- `role_lease.execute` → LeaseResult(status) — **◻ lease executed**
- `provenance_graph.trace_backward/forward` — **◻ provenance traced**
- `lease_compiler.compile` → (lease, provenance) — **◻ lease compiled**
- `temporal_annotator.annotate` — **◻ temporal annotation applied**

### conduit/wrp_kernel (reducer engine)
- `engine.reduce(delta)` → KernelResult(**INVARIANT_VIOLATION** |
  **VALIDATION_ERROR** | value) — **◻ delta applied / invariant violated /
  validation error**
- `engine.commit` → `RAISE ValueError`; `replay`; `byte_identical_replay` →
  fingerprint pair — **◻ kernel replay match / fingerprint mismatch**
- `kernel_state_fingerprint(state)` → sha256 — **◻ fingerprint computed**

### meep (execution-graph compiler + CER writer)
- `ast_parser.parse/extract_headings/extract_code/extract_body_text`
  — **◻ prompt parsed / features extracted**
- `irl_classifier.classify` → IRLResult (REJECT archetype etc.)
  — **◻ prompt classified → archetype**
- `cer_writer.make_node_start/make_node_complete` → CEREvent (`evt-{exec}-{n}`)
  — **◻ CER event written (start/complete)**
- `lowering_pass.lower` → exec graph; `_topological_sort` → `RAISE ValueError`
  (cycle) — **◻ graph lowered / cycle detected**
- `models.FrozenGraphError` (setattr after freeze) — **◻ graph mutation after
  freeze rejected**
- `scheduler.schedule` → FrozenGraphError if not frozen — **◻ schedule attempted
  on unfrozen graph**
- `spec_compiler.compile_selection` → REJECT graph — **◻ spec compiled**
- `pipeline.run_pipeline/run_and_replay/run_conformance_pipeline`
  — **◻ pipeline run / replay executed**

### nats_envelope
- `CanonicalEnvelope.from_dict` → ValueError (malformed) | envelope
  — **◻ envelope decoded / envelope malformed**

---

## 3. CCNF verifiers — `rust/wrp/ccnf-verifier` + `go/wrp/ccnf-ref` + `python/conduit/ccnf_bridge.py`

- **rust** `main.rs`: `--stdin` mode → read stdin → `encode_canonical_str` →
  hash → output; `process::exit(1)` on read/parse failure — **◻ verifier
  invoked / canonicalized / hash emitted / exited 1 (parse error)**. Modules:
  contract/{normalization,ordering,hashing,serialization},
  ccnf/{canon,artifacts,identity,cer,intents,build,parse,deltas},
  projection/{account,…}, vectors, verifier, ffi, runtime
- **go** `ccnf-ref`: replay/{fold,state,replay,cursor,snapshot},
  conformance/runner, internal/replayseal/seal, r4r5 crosscheck
- **python ccnf_bridge**: `from_work_request` → `RAISE CCNFBridgeError` (DCO id
  empty); `call_ccnf_conformance` → CCNFResult | raises (CER hash missing,
  FileNotFoundError, JSONDecodeError, subprocess TimeoutExpired);
  `deterministic_hash` → `RAISE` (signature.hash empty); `attach_execution` →
  raises (hash empty / completed_at < started_at / started_at <= 0 / wr_id
  empty) | receipt; `_compute_replay_binding` → hexdigest
  — **◻ DCO→CCNF converted / conformance called / verifier binary missing /
  verifier timed out / execution attached / replay binding computed**

---

## 4. conduit (Python) — tickets, sessions, execution, budgets, kernel storage

### db_adapter.py (every method is an observable write/read)
- Ticket lifecycle: `create_ticket_if_missing` → None|row|ticket_id;
  `claim_ticket` → None | ticket_id (rowcount>0) — **◻ ticket created /
  claimed / claim missed (contention)**
- `close_ticket`/`release_ticket`/`abandon_ticket` → rowcount>0;
  `release_session_tickets` → n; `create_next_tickets` → 0|count;
  `supersede_ticket` → {superseded:False} | {superseded:True,…};
  `cancel_ticket` → n — **◻ ticket closed / released / abandoned /
  superseded / cancelled**
- `detect_stale_tickets` → n; `detect_expired_tickets` → n;
  `close_orphaned_tickets` → n — **◻ stale tickets detected / expired tickets
  detected / orphans closed**
- Sessions: `get_active_session`/`get_all_active_sessions`/
  `get_last_session_activity` — **◻ session queried / session active**
- Circuit breaker: `is_circuit_breaker_tripped` → False|tripped;
  `is_conduit_paused`; `trip_and_requeue(plan, role, error, detail, source,
  model_cfg)` — **◻ circuit tripped / conduit paused / requeued**
- Budgets: `get_agent_budget` → None|{ceiling_usd,…}; `get_ticket_budget`;
  `get_token_usage_by_*`; `fetch_model_pricing` — **◻ budget read / budget
  missing**
- Kernel storage: `save_kernel_delta` → inserted; `save_kernel_snapshot`;
  `get_latest_snapshot`/`get_nearest_snapshot`; `log_lineage_event` → True
  — **◻ kernel delta stored / snapshot taken / lineage logged**
- Execution: `acquire_lease` → None|lease; `release_lease`/`expire_lease`/
  `expire_stale_leases` → count; `renew_lease`; `create_attempt`;
  `start_attempt`; `complete_attempt(status, exit_code, …)`;
  `issue_execution_receipt`; `get_or_create_execution_request`; `cascade_admission`
  → count — **◻ lease acquired/renewed/expired/released / attempt
  created/started/completed/failed / receipt issued / request created**

### execution_worker.py
- `_reconcile_plans` → created; `_claim_conduit_ticket` → None|ticket;
  `_process_one` → **'completed' | 'dry-run' | 'failed' | 'leased'** (RuntimeError
  caught); `_recover_orphans` → released; `_run_pass` → summary
  — **◻ worker pass run / request completed / request failed / lease held /
  orphan recovered**

### executor_cloud.py
- `run_ollama` → `RAISE RuntimeError` (ollama not installed) | result
  — **◻ ollama harness unavailable**
- `_run_harness_subprocess` → TimeoutExpired / FileNotFoundError /
  join(stdout) — **◻ harness subprocess spawned / timed out / binary missing**
- `run_opencode`/`run_codex` → result; `_run_from_path` → **exit 2 | 3** (3 =
  ollama produced no output) — **◻ opencode run completed / exited 2 /
  exited 3**
- `_capture_session_cost`, `_send_heartbeat(session_id, role, pid)`,
  `_detect_api_limit_error` → bool, `_extract_token_split` → (in,out)
  — **◻ cost captured / heartbeat sent / API limit detected**

### main.py (dispatcher)
- `acquire_lock` → False|True; `_is_lock_stale` — **◻ lock acquired / lock
  stale**
- `_dispatch_one` (Popen); `dispatch_single_plan` (ProcessLookupError);
  `run_role` — **◻ plan dispatched / process already gone**
- `_check_budget` → False|True — **◻ budget exceeded**
- `_kill_process_tree(pid, sig)`; `_cleanup_orphaned_processes` — **◻ process
  tree killed / orphans cleaned**
- `_resolve_default_emit_mode` → ValueError — **◻ emit mode invalid**

### cli_executor.py
- `claim_and_execute` → `_emit_vision_receipt` on completion; `list_pending_requests`
  — **◻ request claimed / completed + receipt emitted**

### conduit app/ (FastAPI reducer surface)
- routes_admin: `list_identities`, `update_identity` (PATCH), `delete_identity`
  (DELETE), `check_consistency` → {aligned, engine_version} — **◻ identity
  updated/deleted / consistency checked**
- routes_breaker: `get_breaker`, `trip_breaker` → {tripped:True}, `reset_breaker`
  → {tripped:False, ticketsReset}, `pause_conduit`/`resume_conduit`,
  `get/save_failure_recovery` — **◻ breaker tripped/reset / conduit
  paused/resumed / recovery config saved**
- routes_delta: `ingest` → DeltaResponse(success False|True) — **◻ delta
  ingested / rejected**
- routes_receipts: `insert_receipt` → {ok:True}, `delete_receipts_by_plan_and_type`
  → {deleted:n} (HTTPException), `get_latest_receipt_type` — **◻ receipt
  inserted / deleted**
- routes_sessions: `kill_session` → {killed:True, pids} (OSError caught),
  `update_session_cost`, `update_session_heartbeat`, `get_stale_sessions`
  — **◻ session killed / heartbeat / cost updated / stale detected**
- routes_state: `get_state`, `get_lineage` — **◻ state/lineage read**
- reducer_service: `apply_delta`, `current_state`; replay_service: `replay`,
  `compare` → {match: bool} — **◻ replay compared (match/mismatch)**

---

## 5. conduit-mcp / conduit-srv (TS)

### conduit-mcp routes (25 observed)
- GET `/events` `/health` `/healthz` `/metrics` `/readyz` `/sessions`
  `/state` `/tools` `/wr` `/wr/:id` `/wr/:id/events` `/wr/:id/projection-drift`
- POST `/` (JSON-RPC) `/agents/:role/kill` `/circuit-breaker/reset`
  `/circuit-breaker/trip` `/conduit/pause` `/conduit/resume`
  `/plans/:planId/restart-builder` `/plans/:planId/unblock`
  `/sessions/:sessionId/cost|heartbeat|kill` `/tickets/:ticketId/cancel`
  `/tickets/:ticketId/supersede` `/tools/call` `/vision/receipts`
  `/wr/:id/transition` `/wr/submit` `/wr/tick`
- Status: **500×19, 400×16, 404×10, 503, 502, 202, 201** — **◻ per-route
  outcome observed (see table below)**
- State writes: `pending`(18), `open`(17), `archived`(15), `cancelled`(12),
  `claimed`(10), `abandoned`(5), `validated`(4), `superseded`(4), `stale`(4),
  `expired`(4), `kind='STUCK_PENDING_PLAN_AGE'`(4), `DRAFT`(2), `COMPLETED`(2),
  `CANCELLED`(2), `idle`(3)
- Emits: `emit`(11), `emitToolEvent`(5), `emitGovernanceUpdate`,
  `emitEvent` — **✅ tool event emitted**
- SQL writes: DELETE vision receipts/tickets by plan, DELETE
  role_circuit_breaker, DELETE providers/models, DELETE FROM …

### conduit-srv routes
- GET `/cron` `/drift-scan` `/events` `/failure-recovery` `/lineage/:planId`
  `/plan/:planId` `/receipts` `/role/:role` `/ticket/:ticketId`
  `/work-requests` (+/:id) `/detect` — POST `/failure-recovery` `/replay`
  `/work-requests`; status 500×11, 400×7, 404×2, 503
- SQL writes: INSERT PEB governance, INSERT VISION work_requests, UPDATE
  circuit_breaker, ON CONFLICT wr_id DO UPDATE

**◻ candidate observations (conduit surface):** tool call requested /
authorized / rejected / tool not found / failed / timed out · session killed /
costed / heartbeated / stale · circuit tripped / reset · conduit paused /
resumed · work request submitted / transitioned / ticked · plan unblocked /
builder restarted · ticket cancelled / superseded · projection drift detected
(STUCK_PENDING_PLAN_AGE) · receipt ingested via /vision/receipts

---

## 6. vision — `vision-srv` + `losm-host` + `losm-store` + `losm-ir` + `losm-kernel` + `losm-shell`

### vision-srv routes (all FastAPI)
- GET `/health` `/work-requests` `/work-requests/:id` `/work-requests/:id/branches`
  `/work-requests/:id/artifacts` `/work-requests/:id/dag` `/work-requests/:id/dag/path/:target`
  `/work-requests/:id/validate-dag` — POST/PATCH/DELETE work-requests,
  branches, artifacts (HTTPException on 404)

### losm-host api
- branches: `create_branch`, `fork_branch`, `get_branch_info`, `list_branches`,
  `score_branch`, `merge_branch`, `discard_branch_endpoint`, `select_best_branch`
  — **◻ branch created / forked / scored / merged / discarded / best selected**
- artifacts: `list_artifacts`, `read_lineage` — **◻ artifact lineage read**
- receipts: `ingest_receipt` → ReceiptIngestResponse — **◻ receipt ingested**
- routes: `validate_graph` → {valid: True, graph} | HTTPException (invalid) —
  **◻ graph validated / graph invalid**
- websocket: `_handle_ws_command` → STATUS_RESPONSE | ERROR | UNKNOWN_COMMAND;
  WebSocketDisconnect — **◻ ws command received / unknown command / disconnect**
- work_requests: create/read/list/orchestrate (→"Orchestration started")/
  transition/compile_plan — **◻ WR orchestrated / transitioned / plan
  compiled**

### losm-store
- `ingestor.ingest` → **{status: ingested} | {status: duplicate} |
  {status: orphaned} | {status: rejected, reason}** — **◻ receipt
  ingested/duplicate/orphaned/rejected** (this is the canonical ingest outcome
  vocabulary)
- `repository`: create/get/update/delete work request, list artifacts, get
  artifact lineage, branch CRUD + score/merge/discard, edge create/delete
  — **◻ store write/read outcomes**

### losm-ir
- `compiler` passes → each returns `(result, warnings)`: pass_normalize,
  pass_tenant_bind, pass_dag_construct, pass_structural_validate,
  pass_execution_compatibility, pass_policy_annotate — **◻ compile pass run /
  warning emitted**
- `_detect_cycles` → CycleInfo(has_cycle, cycle_nodes) — **◻ cycle detected**
- `compile_dag` → CompilationResult(success False|True, errors)
  — **◻ DAG compiled / compile failed**
- `invariant.validate_all` → per-invariant results — **◻ invariant
  satisfied/violated**
- `traversal.execute` → BFS/DFS/topological; `_receipt_terminal` →
  **SUCCEEDED | FAILED | BLOCKED | SKIPPED** — **◻ node execution
  succeeded/failed/blocked/skipped**
- `transition.validate_transition` → ValidationResult(allowed True|False +
  reason) — **◻ transition allowed/rejected**
- `work_status_to_phase` → NEW default

### losm-kernel
- `constraints.validate` → ConstraintViolation | {result:True,
  justification_trace} — **◻ constraint violation / justified pass**
- `core.run(program, env, max_iters)` → (state, trace) fixed point —
  **◻ morphism program run / fixed point reached**
- `morphism.resolve` → KeyError (unbound) — **◻ morphism unbound**
- `tbel.tbel_filter` → TBELError "REJECT: UNBOUND OUTPUT: missing trace_id"
  — **◻ trace binding rejected**
- `tesl.compute_trace_family` / `equivalent` → bool — **◻ trace family
  computed / equivalence decided**

### losm-shell
- `orchestrator.coordinate` → {status: COMPLETING…} | {status: FAILED, error};
  `_transition_or_fail` → TransitionError — **◻ orchestration completed /
  failed / illegal transition**
- `planning/compiler.compile` → SpecIR — **◻ spec IR produced**
- `runtime/executor.execute` → ExecutionResult — **◻ execution result**
- `runtime/handler` → ExecutionReceipt via dispatch_morphism / dispatch_program

**◻ candidate observations (vision surface):** WR created / orchestrated /
transitioned / plan compiled · branch forked/scored/merged/discarded · receipt
ingested/duplicate/orphaned/rejected · graph validated/invalid · cycle
detected · compile warning · invariant violated · node
SUCCEEDED/FAILED/BLOCKED/SKIPPED · fixed point reached · trace family computed

---

## 7. cascade (Python) — the event pipeline itself

- `event_store.append` → LedgerEvent; `replay` / `replay_from_checkpoint`;
  `rebuild_state` / `rebuild_all_projections`; `get_state` → LedgerState|None;
  `store_ir_artifact`; `fold_events`; `reduce_event` (ValueError) —
  **◻ event appended / state rebuilt / projection rebuilt / IR artifact
  stored**
- `state_machine.assert_transition` → InvalidTransitionError; `check_transition`
  → TransitionResult(valid); `apply_transition`; `create_initial_state`;
  `get_reachable_states`; `get_all_paths_to` — **◻ transition enforced /
  rejected / reachability computed**
- `admission_subscriber.handle_work_request_created` →
  `emit_wr_validated` → **'advanced' | 'already_advanced' | 'error'**;
  AdmissionFailure — **◻ WR admitted / already advanced / admission failed**
- `assessment_subscriber.run_coordinated_assessment` → outcome;
  `emit_assessment` → False|True — **◻ assessment emitted / failed**
- `inference_subscriber.invoke_inference` → **(stdout, None) | (None, err)**
  with 6 error variants: binary not found / harness build failed / nonzero
  exit / invocation failed / **timed out** / ollama refused — **◻ inference
  completed / binary missing / timed out / ollama refused**
- `nats_publisher.enqueue_publish` → queue.Full → **drop + log**;
  `try_enqueue_event`; `event_type_to_subject` → subject (or
  nexus.cascade.v1 fallback); sidecar start/stop — **◻ event enqueued /
  queue full / dropped / subject mapped**
- `coordinator.resolve_outcome` → **DELIBERATION | INFORMATIONAL |
  RECOMMENDATION** (+doctrine apply) — **◻ outcome resolved to doctrine
  tier**
- `validators.events.validate_event` → (False, reason) | (True, None) —
  **◻ event shape invalid (missing type / missing field / payload not dict)**
- `conformance/assertions`: has_subject / has_outcome / has_artifact /
  has_receipt / has_lineage — **◻ conformance assertion passed/failed**
- `conformance/probe.capture_chain(timeout, min_events)` → bundle —
  **◻ event chain captured / timed out**
- `evaluators/*` → AssessmentDimension per evaluator — **◻ dimension
  evaluated**

---

## 8. wind (TS wind-srv + wind schema)

- Status: **201×11, 503, 500, 404**; Throws: NotFoundError×46,
  BadRequestError×21 — **◻ per-route outcome (not found / bad request)**
- State writes: ACTIVE(5), COMPLETED(4), PENDING(2), PAUSED(2),
  IN_PROGRESS(2), FAILED(2), CANCELLED(1) — **◻ ticket/instance state
  transitions**
- Emits: `publishToNats`(6), `publish`(2) — **✅ NATS publish**
- SQL: `UPDATE … SKIP LOCKED` (ticket claiming — **◻ claim contended /
  lost**), INSERT/DELETE INTO wi…
- Triggers: `trg_bridge_ticket_to_cascade` (COMPLETED/CANCELLED →
  cascade), `trg_bridge_instance_to_cascade` (ACTIVE → COMPLETED/FAILED)
  — **◻ bridged to cascade**

**◻ candidate observations:** ticket created / claimed / started / completed /
cancelled · workflow instance started / completed / failed / paused · event
published to NATS · claim lost to contention · bridge fired

---

## 9. tackle — `tackle-srv` + `tackle-mcp` (TS) + `python/tackle` (scheduler, planner, groomers)

### TS surface
- tackle-srv routes: `/roles` `/role/:role` `/bundles(/:role)` `/harnesses`
  `/models` `/providers` `/config/ai` `/config/ai/validate` `/resolve/:role`
  `/drift` `/due` `/history` `/inspector/dispatch` `/procedure/:slug`
  `/procedures/:role` `/role-updates` `/metrics` `/health` + DELETE per
  resource; **status 500×76, 400×24, 404×20, 409×2, 201**
  — **◻ role config resolved / bundle loaded / drift computed / due computed /
  dispatch inspected**
- tackle-mcp routes: `/config/ai/*` mirror, `/scheduler` `/scheduler/due`
  `/sessions` `/log/:sessionId` `/prompts/get` `/roles`
  `/config/failure-recovery` `/config/role` CRUD + PATCH `/scheduler/:id`;
  **status 500×35, 400×18, 404×13, 503×2, 202**; SQL: INSERT
  circuit_breaker(tripped, up…) — **◻ scheduler entry updated / circuit
  inserted**
- role_leases CHECK (ACTIVE/EXPIRED/RELEASED) — **◻ lease issued / consumed /
  renewed / expired / released**

### python/tackle
- `agent_scheduler_runner.evaluate_tick` → summary; `launch_agent` →
  **{status:'launched', pid} | {status:'error', error: not found | str(e)}**;
  `_is_interactive_hosted` → True (INTERACTIVE); `_has_eligible_work` → bool;
  cron parse → ValueError — **◻ tick evaluated / entry due (cron/interval) /
  agent launched / binary not found / launch error / interactive-hosted
  skip / no eligible work / empty pipeline skip**
- `planner` grooming: `assess_candidate` → emit_candidate_assessed;
  `create_questions`/`create_evidence_questions` → emit_question_created;
  `check_ripple_assessment` → emit_ripple_assessed; `promote_candidate` →
  emit_candidate_greenlit; `escalate_candidate` → emit_candidate_escalated
  — **✅ candidate assessed / question created / ripple assessed / greenlit /
  escalated**
- `candidate_promote`: `fetch_ready_candidates`, `check_candidate_dedup` →
  {source: implementation_plan|intent_record}|None, `create_intent_record` →
  emit_intent_record_created, `promote_candidate` → emit_candidate_promoted +
  emit_agenda_item_added — **✅ intent record created / candidate promoted**
- `intent_requirement_promote`: `create_requirement` → req_id|'NULL'|None;
  `update_intent_status` → False|True — **◻ requirement created / intent
  status updated**
- `req_compiler.compile_requirement` → emit_requirement_promoted_to_plan;
  `call_conduit_submit_work_request` → None|wr_id (HTTPError/URLError caught)
  — **✅ requirement promoted to plan / WR submitted to conduit / conduit
  unreachable**
- `resolve_questions.batch_resolve` → count; `resolve_requirements`
  — **◻ batch resolved**
- `agent_chat._detect_crash_type` → **6 categories: binary/file not found ·
  interrupted by signal · missing import/undefined var · missing python
  module · out of memory · syntax error** — **◻ harness crash typed**
- `inference._call_provider` (openai/google/anthropic/ollama) → None|result;
  `_call_with_retry` — **◻ provider call failed / retried**
- `tools_aggregator_client` → RuntimeError (not initialized) / ValueError /
  httpx.HTTPError — **◻ tool client init failed / call failed**
- `vision_bridge.create_work_request/issue_receipt` → {ok:False,error}|result
  — **✅ governance receipt issued via vision**

---

## 10. harness-srv (TS) — the execution guardrail

- Routes: GET `/health` `/sessions`; POST `/resolve-context` `/run`
- Status: **400×3 (◻ /run refused — INTERACTIVE guard), 500×2, 503**
- Emits: `emitGovernanceReceipt`(5), `emitEvent`(4) — **✅ governance receipt
  on run lifecycle**
- SQL: INSERT INTO …, INSERT INTO cascade.ev… — **◻ cascade event written**
- Spawn refactor: child PID tracked → watchdog can SIGTERM directly (no
  pkill -f) — **◻ child spawned / PID tracked / watchdog kill fired / unload +
  record**

**◻ candidate observations:** run requested → context resolved → spawn →
governance receipt (started/completed/failed) → watchdog triggered on runaway
→ kill + unload + record · run refused (400: interactive-bundle with lease /
unbounded consumer) · session ended · cost captured

---

## 11. execution (execution-srv + execution schema)

- Status: 404×2, 503, 500, 400; state writes ACTIVE(13) RELEASED(4)
  EXPIRED(3) COMPLETED(2) SUCCEEDED RUNNING READY CREATED
- Drift-kind observations embedded in the service: `unreleased_lease_for_terminal_request`,
  `stale_active_lease`, `receipt_request_mismatch`, `receipt_attempt_mismatch`,
  `orphan_lease_request_mismatch`, `attempt_status_diverges_from_request`,
  `attempt_orphan_no_lease`, `attempted_no_completion` — **◻ drift kind
  detected** (these are already half-cooked candidate events)
- State machines (from §0): attempts CREATED→RUNNING→SUCCEEDED/FAILED/
  TIMED_OUT; leases ACTIVE/EXPIRED/RELEASED; requests DRAFT→COMPILED→
  VALIDATED→ADMITTED→READY→COMPLETED/FAILED/CANCELLED; receipts 19 types
- Triggers: attempt/lease consistency guard, receipts immutable guard

**◻ candidate observations:** request compiled / validated / admitted ·
lease acquired / renewed / expired / released · attempt created / started /
completed / failed / timed out · receipt issued (19 types) · drift kind
detected · immutability guard rejected an edit

---

## 12. nebula — `nebula-srv` + `nebula-mcp` (TS)

- nebula-srv status profile: **500×213, 400×93, 404×91, 201×34, 409×7,
  410×3, 403×3** — the largest API surface; **◻ per-route outcome**
- State writes: OPEN(7) ACTIVE(6) RELEASED(3) EXPIRED(3) superseded promoted
  Backlog useful RESOLVED Pending deprecated active — **◻ records moved
  between these states**
- SQL writes: DELETE audit_files, features, subsystems, systems; INSERTs…
- State machines (from §0): agent_records 9 record_types; harvest_candidates
  status 6 + type 6; implementation_plans status 6; intent_records 4+4;
  open_questions 5; requirements 8 statuses; specifications revision_type 5;
  work_requests business_status 5; work_sessions 2 (+4 parent types);
  segment_sets; agendas 5 — **◻ any of these transitions**
- Triggers: harvest auto-segment (docklang discourse_units),
  conversation blocks/snapshots INSTEAD OF, notify open question, member/
  segment expiry

**◻ candidate observations:** agent record created/updated · harvest captured
/ segmented · candidate discovered/classified/linked/rejected/promoted ·
requirement status changed · open question opened/resolved/deferred · intent
refined/decomposed/archived · specification revised/merged/split/retired ·
projection rendered · work session pending/completed · segment expired ·
conversation block/snapshot written · 409 conflict / 410 gone / 403 forbidden

---

## 13. assembly — `assembly-srv` + `assembly-mcp`

- Status: 201×9, 500, 404; Throws NotFoundError×27, BadRequestError×19
- State writes: ACTIVE OPEN APPROVED REVIEW RESOLVED PENDING IN_PROGRESS
  healthy DRAFT COMPLETED ACCEPTED
- SQL: INSERT assembly.posts (+supporting_refs, users), UPDATE forums,
  ON CONFLICT DO NOTHING; fetch×4 (outbound)
- Server contract: comment POST **requires body + postedById** (400 otherwise)
  — **◻ comment persisted / rejected (400)**
- assembly-mcp: forums/users/state + bridges forum-agenda / post-artifact /
  supporting-refs / move-thread — **◻ bridge executed / thread moved**
- CHECKs: post_artifact_refs 7 artifact types, supporting_refs 5 ref types,
  reactions 5 types

**◻ candidate observations:** thread created · comment posted / rejected ·
post moved · reaction added (LIKE/LOVE/ANGER/SADNESS/SURPRISE) · artifact
linked · supporting ref added · forum created · persistence contract violation
(400)

---

## 14. kernel — `kernel-srv`

- Status: 403×2 (authz rejections), 201×2, 503, 500, 404, 400; emit(1)
- State machines (from §0): intent active/completed/abandoned/superseded;
  receipt 12 types incl. policy_violated, notification_sent;
  transition_committed/rejected
- Triggers: authorize_receipt, authorize_transition (BEFORE — authz gate),
  notify_transition (AFTER), policy_rule updated_at

**◻ candidate observations:** intent registered/completed/abandoned/
superseded · receipt authorized / rejected · transition authorized / denied /
committed / rejected · policy rule updated · notification sent · policy
violated · 403 on unauthorized write

---

## 15. peb — `peb-srv` + `peb-mcp`

- Status: 409×2 (conflicts), 201×2, 500, 404, 400
- State writes: superseded, healthy; SQL: INSERT/UPDATE peb.decision,
  UPDATE peb.governance_events
- peb.governance_events: 12 `receipt:*` event types + notify trigger
- peb.traces: CHECK status = 'observational' — **◻ trace captured
  (observational)**

**◻ candidate observations:** decision recorded / superseded · governance
event emitted (receipt:*) · trace captured · 409 conflict on duplicate write

---

## 16. role-memory / tackle-seeds / tackle-prompt-sync

- role-memory-srv: GET `/health` `/procedure/:slug` `/procedures/:role`,
  POST `/refresh`; status 500×6, 503×2, 404×2 — **◻ procedure card loaded /
  missing · role index loaded · refresh triggered / failed**
- tackle-prompt-sync-srv: GET `/health` `/prompt/:role/:slug` `/prompts/:role`
  `/tasks/:role`, POST `/refresh`; status 500×8, 503×2, 404×2
  — **◻ prompt synced / task template resolved / refresh failed**
- tackle-seeds: `seedMemoryProcedures` generator + manifest + pre-commit gate +
  CI manifest guard + wr-conf-006 — **◻ seed rendered / seed verify pass /
  seed drift detected (manifest mismatch)**

---

## 17. timeclock

- Routes: POST `/clock-in` `/clock-out` `/heartbeat` `/timeout-cleanup`;
  GET `/active-sessions` `/session-log` `/session-stats`
- `clock_in` → TimeclockResponse(success); `clock_out`/`heartbeat` →
  HTTPException (unknown session); `timeout_cleanup` → {success, timed_out:
  rowcount} — **◻ clocked in / clocked out / heartbeat / session timed out /
  session not found**

---

## 18. heartbeat + registry / service-broker

- `heartbeat.start/_send_once` → False|True; `stats`; `registry.status_events`
  table exists (no emitter measured) — **◻ heartbeat sent / failed / skipped ·
  service status observed UP/DOWN · status changed · missed heartbeats**
- service-broker-mcp: status `ok` | `FAILURE` — **◻ broker call
  succeeded/failed**
- The chat decomposition applies wholesale here (registry.service family):
  health check issued / returned / timed out / failed · status observed UP /
  DOWN · status changed UP→DOWN / DOWN→UP · consecutive-failures threshold
  crossed · recovery threshold crossed · flap detected

---

## 19. voyager + fs-crawler (filesystem observation)

### voyager (src/ + legacy/)
- `scanner.scan` / `scan_continuous` / `process_dir` / `process_file`
  (FileNotFoundError) — **◻ file observed / dir scanned / file missing**
- `persistence.create_epoch` / `complete_epoch(files_scanned, new_files,
  cached_files, errors_count)` / `fail_epoch(error)` — **◻ epoch
  started/completed/failed**
- `insert_file_observation` / `insert_directory_observation` /
  `insert_edge_hint(evidence_type, evidence_confidence)` — **◻ observation
  persisted / edge hint persisted**
- `topology.emit_signals` / `emit_topology` / `prune_history` — **✅ topology
  signal emitted**
- `legacy.identity._calculate_drift_magnitude` → **MAJOR | MASSIVE | MINOR |
  TRACE** — **◻ drift magnitude computed**
- `legacy.losm.handle_drift` / `handle_span` → MetadataSpanEmitted —
  **◻ span emitted**
- `voyager_envelope_adapter.create_envelope` / `subject_for` —
  **◻ envelope created / subject mapped**
- `validator.validate_emission` → ValueError — **◻ emission rejected**
- `voyager_semantics_adapter.upsert_canonical_asset` / `upsert_asset_revision`
  / `insert_source_observation` — **◻ canonical asset upserted / revision
  written / source observation recorded**
- `claim_triage.triage` → (flagged, stats) — **◻ claim flagged**

### fs-crawler
- `metadata_processor.process_file` → AudioMetadata | DocumentMetadata |
  ImageMetadata | VideoMetadata | None; `_determine_file_category` →
  audio/document/image/other/video — **◻ metadata extracted / category
  determined / unsupported**
- `duplicate_detector.find_duplicates_by_fingerprint` / `by_content_hash` →
  groups; `resolve_duplicate_group`; `_should_delete_file` →
  **(True, reason) | (False, 'No deletion criteria met')** — **◻ duplicate
  group found / deletion decided**
- `duplicate_resolver._determine_final_action` → **delete | keep | review |
  None** — **◻ resolution action decided**
- `rules_engine.evaluate_file_against_rules` / create/update/delete rule —
  **◻ rule matched / evaluated / created/updated/deleted**
- `database.ensure_redis_healthy` → False|True — **◻ redis healthy/unhealthy**

---

## 20. semantics — `semantics-srv` + `semantics-mcp`

- Routes: `/canonical_asset` CRUD + `/identity-claims` + `/relations` +
  `/revisions` + `/external-ids`, `/evidence_item`, `/statement_evidence`,
  `/asset_identity_claim/:id/resolve`, `/drift_finding/:id/resolve`, `/meta`
- Status: 404×18, 500×17, 400×8, 201×5, 409
- State machines (from §0): identity claim open/resolved/rejected (5 claim
  types); relations 8 types; evidence verification candidate/confirmed/
  contested/superseded; statement_evidence 7 types
- Triggers: check_statement_id; registry service → asset link

**◻ candidate observations:** asset created / revisioned · identity claim
filed / resolved / rejected · relation added (supersedes/derives_from/
contradicts/consolidates_into/split_from/owns/member_of/equivalent) ·
evidence confirmed / contested / superseded · drift finding resolved ·
external id linked / removed · 409 conflict

---

## 21. knowledge — `knowledge-srv`

- Routes: `/entities`, `/entities/:section/:entity_id(+/relations)`, `/edges`,
  `/cross-references`, `/summary`, `/migrations`, `/health`; status 500×7,
  503, 404 — **◻ entity/edge/cross-ref fetched · summary computed · migration
  checked · health unhealthy (503)**

---

## 22. substance (segment sets)

- Routes: `/segment-sets` CRUD + `/segment-sets/:id/members`,
  `/domain/:type/:id/links` (link/unlink/list); HTTPException on bad resolve
- `repository.create_segment_set` / `update` / `add_members` /
  `list_resolved_segments` / `list_domain_links` — **◻ segment set
  created/updated · member added/removed · segment linked/unlinked**
- `listener.listen_segment_expirations` (NOTIFY from trg_segment_expired;
  QueueFull caught) — **◻ segment expiry notification received**
- `cache.get_segset` (redis) — **◻ cache hit / miss**
- `main._heartbeat_loop` — **◻ heartbeat**

---

## 23. auditor / epistemologist / rover (claim & concept extraction + agenda matching)

- `auditor/claim-extractor._extract_from_transcript` →
  {claims:n, dry_run} | {claims:0, **error:'LLM call failed'** | **'JSON parse
  error'** | **'skipped'**}; `_persist_claims` → stats;
  `create_evidence_item` → dict | {deduped:True, id:None} — **◻ claim
  extracted / persisted / deduped / LLM failed / JSON unparseable**
- `epistemologist/extractor._extract_from_text` → stats;
  `create_concept(is_proposal)` / `create_concept_relationship(confidence,
  evidence_note)` / dedup evidence — **◻ concept created / relationship
  created / evidence deduped**
- `rover/agenda_matcher.match_intent_to_agenda` → AgendaMatch(is_new | skip |
  best, score); `compute_similarity` → 0.0|sim; `add_item_to_agenda` →
  emit_agenda_item_added; `create_agenda` → (agenda_id, item_id)|(None,None)
  — **✅ agenda item added / agenda created**
- `rover/assembly_publish.publish_harvest_to_forum` → False|True;
  `_link_post_artifact`; `_add_supporting_ref` — **◻ harvest published to
  forum / artifact linked**
- `rover/embed_util.embed_texts` → RuntimeError | ValueError (no texts);
  cache load/miss — **◻ embedding computed / cached / miss / model call
  failed**
- `rover/rover_mcp_server`: submit_transcript → job_id|error (docling
  conversion failed, file not found, no chunks); get_pending_chunk →
  {done:True} | {error: unknown job}; submit_extraction → invalid agenda
  JSON; compile_agenda → output_path|error (no extractions) —
  **◻ transcript submitted / chunk extracted / agenda compiled / job unknown**
- `rover/event_emitter` — the canonical emitter, see §1.

---

## 24. operator_svc (interactive chat orchestration)

- `operator.respond` → {response, model_identifier}; `_parse_tool_call` →
  {kind: rest|tool} | None (JSONDecodeError) — **◻ tool call parsed /
  unparseable**
- `_execute_mcp_tool_call` → cached | error text — **◻ tool executed / failed
  / cache hit**
- `_execute_rest_tool_call` → cached | "Error ({status}): {error}" | invalid
  JSON body — **◻ REST proxied / proxied error / bad body**
- `api_proxy.proxy_request` → {status: 400 unknown service | 500 error | 502
  connection | e.code | resp.status} — **◻ proxy outcome (400/500/502/upstream
  code)**
- `_compact_and_extract` → {summary, topics}; `_detect_topic` → 'general' |
  max topic — **◻ context compacted / topic detected**
- `server._handle_chat/_handle_stream/_drain_queue` — **◻ message received /
  streamed / queued**
- `chat_store.log_prompt_response` / `get_session_history` / save-load queue
  — **◻ prompt/response logged / history read**

---

## 25. address-tts

- `main.do_POST` (JSONDecodeError caught); `speech_worker_loop`;
  `_nats_subscriber_loop` — **◻ TTS request received / utterance enqueued /
  NATS message received / unparseable**
- `projector.project_event` → None | Utterance; `project_health_check`
  (pending/active/blocked counts); `project_static_text` — **◻ utterance
  projected / no projection for event type**
- `synthesizer.synthesize` → SynthesisResult | RuntimeError;
  `_ensure_voice_model` → RuntimeError (download fail); `_synthesize_subprocess`
  → RuntimeError — **◻ TTS synthesized / voice model missing / synthesis
  failed**
- `utterance_queue.enqueue` → False|True; `dequeue`; `peek_next_delay` —
  **◻ utterance queued / queue full**
- `audio.play` → False|True; `_try_playback` (FileNotFoundError) —
  **◻ audio played / player missing**

---

## 26. MCP tool-server family (the ~20 MCP servers + clients)

Shared observable shape (applies to **each** server): GET `/health` · POST `/`
(JSON-RPC: initialize / tools/list / tools/call) · status 400/503/500.

Per server specifics measured:
- `tools-aggregator`: POST `/init` → **initialized | initialization_failed**;
  `/tools`, `/registry`, `/tools/:name`, `/tools/by-service/:service`,
  `/tools/call`; status 404×3, 500×2, 400
- `slash-command-mcp`: throws CoercionError×12, DslParseError×5,
  DispatchError×4; `dispatchToolCall`(2) — **◻ DSL unparseable / coercion
  failed / dispatch failed**
- `file-system-server` / `secure-file-system-server`: status 'UP', Error×11 —
  **◻ fs op succeeded / error**
- `image-server`: phases **evaluation | source**, status UP/DOWN — **◻ image
  processed / phase entered**
- `address-tts-mcp`: status ok | unreachable | error
- `ui-tools-mcp`: status ok | unreachable; `service-broker-mcp`: ok|FAILURE
- `semantics-mcp` / `assembly-mcp`: GET `/health` `/state`, POST `/`,
  status 503/400
- `tackle-mcp`, `nebula-mcp`, `knowledge-mcp`, `peb-mcp`, `vision-mcp`,
  `terrain-mcp`, `mcp-bridge`, `tackle-cli`, `tackle-prompt-bridge`,
  `mcp-registry-seeder`, `mcp-types`, `ui-tools`, `google`, `unsplash`,
  `shrapnel`, `utils` — utility/clients, minimal observable surface

**◻ candidate observations (chat's decomposition, per server):**
- *Discovery:* server discovered / server unavailable / tool list requested /
  tool list returned / tool metadata read
- *Invocation:* call received / arguments parsed / arguments validated /
  authorization checked / invocation dispatched / invocation started /
  invocation completed / invocation failed / invocation timed out / result
  serialized / result returned
- *Failure:* unknown tool / missing argument / invalid argument /
  unauthorized / dependency unavailable / transport failure / server
  exception
- *Lifecycle:* server started / stopped / registered / deregistered /
  configuration changed

---

## 27. ui-event-bus (the eventual consumption surface)

- Status 404, 400 — **◻ event published / delivered / dropped / subscriber
  error / unknown topic**
- No emitters measured yet — this is the sink, not the source.

---

## 28. bin/ operational scripts (103)

Operation inventory by port touched (from the crawl):
- **3101 nebula API** — 24 scripts (batch_*, reconcile_*, embed_*,
  pipeline-health-sweep, post-agent-record, check-inbox, ingest_history, …)
- **3102 MCP** — 16 scripts (batch_process_*, scan_*, peek_*, nlp_process_job)
- **11434 ollama** — 12 scripts (embed_*, qwen_extract, batch_embed, …)
- **5432 psql writes** — 9 scripts (regenerate_memory_seed, mesh-register,
  link_cross_references, backfill_*, …)
- **3410 harness** — 6 (tackle-projector, claim-extractor-harness,
  sysadmin-harness, start-nexus-services)
- **3107 assembly** — 6 (post-change-log, claim-extractor-harness,
  sysadmin-harness, pipeline-health-sweep)
- **3600 timeclock** — 3 (verify-session)
- **3100 conduit** — 3 (cascade-event-bridge, mesh-register)

Families and their observable operations:
- **Harvest/batch**: batch_harvest_to_db, batch_file_candidates,
  batch_publish_harvests, batch_process_* (ccnf/irl_ir/losm/nlp_output/
  semantic_ir/system_evolution), insert_*_harvest — **◻ harvest ingested /
  batch processed / NLP job run / publish ok/fail**
- **Health monitors**: mongodb-health-monitor, redis-health-monitor,
  dependency-monitor, sysadmin-outage-detect, mesh-status, heartbeat-sidecar
  — **◻ health check issued / passed / failed / timeout**
- **Ops**: start-nexus-services/uis, restart-stuck-uis, restart_peb,
  start-address-tts, verify-prepush, verify-session, check-inbox,
  post-inbox-update, post-change-log — **◻ service started / restarted /
  exited 1 (failure) / inbox checked / clocked in-out**
- **Reconcile/embed**: reconcile_agent_records, reconcile_completed,
  reconcile_embeddings, unified_semantic_search, embed_knowledge_entities
  — **◻ reconcile diff found / embedding regenerated / search executed**
- **Seed/maintenance**: regenerate_memory_seed (PSQLW=2), bootstrap_seed_manifest,
  mesh-register/reconcile, substance backfills, pipeline-health-sweep
  (POST=35 GET=5 — emits findings) — **◻ seed drift detected / mesh
  registered / sweep finding emitted**

**◻ candidate observations (script family):** script invoked · API call
returned ok / error / timeout · psql write succeeded / failed · exit 0 / exit 1
· service restarted · health check passed/failed · drift detected · seed
verify passed / drifted · inbox pointer advanced

---

## 29. Explicit gaps (things that happen, no table/emitter yet)

From the crawl, these systems have observable behavior but **no event
storage** measured:
- `tackle.agent_scheduler` — ticks, launches, skips (only session_logs/
  system_logs)
- `timeclock` — clock in/out/heartbeat/timeout (no event table)
- `nebula.agent_records` — created/updated (no event row, though
  *_history tables exist for some)
- `harness-srv` INTERACTIVE rejections (400) — no event
- `tackle.role_leases` lifecycle — no event table
- `registry.status_events` — table exists, no emitter measured
- `voyager.topology_signal` — signal table, publisher partial
- `execution` drift-kind detections — computed, not published
- `conduit` circuit breaker trips / pauses — no event
- `substance` segment expiry NOTIFY — consumed, not re-emitted

---

## 30. Reading guide — what v2 is *not*

- v2 does **not** decide which of these become bus events. That is stage 3
  (canonical event type) and stage 4 (should publish?) of the pipeline in the
  header.
- When that pass happens, the same occurrence may collapse into one event,
  and some occurrences will never be worth publishing. That's fine and
  expected — **the worthiness decision is deliberately deferred**.
- Notable decomposition debts owed (chat's examples) that the crawl confirms
  are needed before any "flap"/"drift" style events: registry health
  (issued/returned/timed out/failed → observed UP/DOWN → changed →
  thresholds), identity resolution (canonical/existing/derived/ambiguous/
  missing/conflicting), tool-server lifecycle (discovery/invocation/failure/
  lifecycle).

*Crawl artifacts: `/tmp/crawl-ast-core.txt` (572 lines), `/tmp/crawl-ast-services.txt`
(1587), `/tmp/crawl-ast-data.txt` (2365), `/tmp/crawl_ts.sh` / `crawl_ts2.sh` /
`crawl_ts3.sh` outputs, `/tmp/crawl_db.sh` / `crawl_db2.sh` outputs, `/tmp/crawl_bin.sh`
output. Full per-function detail for any module is in those files.*
