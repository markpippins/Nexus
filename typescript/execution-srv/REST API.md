schema: nexus/execution Observability API

1. Lifecycle state (per request — the natural aggregate root)

GET /api/execution/requests/{id}/state

Returns the request plus its current lease (if any) plus its latest attempt plus its receipts — a single "where does this stand right now" view, since that currently requires four joins nobody's written yet.

2. Lease integrity (the expiry gap, made visible)

GET /api/execution/leases/stale                  # ACTIVE + expires_at < now(), the enforcement gap made queryable
GET /api/execution/leases/{id}/lifecycle           # acquired_at → expires_at → released_at, actual vs. promised

3. Cross-table consistency scan (generalizing check_receipt_integrity)

GET /api/execution/health/integrity-scan

Same shape as Vision's function — a named, growing list of specific pathologies (orphan_lease_request_mismatch, stale_active_lease, attempt_status_diverges_from_request, etc.), each one a query you write the day you find the gap, not a generic health score.

4. Attempt/lease/request tree

GET /api/execution/requests/{id}/attempts        # every attempt, each attempt's lease, chronological
GET /api/execution/requests/{id}/receipts/lineage # split by lineage_source: native vs backfilled vs unknown

5. Fleet view

GET /api/execution/health/by-executor?executor_id=   # what's this executor currently holding/running
GET /api/execution/health/status-distribution         # count of requests per status, leases per status — drift-over-time signal

Update: GET /api/execution/receipts/{id}/pipeline-origin follows lineage_original_id → vision.receipts.id and returns both records side by side, explicitly labeled by which audit trail each came from. That's a cleaner and more honest endpoint than what I'd sketched before, because it doesn't pretend there's one canonical receipt — it shows the seam.
