# kernel-srv — Event-Sourced Kernel API

> Port: **8100**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Kernel event model: transition lifecycle, receipts, causality chains, aggregate event streams, active policy, and health views.

**14 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` |  |
| GET | `/api/kernel/aggregates/:aggregate_type/:aggregate_id/events` | 7. GET /api/kernel/aggregates/{type}/{id}/events wraps v_aggregate_events |
| GET | `/api/kernel/events/stream` | 12. SSE /api/kernel/events/stream live kernel events |
| GET | `/api/kernel/health/receipt-integrity` | 11. GET /api/kernel/health/receipt-integrity orphan-check Receipts with no matching transition_event.receipt_id back-link. Per the thread analysis, this measures the "sole write surface" invariant: every receipt should have a back-link on its event. |
| GET | `/api/kernel/health/recent-events` | 10. GET /api/kernel/health/recent-events wraps v_recent_events |
| GET | `/api/kernel/plans/:plan_number/receipts` | 6. GET /api/kernel/plans/{plan_number}/receipts wraps v_plan_receipts |
| GET | `/api/kernel/policy/active` | 8. GET /api/kernel/policy/active wraps v_active_policy |
| GET | `/api/kernel/policy/maturity` | 9. GET /api/kernel/policy/maturity (compiled-vs-data-driven ratio) |
| POST | `/api/kernel/receipts` | 4. POST /api/kernel/receipts wraps sys_issue_receipt() |
| GET | `/api/kernel/receipts/:id/chain` | 5. GET /api/kernel/receipts/{id}/chain wraps v_receipt_chain |
| POST | `/api/kernel/transitions` | 1. POST /api/kernel/transitions wraps sys_transition() |
| GET | `/api/kernel/transitions/:event_id` | 2. GET /api/kernel/transitions/{event_id} |
| GET | `/api/kernel/transitions/:event_id/causality` | 3. GET /api/kernel/transitions/{event_id}/causality (v_causality_chain scoped) |
| GET | `/health` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
