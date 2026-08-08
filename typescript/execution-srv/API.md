# execution-srv — Execution Observability API

> Port: **3110**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Read-only API over the execution schema: requests, leases, attempts, receipts, integrity scans, and cross-schema lineage.

**15 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/execution/attempts` |  |
| GET | `/api/execution/health` |  |
| GET | `/api/execution/health/by-executor` | 5. FLEET VIEW GET /api/execution/health/by-executor?executor_id= What is this executor currently holding / running. Returns active leases + their in-progress attempts + a summary counter for the executor. |
| GET | `/api/execution/health/integrity-scan` |  |
| GET | `/api/execution/health/status-distribution` | GET /api/execution/health/status-distribution Count of requests per status, leases per status, attempts per status — the drift-over-time signal. One call returns everything for snapshotting. |
| GET | `/api/execution/leases` |  |
| GET | `/api/execution/leases/:id/lifecycle` | GET /api/execution/leases/{id}/lifecycle acquired_at → expires_at → released_at, actual vs promised. Computes how long the lease was actually held (or how long it's been held so far if still ACTIVE), and how that compares to the promised TTL. |
| GET | `/api/execution/leases/stale` | 2. LEASE INTEGRITY — the expiry gap, made visible GET /api/execution/leases/stale Active leases whose expires_at < now() — the enforcement gap made queryable. Returns each stale lease joined to its request so callers see the executor that is holding dead ground. |
| GET | `/api/execution/receipts` |  |
| GET | `/api/execution/receipts/:id/pipeline-origin` |  |
| GET | `/api/execution/requests` |  |
| GET | `/api/execution/requests/:id/attempts` | 4. ATTEMPT/LEASE/REQUEST TREE GET /api/execution/requests/{id}/attempts Every attempt for this request, each attempt's lease, chronological. |
| GET | `/api/execution/requests/:id/receipts/lineage` | GET /api/execution/requests/{id}/receipts/lineage Split by lineage_source: native vs backfilled vs unknown. |
| GET | `/api/execution/requests/:id/state` |  |
| GET | `/health` | Health Check Two-level health: process-up + DB-reachable. The integrity-scan endpoint (/api/execution/health/integrity-scan) is the deeper check. |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
