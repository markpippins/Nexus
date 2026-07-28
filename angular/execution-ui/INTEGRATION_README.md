# Execution Observatory — Live Integration & Deployment Guide

This document outlines how to convert this Observability IDE Component from mock mode to a live deployment against an active `execution-srv` Express instance and PostgreSQL database.

---

## 1. Overview & Architecture

`execution-srv` provides a read-only observability layer over the `execution` database schema.

```
+-------------------------------------------------------------+
|               Observability UI (IDE Component)              |
+-------------------------------------------------------------+
                              |
                              | HTTP REST Requests
                              v
+-------------------------------------------------------------+
|              execution-srv (Express, Port 3110/3000)        |
+-------------------------------------------------------------+
                              |
                              | pg.Pool (search_path=execution)
                              v
+-------------------------------------------------------------+
|               PostgreSQL Database ("nexus")                  |
|   Schemas: `execution` (write by conduit-mcp), `vision`      |
+-------------------------------------------------------------+
```

---

## 2. Environment Configuration

Set the following environment variables when launching `execution-srv` in production:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3110` | HTTP port for the observability service |
| `PGHOST` | `localhost` | PostgreSQL host address |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGUSER` | `pguser` | PostgreSQL user credentials |
| `PGPASSWORD` | `pgpass` | PostgreSQL password |
| `PGDATABASE` | `nexus` | Target database containing `execution` & `vision` schemas |

---

## 3. Database Table Dependencies

Ensure the target PostgreSQL database has the required tables in `execution` and `vision` schemas:

1. `execution.requests`
   - `id` (text, PK)
   - `status` (`PENDING`, `READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`)
   - `executor_id` (text)
   - `payload` (jsonb)
   - `created_at` / `updated_at` (timestamptz)

2. `execution.leases`
   - `id` (text, PK)
   - `request_id` (text, FK -> `execution.requests.id`)
   - `executor_id` (text)
   - `status` (`ACTIVE`, `RELEASED`, `EXPIRED`)
   - `acquired_at` / `expires_at` / `released_at` (timestamptz)
   - `promised_ttl_seconds` (int)

3. `execution.attempts`
   - `id` (text, PK)
   - `request_id` (text)
   - `lease_id` (text)
   - `status` (`CREATED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`)
   - `executor_id` (text)
   - `attempt_number` (int)
   - `started_at` / `finished_at` (timestamptz)
   - `error_message` (text)

4. `execution.receipts`
   - `id` (text, PK)
   - `request_id` (text)
   - `attempt_id` (text)
   - `lease_id` (text)
   - `event_type` (`LEASE_ACQUIRED`, `EXECUTION_START`, `CHECKPOINT`, `EXECUTION_COMPLETE`, `EXECUTION_FAILED`, `LEASE_RELEASED`)
   - `lineage_source` (text) — e.g., `'vision.receipts'`
   - `lineage_original_id` (text) — original PK in `vision.receipts`
   - `created_at` (timestamptz)

5. `vision.receipts`
   - Cross-schema table queried by the `GET /api/execution/receipts/{id}/pipeline-origin` endpoint for lineage comparison.

---

## 4. UI Toggle: Mock Mode vs Live API Mode

In the top addressbar of the IDE component:
1. Click on the **API Mode Toggle** switch or open **Settings** (`⌘,` or `Ctrl+,`).
2. Set **Data Provider Mode** to **Live Backend**.
3. Set **Base URL** to your endpoint (e.g., `http://localhost:3110/api/execution` or relative `/api/execution`).
4. The client will immediately query live endpoints. If the backend is unreachable, it seamlessly falls back to mock mode with visual warning indicators.

---

## 5. Live Endpoint Summary

All routes are read-only:

- `GET /health` — Service readiness check & table counts
- `GET /api/execution/health` — Inline health counters
- `GET /api/execution/requests/{id}/state` — Request lifecycle aggregate root
- `GET /api/execution/leases/stale` — Stale active lease detector
- `GET /api/execution/leases/{id}/lifecycle` — TTL gap inspector
- `GET /api/execution/health/integrity-scan` — Cross-table consistency scan (8 pathologies)
- `GET /api/execution/requests/{id}/attempts` — Request attempt/lease tree
- `GET /api/execution/requests/{id}/receipts/lineage` — Lineage bucket classifier
- `GET /api/execution/health/by-executor` — Fleet workload & stale count per executor
- `GET /api/execution/health/status-distribution` — Status distribution snapshots
- `GET /api/execution/receipts/{id}/pipeline-origin` — Side-by-side origin seam comparator

---

## 6. Systemd Production Setup (`execution-srv.service`)

Create `/etc/systemd/system/execution-srv.service`:

```ini
[Unit]
Description=Execution Observability API Server
After=network.target postgresql.service

[Service]
Type=simple
User=nexus
WorkingDirectory=/opt/nexus/execution-srv
Environment=PORT=3110
Environment=PGHOST=localhost
Environment=PGPORT=5432
Environment=PGUSER=pguser
Environment=PGPASSWORD=pgpass
Environment=PGDATABASE=nexus
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now execution-srv
```
