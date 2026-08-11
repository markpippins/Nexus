# Events — Stage 3: Canonical Event Types (five gap systems)

> **Pipeline position:** v2 inventory (`events-inventory-v2-raw-observations.md`)
> cataloged raw occurrences (stages 1–2). This doc is **stage 3** for the first
> wave: collapse occurrences into canonical event types and decide
> publish-worthiness + destination (stage 4), per system. Worthiness is still a
> recommendation, not an implementation order.
>
> **Scope of this wave:** the five gap systems — things that happen today with
> no event storage:
> 1. `tackle.agent_scheduler` (scheduler ticks/launches/skips)
> 2. `timeclock` (`tackle.agent_timeclock`)
> 3. `nebula.agent_records`
> 4. `harness-srv` (run lifecycle, INTERACTIVE guard, watchdog)
> 5. `tackle.role_leases` (role-lease dispenser, nebula-srv routes)

## Conventions

**Event type naming** — dotted lowercase `domain.entity.verb_past_tense`,
matching the measured vocabulary: `harvest.captured`, `candidate.discovered`,
`harness.started`, `wr.submitted`, `intent_record.created`.

**NATS subject** — `nexus.<domain>.v1.<event_type>` (matches existing:
`nexus.kernel.v1.transition.*`, `nexus.fs.v1.*`, cascade fallback
`nexus.cascade.v1.*`).

**Envelope** — reuse the `cascade.events` column set as the canonical envelope:

```
event_id (uuid) · event_type · event_timestamp · source · payload (jsonb)
aggregate_type · aggregate_id · actor_type · actor_id
correlation_id · causation_id · caused_by_event_type · sequence_number
```

**Bus destination** — `cascade.events` is the generic workflow bus (its
aggregate_type/aggregate_id columns are generic, so non-WR aggregates fit).

---

## 1. tackle.agent_scheduler → cascade.events (subject `nexus.tackle.v1.scheduler.*`)

Table: `tackle.agent_scheduler` (role, task_slug, schedule_type
interval|cron|manual|event, cron_expr, event_criteria jsonb, enabled,
last_run_at, last_run_status).

| # | Raw occurrence (v2 §9) | Canonical event type | Publish? | Payload keys |
|---|---|---|---|---|
| 1 | Tick cycle evaluated (`evaluate_tick` → summary) | `scheduler.tick` | **No** (too hot; fold into outcomes) | n/a |
| 2 | Entry became due (cron match / interval elapsed / event-criteria match) | `scheduler.entry.due` | **Yes** | entry {id, role, task_slug, schedule_type, cron_expr / interval / event_criteria}, event_ids (for type=event) |
| 3 | Agent launched → `{status:'launched', pid}` | `scheduler.agent.launched` | **Yes** | entry, pid, model_id, harness |
| 4 | Launch failed (binary not found / exception) | `scheduler.agent.launch_failed` | **Yes** | entry, error |
| 5 | Skip — role is INTERACTIVE-hosted (harn/freebuff guard) | `scheduler.skip.interactive_hosted` | **Yes** | entry, role |
| 6 | Skip — no eligible work for role | `scheduler.skip.no_work` | **Yes** | entry, role |
| 7 | Skip — pipeline empty (no enabled entries) | `scheduler.skip.empty_pipeline` | **Yes** | count |
| 8 | Event-scheduled entry consumed matching events | `scheduler.event.consumed` | No (fold into #2) | event_ids |
| 9 | Cron expression unparseable (ValueError) | `scheduler.cron.invalid` | **Yes** (error/config drift) | entry, cron_expr, error |

Aggregate: `aggregate_type='agent_scheduler_entry'`, `aggregate_id=entry.id`.
Notes: #5–#7 are the shadow-mode guard outcomes (emptiness check + interactive
skip) that wr-conf work already exercised — these are the observability win.
#4/#9 are the error surface.

---

## 2. timeclock → cascade.events (subject `nexus.timeclock.v1.*`)

Table: `tackle.agent_timeclock` (role, model, session_id, clock_in, clock_out,
status, valid_from/until).

| # | Raw occurrence (v2 §17) | Canonical event type | Publish? | Payload keys |
|---|---|---|---|---|
| 1 | Clock-in success (`clock_in` route) | `timeclock.clocked_in` | **Yes** (R13 compliance/audit) | role, model, session_id, clock_in |
| 2 | Clock-out success | `timeclock.clocked_out` | **Yes** | role, model, session_id, clock_out, duration_s |
| 3 | Heartbeat success | `timeclock.heartbeat` | No by default (suppressible) | role, model, session_id |
| 4 | Session timed out by cleanup (`timeout_cleanup` → rowcount) | `timeclock.session.timed_out` | **Yes** | role, model, session_id, timeout_minutes |
| 5 | Clock-out / heartbeat for unknown session (HTTPException) | `timeclock.session.unknown` | **Yes** (error) | role, model, session_id?, error |

Aggregate: `aggregate_type='timeclock_session'`, `aggregate_id=session_id`.
Notes: #1/#2 are the natural evidence for R13 (clock in/out governance).

---

## 3. nebula.agent_records → cascade.events (subject `nexus.nebula.v1.agent_record.*`)

Table: `nebula.agent_records` (+ `_history` projection; record_type CHECK:
report, analysis, assessment, inspection, prompt, response, engineering_log,
architecture_note, decision).

| # | Raw occurrence (v2 §12) | Canonical event type | Publish? | Payload keys |
|---|---|---|---|---|
| 1 | Agent record created | `nebula.agent_record.created` | **Yes** — the routing/inbox signal | record_id, recordType, role, level, visibilityScope, tags, plan_ref |
| 2 | Agent record updated | `nebula.agent_record.updated` | **Yes** (lower volume) | record_id, changed fields |
| 3 | Record rejected — invalid recordType/level (400) | `nebula.agent_record.rejected` | **Yes** (error) | role, reason |

Aggregate: `aggregate_type='agent_record'`, `aggregate_id=record_id`.
Notes: #1 is the event that can drive cross-role notification (e.g. watchdog
hearing `to:watchdog` findings without polling) — the inbox stays the durable
query surface, this becomes the push signal.

---

## 4. harness-srv → cascade.events (subject `nexus.harness.v1.run.*`)

Channel already wired: harness-srv writes `cascade.events` directly; the
vocabulary `harness.started|failed|completed` already exists (measured).

| # | Raw occurrence (v2 §10) | Canonical event type | Publish? | Payload keys |
|---|---|---|---|---|
| 1 | `/run` accepted, spawn started (child PID tracked) | `harness.run.started` | **Yes** (exists — keep) | session_id, bundle_id, pid, role |
| 2 | Run completed (+ governance receipt) | `harness.run.completed` | **Yes** (exists — keep) | session_id, receipt, summary |
| 3 | Run failed | `harness.run.failed` | **Yes** (exists — keep) | session_id, error |
| 4 | **`/run` refused 400 — INTERACTIVE guard** (interactive bundle with lease / unbounded consumer) | `harness.run.refused` | **Yes — NEW (the gap)** | session_id, bundle_id, role, reason (interactive_with_lease | unbounded_consumer) |
| 5 | **Watchdog triggered → SIGTERM kill + unload + record** | `harness.run.watchdog_killed` | **Yes — NEW (the gap)** | session_id, pid, timeout_ms, exit_signal |
| 6 | Session ended | `harness.session.ended` | Yes | session_id, duration_s |
| 7 | `/resolve-context` served | `harness.context.resolved` | No (mechanical) | session_id |
| 8 | `/run` requested (raw) | `harness.run.requested` | No (redundant with started) | n/a |

Aggregate: `aggregate_type='harness_run'`, `aggregate_id=session_id`.
Notes: #4 and #5 are the two events wr-conf-003/004/005 guard but no channel
records today. #1–#3 must be emitted by the spawn path (not just the
execFileAsync legacy path).

---

## 5. tackle.role_leases (dispenser) → cascade.events (subject `nexus.tackle.v1.lease.*`)

Dispenser API (nebula-srv routes.ts): `POST /api/role-leases/issue`,
`POST /api/role-leases/:id/renew`, `POST /api/role-leases/:id/revoke`,
`POST /api/role-leases/consume`, `GET /api/role-leases?role=`,
`GET /api/role-leases/stale`.
Table: `tackle.role_leases` (role, **channel** [freebuff | execution_worker |
harness/wind], model, window_start/end, budget_units, consumed_units, status
ACTIVE|EXPIRED|RELEASED, acquired_at, expires_at, released_at).

| # | Raw occurrence (v2 §9/§11 + dispenser) | Canonical event type | Publish? | Payload keys |
|---|---|---|---|---|
| 1 | Lease issued | `lease.issued` | **Yes** | lease_id, role, channel, model, budget_units, window_start/end |
| 2 | Lease renewed (window + budget) | `lease.renewed` | Yes | lease_id, new window, new budget |
| 3 | Lease revoked (explicit) | `lease.revoked` | **Yes** | lease_id, role, reason |
| 4 | **Consume — `consumed_units += 1` (work.completed → lease accounting)** | `lease.consumed` | **Yes — the canonical accounting event** | lease_id, role, channel, consumed_units, remaining, work_ref (session/work unit id) |
| 5 | Window expired (expiry sweep) | `lease.expired` | **Yes** | lease_id, role, channel |
| 6 | **Budget exhausted (consumed ≥ budget → STOP + surface)** | `lease.exhausted` | **Yes — the STOP signal** | lease_id, role, consumed_units, budget_units |
| 7 | Stale lease detected (past window, still ACTIVE — sweep check #5) | `lease.stale` | **Yes** | lease_id, role, channel, window_end |
| 8 | Consume denied (no active lease / wrong channel) | `lease.consume_denied` | **Yes** (error) | lease_id?, role, reason |

Aggregate: `aggregate_type='role_lease'`, `aggregate_id=lease_id`.
Notes: #4 is the event the whole accounting discussion pointed at — one
canonical `work.completed → lease accounting` event regardless of which
execution channel (execution_worker / harness-wind / interactive) produced the
completion. #6 is the budget-exhaustion → STOP + surface-to-operator hook. #7
feeds the pipeline-health-sweep drift signal.

---

## Next wave (same method, not yet collapsed)

From v2 §29 and the full inventory, still to run through this pass:
`registry.status_events` (table, no emitter) · `voyager.topology_signal` ·
execution drift-kinds (8 constants, half-cooked) · conduit circuit-breaker
trips/pauses · substance segment expiry · the MCP tool-server family
discovery/invocation/failure/lifecycle decomposition · WRP core (identity
resolution outcomes, address parse, state-DAG mutations) · the bin/ script
operation surface.

**Decision rule carried forward:** collapse first, judge second. An occurrence
becomes a canonical type if it (a) is observable by at least one other system,
(b) is a terminal outcome (completed/failed/refused/exhausted) or a
cross-cutting transition, or (c) is an error condition. Pure mechanics
(heartbeats, ticks, raw requests) default to no-publish unless a consumer
demands them.
