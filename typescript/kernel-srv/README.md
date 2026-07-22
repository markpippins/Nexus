# kernel-srv

Express REST API for the **PostgreSQL Semantic Kernel** — thin wrappers over the
`kernel.sys_transition()` write surface, `kernel.sys_issue_receipt()` receipt
issuer, and the read-only `kernel.v_*` views. Listens to the
`kernel_transition_committed` `pg_notify` channel and forwards events over
Server-Sent Events (SSE).

Port: **8100** (chosen so it slots in next to peb-kernel on 8080 and atlas on 8090).

## Endpoints

All endpoints are mounted under `/api/kernel`.

| Method | Path | Wraps |
|--------|------|-------|
| POST   | `/api/kernel/transitions` | `kernel.sys_transition()` |
| GET    | `/api/kernel/transitions/:event_id` | direct row read on `kernel.transition_event` |
| GET    | `/api/kernel/transitions/:event_id/causality` | `kernel.v_causality_chain` (scoped to event_id via `path @> [event_id]`) |
| POST   | `/api/kernel/receipts` | `kernel.sys_issue_receipt()` |
| GET    | `/api/kernel/receipts/:id/chain` | `kernel.v_receipt_chain` (scoped to the receipt's event_id) |
| GET    | `/api/kernel/plans/:plan_number/receipts` | `kernel.v_plan_receipts` |
| GET    | `/api/kernel/aggregates/:aggregate_type/:aggregate_id/events` | `kernel.v_aggregate_events` |
| GET    | `/api/kernel/policy/active` | `kernel.v_active_policy` |
| GET    | `/api/kernel/policy/maturity` | `kernel.v_policy_maturity` (the compiled-vs-data-driven ratio) |
| GET    | `/api/kernel/health/recent-events?limit=N` | `kernel.v_recent_events` (propagation lag included) |
| GET    | `/api/kernel/health/receipt-integrity` | ad-hoc orphan check — receipts whose `event_id` has no back-link on `transition_event.receipt` |
| GET    | `/api/kernel/events/stream` (SSE) | `pg_notify` `kernel_transition_committed` forwarded as `event: kernel_event` |

Both `/health` and `/api/health` return `{status, db, pgNotify, subscribers}` —
useful for checking whether the LISTEN bridge is alive and how many SSE clients
are connected.

## Local development

```sh
npm install     # express + pg + typescript
npm run dev     # tsx watch src/index.ts — live reload
npm run build   # tsc → dist/
npm start       # node dist/index.js
```

## Systemd

The shipped `kernel-srv.service` unit follows the same convention as
`nebula-srv.service` — `ExecStart=/home/codex/.nvm/versions/node/v24.15.0/bin/node dist/index.js`,
`Restart=on-failure`, logs to journal. Install it with:

```sh
cp /home/codex/dev/nexus/typescript/kernel-srv/kernel-srv.service \
   ~/.config/systemd/user/kernel-srv.service
systemctl --user daemon-reload
systemctl --user start kernel-srv.service
```

The service is also registered in `nexus/bin/start-nexus-services.sh`,
so `start-nexus-services.sh status` will pick it up automatically once the
unit file is installed.

## Design notes

The forum analysis thread "Kernel Database Analysis" notes that the kernel
schema already does most of the work as views (v_causality_chain,
v_receipt_chain, v_plan_receipts, v_aggregate_events, v_event_analytics,
v_active_policy, v_policy_maturity, v_recent_events). This API is a thin
wrapper — no new design, no caches to maintain.

The SSE stream re-uses the same `kernel_transition_committed` pg_notify channel
that conduit already listens to. Adding more listeners does not affect kernel
write throughput — `LISTEN` is multiplexed per-session. The unified
observability layer should be one subscriber listening across all pg_notify
channels (PEB, Vision, Conduit, kernel), not four separate polling loops.
