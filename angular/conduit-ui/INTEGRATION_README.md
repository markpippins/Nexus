# Conduit / Nexus Control Plane Integration Guide

This guide details how to transition the **Conduit Process Control Plane** frontend from standalone mock mode to a production live deployment connected to your **PostgreSQL `nexus` database**, **WRP Kernel API server**, and **MCP Agent Server**.

---

## 1. Architecture Overview

```
   ┌───────────────────────────────────────────────────────────────┐
   │         Conduit Control Plane Frontend (React/Vite)           │
   └───────────────┬───────────────────────────────┬───────────────┘
                   │                               │
         (HTTP REST / WS)                   (API Proxies)
                   │                               │
                   ▼                               ▼
     ┌───────────────────────────┐   ┌───────────────────────────┐
     │ FastAPI Kernel Server     │   │ Conduit Core Orchestrator │
     │ (port 3103)               │   │ (main.py / db_adapter)    │
     └─────────────┬─────────────┘   └─────────────┬─────────────┘
                   │                               │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ PostgreSQL `nexus` Database    │
                   │ (schema: conduit, nebula, etc)│
                   └───────────────────────────────┘
```

---

## 2. Environment Configuration

Copy `.env.example` to `.env` and configure your deployment parameters:

```env
# PostgreSQL Nexus Connection String
CONDUIT_PG_DSN=postgresql://nexus_admin:YOUR_SECURE_PASSWORD@postgres.internal.nexus:5432/nexus
CONDUIT_PG_SCHEMA=conduit

# WRP Kernel Runtime API URL
WRP_KERNEL_URL=http://localhost:3103

# Model Chain & MCP Server
MCP_BASE_URL=http://localhost:3100
PIPELINE_MODEL=gemini-1.5-pro

# Server Port & Mode
PORT=3000
NODE_ENV=production
```

---

## 3. Switching from Mock Mode to Live API

In the top address bar of the application, click the **"Mock Mode"** badge to toggle it to **"Live API Mode"**. 

Alternatively, in code, set `apiService.setMockMode(false)`.

When Live API Mode is enabled:
- The frontend issues calls to `/api/*` endpoints hosted by `server.ts`.
- `server.ts` routes requests to PostgreSQL `nexus` and WRP Kernel API (`http://localhost:3103`).

---

## 4. Deploying the WRP Kernel Server & Conduit Backend

### 4.1 Start WRP Kernel API (FastAPI)
```bash
# In your nexus repository
cd python/conduit
python3 -m app.main --port 3103
```

### 4.2 Run Kernel Sync Daemon
```bash
python3 main.py --kernel-sync-daemon
```

### 4.3 Run Conduit Orchestrator Pipeline
```bash
python3 main.py --all
```

---

## 5. Execution Authority (ADR-006) Protocol Audit

Every work dispatch executed via the Control Plane follows the 6-step ADR-006 protocol:

1. **Acquire Lease** → `conduit.leases` (TTL mutual exclusion)
2. **Create Attempt** → `conduit.attempts`
3. **Start Attempt** → Mark status as `IN_PROGRESS`
4. **Complete Attempt** → Mark status as `SUCCEEDED` / `FAILED`
5. **Issue Execution Receipt** → Sha256 chained hash signed entry
6. **Release Lease** → Atomic lock release

You can inspect all active leases, attempts, and receipt chains directly in the **Receipts & Audit Log** surface (`conduit://nexus.local/execution`).
