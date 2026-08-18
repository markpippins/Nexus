-- ============================================================================
-- T25 / D-2026-08-16-010 — Item 4 (Terrain↔Registry sync) — Step 1 migration
-- Re-run boundary audit (live) + exact migration SQL
-- Date: 2026-08-18 | Engineer | audit: 32 overlaps, 31 terrain-only apps, 5 infra fixtures
--
-- Scope: migrate the 29 terrain-only APPLICATION services into registry.services.
--        Infra fixtures (PostgreSQL, redis, NATS, mongodb, ollama) stay in terrain.
--        shrapnel-srv / topology-server are aliases of existing registry rows
--        (`shrapnel` id 54; `terrain`/`terrain-srv`) — no insert.
--
-- Idempotent: every INSERT is ON CONFLICT (name) DO NOTHING. Safe to re-run.
-- Guard: registry.services id sequence can lag existing rows (ops seeds insert with
-- explicit ids, e.g. knowledge-srv id 109). setval before inserting so nextval
-- never collides on re-runs.
--
-- HOW TO RUN (this file contains NO transaction control — the operator wraps it):
--
--   Preview (dry-run, no changes persist):
--     psql -h localhost -U pguser -d nexus \
--       -c "BEGIN;" -f sql/t25-item4-terrain-to-registry-migration.sql -c "ROLLBACK;"
--
--   Execute:
--     psql -h localhost -U pguser -d nexus \
--       -c "BEGIN;" -f sql/t25-item4-terrain-to-registry-migration.sql -c "COMMIT;"
--
-- Registry lookups used below (all resolve today):
--   service_type: 1 REST API, 10 Background Job, 18 Frontend Host, 20 Microservice
--   framework:    1 Spring Boot, 8 Express, 15 FastAPI, 65 auto, 66 typescript, 67 Python
-- ============================================================================

SELECT setval(pg_get_serial_sequence('registry.services', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 1) FROM registry.services), 1));

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('angular-assembly', 'Assembly UI - Angular forum and deliberation interface', 4204, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('apidocs-srv', 'API docs index — Swagger UI + ReDoc over all *-srv OpenAPI specs. Plain HTTP on 127.0.0.1:3180 (localhost tooling); HTTPS listener on 0.0.0.0:8443 (self-signed cert, auto-generated) for LAN clients. Systemd-managed.', 3180, NULL, NULL, 'ACTIVE', true, 8, 1, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('assembly-ui', 'Assembly UI - React/Vite rewrite (T-Assembly-UI-01 through UI-05). Live mode on 4214, mock on 3000. Systemd-managed. Proxies /api to assembly-srv:3107.', 4214, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('atlas', 'Graph views persistence service. Stores and serves graph entity views.', 8090, NULL, NULL, 'ACTIVE', true, 1, 1, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('barbie-ui', 'Platform Operations Dashboard', 3010, '1.0.0', NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade', 'Python cascade event dispatcher - Cycles 41 events on 2s cadence, dispatches to projections', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-assembly-subscriber', 'pg_notify → NATS bridge for Assembly (social/deliberation) events.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-assessment-subscriber', 'pg_notify → NATS bridge for assessment/review events.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-event-bridge', 'Event bridge for cascade event dispatching.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-kernel-subscriber', 'pg_notify → NATS bridge for kernel transition events. Listens on peb_governance_event_created channel and publishes to NATS.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-obs-subscriber', 'pg_notify → NATS bridge for PEB governance events, Vision lifecycle events, and open question events. Listens on 4 channels: peb_governance_event_created, vision_lifecycle_event_created, open_question_answered, open_question_resolved.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cascade-pg-bridge', 'PostgreSQL bridge for cascade events.', NULL, NULL, NULL, 'ACTIVE', true, 67, 10, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('cpf-api', 'CPF funnel data API. Provides REST endpoints for CPF pipeline data.', 3108, NULL, NULL, 'ACTIVE', true, 66, 1, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('data-explorer-ui', 'Data Explorer UI - SQL database tool and query editor', 4212, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('duality-ui', 'Duality UI - React/Vite app', 3002, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('execution-ui', 'Execution UI - work request execution dashboard', 4205, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('losm-host', 'LOSM Host — Layer 3 operational FastAPI server. REST + WebSocket APIs over the LOSM pipeline: work request CRUD, orchestration, transitions, receipt ingestion, branches, artifacts, DAG compilation, graph validation.', 8006, NULL, NULL, 'ACTIVE', true, 15, 1, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('monaco-judge', 'Monaco Judge - code review and evaluation UI', 4016, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('nebula-control-plane', 'Nebula Control Plane - agent management and audit UI', 4014, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('operator-svc', 'Operator service — host personality for Nexus UIs. Direct provider API calls via tackle.inference, conversation history in PostgreSQL. Replaces agent-chat (opencode CLI).', 3018, '0.1.0', NULL, 'ACTIVE', true, 65, 20, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('peb-ui', 'PEB UI - plugin execution bus dashboard', 4206, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('plurality-ui', 'Plurality UI - React/Vite app (systemd dev server on 3004)', 3004, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('semantic-kernel-ui', 'Semantic Kernel UI - AI kernel management interface', 4207, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('semantics-ui', 'semantics-ui — React 19 + Vite 6 + Express 4 dev server (the Semantics Database Explorer). Live mode (default in systemd) proxies /api/* to semantics-srv:3160; mock mode serves in-memory seed data on port 3000. Lives under nexus/angular/ alongside the Angular UIs but is itself a Vite/React app.', 4213, '1.0', NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('tackle-ui', 'Angular UI for tackle-mcp agent chat interface', 4202, '0.0.0', NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('throttler-ui', 'Throttler File Manager & Search', 4211, '1.0.0', NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('view-architect', 'View Architect UI - visualization and view management', 3003, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('vision-ui', 'LOSM Vision Control Plane - platform operations visualization', 4208, '1.0.0', NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO registry.services (name, description, default_port, version, repository_url, status, active_flag, framework_id, service_type_id, created_at, updated_at)
VALUES ('wind-ui', 'Wind UI - IDE workflow management interface', 4209, NULL, NULL, 'ACTIVE', true, 8, 18, now(), now())
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Post-migration verification (run inside the same transaction, before COMMIT)
-- ============================================================================
-- SELECT count(*) AS still_terrain_only_apps
-- FROM terrain.runnable_services rs
-- WHERE NOT EXISTS (SELECT 1 FROM registry.services s WHERE lower(s.name) = lower(rs.name))
--   AND lower(rs.name) NOT IN ('postgresql','redis','nats','mongodb','ollama');
--   -- expect 2: shrapnel-srv, topology-server (aliases — handled in a later step)
