# docs/events — the event catalog

This directory is the versioned home of the **event catalog**: the pipeline
that turns "everything that happens" in nexus into a decided set of bus
events.

## The pipeline

```
observed occurrence → candidate event → canonical event type → should publish?
→ bus/topic → payload/schema
```

The docs below cover the pipeline in stages. Nothing is decided by reading one
doc alone — read them in order.

## Index

| Doc | Pipeline stage | What it is |
|---|---|---|
| **`events-inventory-v2-raw-observations.md`** | 1–2 | The raw observation inventory: everything that happens per system, crawled from implementations + live DB (raise branches, return shapes, routes, state machines, error conditions). ~30 systems. *Deliberately* no worthiness decisions. |
| **`stage3-canonical-event-types.md`** | 3–4 | Collapses raw occurrences into canonical event types with publish-worthiness, bus destination, and payload keys. Wave 1: the five gap systems (scheduler, timeclock, agent-records, harness-srv, role-lease dispenser). Wave 2: registry, voyager, execution drift-kinds, circuit-breaker, substance expiry. Wave 3: MCP tool-server family, WRP core (identity/address/state-DAG/kernel/arbitration). |

## Conventions (from the stage-3 doc)

- Event type naming: dotted lowercase `domain.entity.verb_past_tense`
  (`harvest.captured`, `harness.started`, `wr.submitted`, `lease.exhausted`)
- NATS subject: `nexus.<domain>.v1.<event_type>`
- Envelope: the `cascade.events` column set (event_id, event_type,
  event_timestamp, source, payload, aggregate_type/id, actor, correlation,
  causation, sequence)
- Default bus: `cascade.events` (generic aggregate support)

## Related

- Discussion thread: **"Events, what goes on the bus?"** in the Discussions
  forum (thread framing + per-system v1 comment set + v2 framing comment +
  stage-3 comments).
- Measured existing vocabulary: `cascade.events` (21 types), `wind.events`
  (7), `peb.governance_events` (12), `conduit.work_request_events` (19) —
  see the v2 inventory §1.
