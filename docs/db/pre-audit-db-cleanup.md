# Pre-Audit Database Cleanup — Work Package (To Do)

**Status:** Decided — all D1–D5 rulings recorded 2026-08-13. Ready for execution (Luna). DB writes require explicit user confirmation per R9; execute in reviewable chunks.
**Source records:** `5f578a68` (DBA audit re-check), `51199fe3` (open_questions drift), `bcdaa333` (work package). Audit doc: `dba-audit-2026-07-22.md`.

## Recorded rulings (user, 2026-08-13)

- **Canonical event bus = Cascade (`cascade.events`).** NATS is replaceable downstream infrastructure, not a protocol we conform to. pg_notify is eliminated — **but only after each consumer is migrated and verified.**
- **Migration bar (mandatory):** no consumer counts as migrated merely because polling code exists. It must demonstrate **equivalent delivery, deduplication, replay behavior, and acceptable latency** against cascade.events **before** its pg_notify dependency is removed.
- **D1 — NATS posture: KEEP as downstream fan-out.** `event → cascade.events → NATS fan-out → consumers` (not `event → pg_notify → NATS`). W1.4 migrates the *source* of events; it does not eliminate NATS.
- **D2 — 495 orphan resolutions: mark content-lost.** Preserve the records; explicitly represent the epistemic state (resolution existed; source content no longer recoverable). Do not manufacture answer text. Thread recovery = separate opportunistic effort.
- **D3 — six other `as_of_*` tables: document + opportunistic sweep.** Record the inconsistency, establish the intended temporal convention (`recorded_on_dt`/`recorded_until_dt`), fix each when its surface is touched. Not another migration campaign.
- **D4 — drop `open_question_entities`: approved.** (134 rows, 100% duplicated in direct columns — verified zero net data loss.)
- **D5 — unify enqueue writers now; single API later.** Establish one enqueue contract without turning it into a grand abstraction.

---

## W1 — Event Delivery Migration (pg_notify → Cascade)

### W1.0 Current-state inventory (verified live 2026-08-13)

**pg_notify functions (9, across 7 schemas):**

| Function | Channel | Consumer status |
|---|---|---|
| `nebula.notify_open_question_event` | open_question_resolved | obs_subscriber.py (RUNNING, bare process) |
| `nebula.record_answer` | open_question_answered | obs_subscriber.py (RUNNING) |
| `peb.notify_governance_event` | peb_governance_event_created | obs_subscriber.py (RUNNING) — peb-srv itself polls, does NOT LISTEN |
| `vision.lifecycle_events_insert_trigger` | vision_lifecycle_event_created | obs_subscriber.py (RUNNING) |
| `kernel.trg_notify_transition` | kernel_transition_committed | kernel_subscriber.py (RUNNING) + kernel-srv/src/notify.ts (SSE, LIVE) |
| `wind.trg_bridge_conduit_events` | wind_event_bridge | wind-srv pg-notify-listener.js (wind-srv RUNNING) |
| `duality.notify_comment_created` (fn behind `trg_comment_created` on `assembly.comments`, V095) | **`kernel_transition`** (channel squat!) | interactive_turn_subscriber.py — **LIVE direct PG LISTEN path** (bypasses NATS bridge), plus NATS `nexus.duality.v1.conversation.>`; dedup via `_seen`. Conformance test asserts trigger exists (`test_conformance_freebuff_nats.py:447`) → test must be updated at conversion |
| `nebula.notify_segment_expired` | segment_expired | python/substance/listener.py (RUNNING, cache invalidation; Redis TTL bounds staleness) |
| `public.notify_member_expired` | **`segment_expired`** (member-expiry → segment-expired conversion) | **second producer** of segment.expired, same channel — feeds substance listener (RUNNING) |

**LISTEN consumers in code:** obs_subscriber.py (4 channels), kernel_subscriber.py, kernel-srv/src/notify.ts, substance/listener.py, wind-srv/src/pg-notify-listener.js. Note: audit said "subscribers inactive" — **stale**: obs/kernel/interactive_turn subscribers run as bare processes (PID-verified), not systemd. The live-process discovery makes the per-consumer migration bar mandatory.

**cascade.events — canonical store:** 17,266 rows, ~185/24h. Writers: `python/cascade/event_store.py` (append_event), `typescript/harness-srv/src/db.ts` (`emitEvent`), `python/rover/event_emitter.py`, wind bridge triggers (`bridge_instance_to_cascade`, `bridge_ticket_to_cascade`). Consumer: `cascade-pg-bridge.py` polls → Redis `cascade-events` → SSE. Replay machinery exists: `python/cascade/offset.json` (last_timestamp + processed_ids dedup).

**NATS consumers (read subjects):** interactive_turn_subscriber.py (kernel/duality/assembly subjects), wind-srv nats-listener.js (`nexus.wind.v1.events.>`), assembly_subscriber, assessment_subscriber, admission_subscriber, inference_subscriber, freebuff_turn_bridge/consumer, conversation_coordinator, projection_updater, coordinator. These continue to consume NATS (D1); only the *source* of NATS publications moves to cascade.events.

### W1.1 Convert DB notify functions → cascade.events enqueue

Replace `pg_notify(channel, json)` with enqueue into `cascade.events` (canonical INSERT shape — W1.3). Event_type mapping (keeps NATS subject mapping compatible downstream):

- `nebula.notify_open_question_event` → `question.resolved`
- `nebula.record_answer` → `question.answered`
- `peb.notify_governance_event` → `peb.governance.created`
- `vision.lifecycle_events_insert_trigger` → `vision.lifecycle.created`
- `kernel.trg_notify_transition` → `kernel.transition.committed`
- `wind.trg_bridge_conduit_events` → keep WR_* bridge semantics; enqueue instead of NOTIFY
- `nebula.notify_segment_expired` → `segment.expired`
- `duality.notify_comment_created` (behind `trg_comment_created` on `assembly.comments`) → `assembly.comment.created` (matches payload `event_type` already emitted) — **un-squats `kernel_transition`**. Update conformance test `test_conformance_freebuff_nats.py:447` (asserts trigger exists) and `:7` (asserts pg_notify path) when converting.
- `public.notify_member_expired` → **`segment.expired`** (same event type as `nebula.notify_segment_expired`; payload carries `reason: 'member_expired'`, `segment_id`, `segment_set_ids`). It is a second producer, not dead — convert, do not drop.

### W1.2 Convert LISTEN consumers → cascade.events consumption

Pattern: offset-based polling of cascade.events (offset.json + processed_ids) or Redis `cascade-events` channel (cascade-pg-bridge, 5s). Per consumer:

- `obs_subscriber.py` — stop LISTEN; poll cascade.events from offset; keep publishing to NATS subjects unchanged (`nexus.peb.v1.*`, `nexus.vision.v1.*`, `nexus.open_questions.v1.*`).
- `kernel_subscriber.py` — same for kernel transitions.
- `kernel-srv/src/notify.ts` (SSE) — poll cascade.events (or Redis channel) instead of LISTEN.
- `substance/listener.py` — poll cascade.events for `segment.expired`; latency push → ≤5s poll; acceptable (Redis TTL bounds staleness; document). Note two producers collapse into one event type (`nebula.notify_segment_expired` + `public.notify_member_expired`) — no consumer change needed for the second.
- `interactive_turn_subscriber.py` — **remove the PG LISTEN path** (`LISTEN kernel_transition`, `poll_pg_notifications`, lines ~941/982–1013); keep the NATS `nexus.duality.v1.conversation.>` path and the existing `_seen` dedup (already protects both paths). Un-squats `kernel_transition` channel.
- `wind-srv/src/pg-notify-listener.js` — delete; wind-srv consumes cascade.events then publishes to NATS for real-time subscribers (keep `publishToNats`).

### W1.3 Enqueue contract (D5 — unify now, single API later)

One canonical INSERT shape: `(event_id, event_type, source, event_timestamp, payload, aggregate_type, aggregate_id, actor_type, actor_id, causation_id, caused_by_event_type)`. Reference writer: `harness-srv/src/db.ts` `emitEvent` (complete incl. causality). Align `python/cascade/event_store.py` `append_event` + wind bridge triggers to the same contract; verify causality fields populated. Do **not** build a shared library/abstraction yet — align the existing writers to one contract and leave the single-API step for when it earns its keep.

### W1.4 NATS posture (D1 — keep as downstream fan-out)

- Flow becomes `event → cascade.events → NATS fan-out → consumers`. NATS publications originate **only** from cascade.events (nats_publisher.py sidecar; wind-srv publishToNats). No NATS publish from pg_notify.
- **Drop `cascade.nats_publish_log`** (0 rows, zero writers).
- **Update `bin/start-nexus-services.sh`** — remove `cascade-kernel-subscriber.service` and `cascade-obs-subscriber.service` entries (bare processes today; units inactive/nonexistent).
- Update `python/cascade/NATS_INTEGRATION_PLAN.md` → cascade.events canonical, NATS optional fan-out.

### W1.5 Migration bar — per-consumer verification gate (mandatory)

For **each** consumer (obs_subscriber, kernel_subscriber, kernel-srv notify.ts, substance listener, wind-srv pg-notify-listener):

1. Polling/consumption code against cascade.events lands (offset-based or Redis channel).
2. **Equivalent delivery:** fire the source event end‑to‑end → row in cascade.events → consumer acts with the same effect as today's pg_notify path.
3. **Dedup:** replay the same event_id → no double‑processing (processed_ids/event_id dedup verified).
4. **Replay:** consumer with a stale offset catches up from offset.json/processed state, processing missed events in order.
5. **Latency:** measured end‑to‑end vs today's push path; record per‑consumer budget (target ≤ poll interval + processing).
6. **Only then** remove the consumer's pg_notify LISTEN and the upstream function's pg_notify.
7. Final gate (after all consumers): zero `pg_notify` in `pg_proc` (all schemas); no `LISTEN` statements in code; verify via sentinel test (start a dummy PG session with `LISTEN` on each former channel, fire a source event, confirm nothing arrives); **no `pg_notify` generation** (behavioral test after all conversions).
8. Conduit WRP flow intact without pg_notify: runtime receipt → wind.events → cascade.events → NATS consumers.

---

## W2 — Open Question Integrity (open_questions drift)

From record `51199fe3`. Data: 852 questions; **0 FKs; 0 indexes.**

- **W2.1 Retire `open_question_entities` (D4 approved).** 134 rows, 100% duplicated in direct columns — zero net data loss. Remove writes (`routes.ts:7367`) + reads (`routes.ts:7245`), then drop table.
- **W2.2 Answer-store direction: `open_question_answers_history` is canonical.**
  - Backfill the **495 questions flagged answered with no answer row** per D2: create rows with role = answered_by, answered_at, and an explicit content-lost marker (metadata `content_lost: true` or equivalent) — preserve the record, represent the epistemic state, **do not manufacture answer text**.
  - Sync the 5 answers rows whose question isn't flagged (set the question's answered flag from the answer row).
  - Keep `open_questions.answered_by/answered_at` as a trigger-maintained latest-pointer; document (drop in a later migration).
  - Thread recovery = separate opportunistic effort (not part of this package).
- **W2.3 Temporal naming (D3).** Rename `as_of_dt → recorded_on_dt`, `expiration_dt → recorded_until_dt` on `open_question_answers` + `open_question_answers_history` (we are touching them; view auto-tracks). **Establish the convention** in a schema-convention note: `recorded_on_dt`/`recorded_until_dt` is the system temporal convention. The other 6 (`conversation_blocks_history`, `conversation_snapshots_history`, `harvest_references_history`, `projection_overrides_history`, `segments_history`) are documented as known deviations, fixed when their surfaces are touched — not swept now.
- **W2.4 Hardening.** Add FK `requirement_id → requirements` (promised in migration 035, never added), FK `candidate_id → harvest_candidates`, indexes on `(status)`, `(requirement_id)`, `(candidate_id)`.

---

## W3 — Database Hygiene & Audit Closure

From record `5f578a68`:

- **W3.1 DRIFT #2:** 75 unattached trigger functions in `nebula`/`vision`. Triage: categorize (SCD-4 residue vs orphaned), then drop or `COMMENT ON FUNCTION` + documentation. (Audit explicitly asked.)
- **W3.2 Nebula migration ledger:** verify nebula-srv migration tracking (conduit `schema_version` v37, tackle and public have ledgers; `knowledge.graph_migrations` exists — verify coverage). If untracked, add a ledger so the next audit can drift-check like conduit.
- **W3.3 Exercise an active execution lease** (OBS #4): create → renew → let TTL expire → verify enforcement. Coordinate with T20 lease-guard work.
- **W3.4 Repo housekeeping:** `docs/dba-audit-2026-07-22.md` shows deleted in git while `docs/db/` holds the file — `git mv` to match intent.
- **W3.5 Audit closure:** re-run the 07-22 audit checklist end-to-end (6 resolved + 4 open items) — expect all green. Post change-log summary; hand the DBA records `5f578a68`, `51199fe3`, `bcdaa333` + completion record.

---

## Cross-cutting rules

- **No DB write without explicit user confirmation** (R9). Execution in reviewable chunks.
- All migrations versioned + ledgered in the owning service's migrations dir.
- Update agent records after each phase; completion record at end.

## Resolved decisions

| # | Decision | Ruling (2026-08-13) |
|---|---|---|
| D1 | NATS posture | **KEEP** as downstream fan-out, fed only from cascade.events |
| D2 | 495 orphan resolutions | mark content-lost; preserve records; no manufactured content |
| D3 | 6 other `as_of_*` tables | document + opportunistic sweep (not a campaign) |
| D4 | drop `open_question_entities` | approved (134 rows, 0 net data loss) |
| D5 | enqueue writers | unify contract now; single API later |
