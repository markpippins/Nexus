# REST API Comparison: fs-crawler vs voyager-srv

**Generated:** 2026-08-06
**Sources:**
- `nexus/python/fs/fs-crawler/app/api/routes.py` (576 lines)
- `nexus/python/fs/fs-crawler/app/main.py` (183 lines)
- `nexus/typescript/voyager-srv/src/routes.ts` (540 lines)
- `nexus/typescript/voyager-srv/src/index.ts` (92 lines)

---

## 1. Overview

| Attribute         | fs-crawler                          | voyager-srv                         |
|-------------------|-------------------------------------|-------------------------------------|
| **Language**      | Python 3 (async)                    | TypeScript (Node.js)                |
| **Framework**     | FastAPI                             | Express                             |
| **Port**          | 8004                                | 3114                                |
| **Route prefix**  | `/api/v1`                           | `/api`                              |
| **Data stores**   | MySQL (SQLAlchemy), MongoDB, Redis  | PostgreSQL (pg Pool)               |
| **CORS**          | Yes (allow `*`, methods/headers `*`) | Yes (`cors()` middleware)          |
| **Service discovery** | Startup service initialization | Heartbeat-client → service-registry (port 8085, serviceId 114) |
| **Auto-docs**     | FastAPI OpenAPI at `/docs`, `/redoc`| None — no OpenAPI/Swagger          |
| **Background tasks** | FastAPI `BackgroundTasks`        | None — all synchronous handlers     |
| **Structured logging** | structlog (JSON renderer)       | `console.log` / `console.error`    |
| **Graceful shutdown** | MySQL/Mongo close in lifespan   | `SIGTERM`/`SIGINT` → `pool.end()`  |

### Model
- **fs-crawler** (codename *Mildred*) is a **media metadata indexing service** — a CRUD/control plane for scanning filesystems for audio/music files, finding duplicates, and applying rules to mark or delete unwanted copies.
- **voyager-srv** is a **filesystem observation read model** — a read-only query layer over a schema recording scan epochs, file/directory observations, topology signals, entity resolution, metadata spans, and requirement candidates.

**Key distinction:** fs-crawler is a **write** service (scan, add, update, delete, resolve) that happens to also provide search/stats reads. voyager-srv is an almost-purely **read** service (every route is a `GET`). The next action a caller drives is very different: fs-crawler orchestrates long-running background work; voyager-srv serves filtered/paginated snapshots.

---

## 2. Endpoints

### fs-crawler — all routes under `/api/v1/`

| Method   | Path                                  | Purpose                                   | Returns                          |
|----------|---------------------------------------|-------------------------------------------|----------------------------------|
| GET      | `/libraries`                          | List configured library paths             | `List[dict]`                     |
| POST     | `/libraries`                          | Add new library path (validates uniqueness) | `{message, id}`                |
| PUT      | `/libraries/{library_id}`             | Update library path fields                | `{message, id}`                  |
| DELETE   | `/libraries/{library_id}`             | Delete a library path                     | `{message, id}`                  |
| POST     | `/scan/start`                         | Start filesystem scan (optional `path`)   | `{message}` (background task)    |
| GET      | `/scan/status`                        | Current scan status                       | status dict                      |
| POST     | `/scan/stop`                          | Stop all running scans                    | `{message, stopped_count}`       |
| GET      | `/search`                             | Full-text metadata search (q, file_type, limit, offset) | `{results, total, limit, offset}` |
| GET      | `/files/{file_id}`                    | Single file metadata (MongoDB ObjectId)   | file doc                         |
| GET      | `/stats`                              | Counts by file category + totals          | `{total_files, total_directories, by_category}` |
| GET      | `/duplicates/stats`                   | Duplicate-detection statistics            | stats dict                       |
| POST     | `/duplicates/detect`                  | Run duplicate detection (auto-mark option)| `{message}` (background task)    |
| GET      | `/duplicates/candidates`              | Files marked for deletion                 | `{deletion_candidates, total_count}` |
| GET      | `/duplicates/groups`                  | Duplicate groups by fingerprint or hash   | `{duplicate_groups, method, total_groups}` |
| POST     | `/duplicates/resolve`                 | Apply rules-engine to resolve duplicates   | `{message}` or `{message, preview_results}` for dry runs |
| GET      | `/duplicates/resolution-stats`        | Statistics about resolutions              | stats dict                       |
| GET      | `/duplicates/preview`                 | Preview prospective resolutions (no commit)| `{preview_results, total_previewed}` |
| GET      | `/rules`                              | List deletion rules                       | `{rules[], total_count}`         |
| POST     | `/rules`                              | Create a deletion rule                     | `{rule_id, message}`             |
| PUT      | `/rules/{rule_id}`                    | Update a rule                              | `{message}`                      |
| DELETE   | `/rules/{rule_id}`                    | Delete a rule                              | `{message}`                      |
| POST     | `/rules/defaults`                     | Create default rule set                    | `{created_rules[], message}`     |
| POST     | `/rules/templates`                    | Create rule from named template + params   | `{rule_id, template, message}`   |
| GET      | `/rules/templates`                    | List available rule templates              | `{templates}`                    |
| GET      | `/config/file-types`                  | List supported file types                 | `[dict]`                         |
| GET      | `/config/handlers`                    | List metadata handlers                    | `[dict]`                         |

#### Non-prefixed fs-crawler routes

| Method | Path             | Purpose                                   |
|--------|------------------|-------------------------------------------|
| GET    | `/`              | Root health marker: service/version/status |
| GET    | `/health`        | Detailed DB health (Redis/Mongo/MySQL)    |
| GET    | `/system/status` | System status including scan operations   |

FastAPI auto-generates `/docs` (Swagger UI) and `/redoc` (ReDoc) from the OpenAPI schema.

---

### voyager-srv — all routes under `/api/`

| Method | Path                                     | Purpose                                                              | Returns shape                           |
|--------|------------------------------------------|----------------------------------------------------------------------|-----------------------------------------|
| GET    | `/health`, `/api/health`                | DB liveness probe (`SELECT 1`)                                       | `{status, db, service}`                 |
| GET    | `/scan-epochs`                           | List scan epochs (newest first), paginated                            | `{items, total, page, pageSize}`         |
| GET    | `/scan-epochs/:id`                       | Single scan epoch                                                     | epoch row (camelCased)                  |
| GET    | `/observations/files`                   | List file observations — filters: `scanEpochId`, `path`, `deviceId`, `inode` | `{items, total, page, pageSize}` |
| GET    | `/observations/files/by-id/:observationId` | File observation by UUID (`observation_id`)                       | file obs row                            |
| GET    | `/observations/files/:id`                | File observation by surrogate id                                     | file obs row                            |
| GET    | `/observations/directories`             | List directory observations — filters: `scanEpochId`, `path`        | `{items, total, page, pageSize}`         |
| GET    | `/topology/signals`                     | List topology signals — filters: `scanEpochId`, `structureType`     | `{items, total, page, pageSize}`         |
| GET    | `/topology/signals/:id`                 | Single topology signal                                                | signal row                              |
| GET    | `/topology/edge-hints`                  | List observation edge hints — filters: `evidenceType`, `minConfidence` | `{items, total, page, pageSize}`   |
| GET    | `/identity/candidates`                  | List identity candidates — filter: `minConfidence`                   | `{items, total, page, pageSize}`         |
| GET    | `/entities`                             | List entities — filters: `minStability`, `canonicalPath`              | `{items, total, page, pageSize}`        |
| GET    | `/entities/by-id/:entityId`             | Entity by UUID (`entity_id`) + drifts                                  | entity row + `drifts[]`                |
| GET    | `/entities/:id`                         | Entity by surrogate id + drifts                                       | entity row + `drifts[]`                |
| GET    | `/spans`                                | List metadata spans — filters: `spanType`, `markdownRole`, `minConfidence`, `observationId` | `{items, total, page, pageSize}` |
| GET    | `/spans/:id`                            | Single metadata span                                                  | span row                                |
| GET    | `/requirements`                        | List requirement candidates (LOSM output) — filter: `minConfidence`  | `{items, total, page, pageSize}`        |
| GET    | `/stats`                                | Aggregated counts across all voyager tables + latest epoch + span-type breakdown | stats dict                |

**Observation:** voyager-srv has *zero* mutating endpoints (no POST/PUT/DELETE). It is the read side of a write-elsewhere observation pipeline.

---

## 3. Endpoint-count comparison

| Category              | fs-crawler | voyager-srv | Notes                                                                                           |
|-----------------------|------------|-------------|-------------------------------------------------------------------------------------------------|
| Library/config CRUD   | 5          | 0           | fs-crawler manages library paths; voyager-srv has no library concept                            |
| Scan control           | 3          | 1 (read `scan-epochs`) | fs-crawler drives scans actively; voyager-srv only reads the resulting scan_epoch rows |
| Search/observation     | 3          | 9           | voyager-srv operates across a richer observation schema                                          |
| Stats                  | 1          | 1           | voyager-srv's `/stats` is ten-fold richer (per-table counts + latest epoch + span-type rollup)   |
| Rules engine           | 7          | 0           | fs-crawler-only domain                                                                          |
| Duplicate handling     | 6          | 0           | fs-crawler-only domain                                                                          |
| Health/system          | 3          | 1 (`/health` and `/api/health` both delegate to same handler) | fs-crawler's health checks three DBs; voyager-srv checks only PG              |
| **Total distinct paths** | **~28**  | **~18**     | fs-crawler is bigger; voyager-srv is narrower but deeper in filtering                            |

---

## 4. Data Store Model

| Dimension       | fs-crawler                                     | voyager-srv                                  |
|-----------------|------------------------------------------------|----------------------------------------------|
| Primary store   | **MySQL** via SQLAlchemy async (`async_session_maker`) | **PostgreSQL** via `pg.Pool`                |
| Search/meta     | **MongoDB** — full-text search of `file_metadata`, aggregation for stats | — (only PostgreSQL, JSONB columns)         |
| Cache/queue     | **Redis** — heartbeat, scan coordination       | — (PostgreSQL only)                          |
| Schema migration | SQLAlchemy models (`mysql_models.py`, `rules_models.py`) | Manual SQL (init scripts not in the routes) |
| JSON columns    | No explicit use                                | Yes — `structure` (topology_signal), `state` (entity), `evidence` (edge_hint), `provenance` (metadata_span) |
| Async DB client  | `asyncpg`-backed SQLAlchemy async sessions / `motor` Mongo client | `pg.Pool` (async/pg)                       |

fs-crawler treats **three DBs as a coordinated trio**; voyager-srv keeps everything in PostgreSQL with JSONB columns, leaning on SQL operators (`->>'type'`, `ILIKE`, `>=`) instead of a separate search index. voyager-srv's per-route dynamic-WHERE builder (`clauses.push + vals.push`) is the central query idiom.

---

## 5. Filtering & Pagination

| Aspect         | fs-crawler                                              | voyager-srv                                                |
|----------------|----------------------------------------------------------|------------------------------------------------------------|
| Pagination shape | `limit` + `offset` (offset-based)                       | `page` + `pageSize` (page-based, clamped 1..100)         |
| Pagination on list endpoints | Only on `/search` (`limit`, `offset`), `/duplicates/candidates` (`limit`), `/duplicates/groups` (`limit`) | Every list endpoint returns `{items, total, page, pageSize}` |
| Max page size   | None enforced (free-form int)                            | Hard-capped at 100 (via `Math.min(100, …)`)                |
| Filters         | `q` (full-text), `file_type` for `/search`; `method` for `/duplicates/groups` | Per-endpoint filter set, implemented as dynamic `WHERE` clause builders (see below) |
| Sort order       | Not specified (relies on Mongo/SQL order)                | Explicit `ORDER BY discovered_at DESC` (or `started_at DESC` for scan epochs, `stability_score DESC` for entities) |
| Response envelope | Mixed — sometimes bare list (`List[dict]`), sometimes `{results, total, limit, offset}`, `{rules, total_count}`, `{deletion_candidates, total_count}` | Consistent `{items, total, page, pageSize}` across every list endpoint |
| Key vs surrogate lookup | `/files/{file_id}` uses MongoDB ObjectId       | Both surrogate `:id` (numeric) and stable-keyed `by-id/:observationId|:entityId` (UUID) variants offered |

**Consequence:** voyager-srv's responses are more machine-friendly — pagination and envelope are uniform. fs-crawler mixes shapes across endpoints, making a generic client harder to write. voyager-srv also surfaces stable UUIDs as their own routes (`/by-id/:observationId`, `/entities/by-id/:entityId`), explicitly designing around a stable-key invariant; fs-crawler hands out only the surrogate Mongo `_id`.

### Dynamic WHERE examples

voyager-srv consistently builds filters like:

```ts
const clauses: string[] = [];
const vals: any[] = [];
let i = 1;
if (scanEpochId) { clauses.push(`scan_epoch_id = $${i++}`); vals.push(scanEpochId); }
if (pathFilter) { clauses.push(`path ILIKE $${i++}`); vals.push(`%${pathFilter}%`); }
const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
```

fs-crawler composes queries more idiomatically into Mongo/SQLAlchemy equivalents (`{"$text": {"$search": q}}`, `query["file_category"] = file_type`), but never builds general-purpose dynamic WHERE — filters are statically named in each handler.

---

## 6. Error Handling

| Aspect           | fs-crawler                                                      | voyager-srv                              |
|------------------|------------------------------------------------------------------|------------------------------------------|
| HTTP errors       | `HTTPException(status_code=4xx, detail=...)` (FastAPI: returns `{detail}`) | `res.status(500).json({error: err.message})` mostly; 404 bare `{error}` |
| 400 surface       | On validation failures — missing `path`, invalid rule data, invalid template name, invalid file ID | Not explicitly used; bad query shapes slip through to 500s |
| 404 surface       | Library not found, file not found, rule not found               | Scan epoch not found, file/dir obs not found, topology signal not found, entity not found, metadata span not found |
| 403/401           | None — no auth                                                   | None — no auth                            |
| 5xx surface       | Implicit (unhandled error → FastAPI 500)                        | Explicit `res.status(500).json({error})` catches all server errors; `/stats` swallows per-query errors and returns `null` for that key |
| Logging on error  | structlog emitted by handlers with `logger.info/error`           | `console.error` in process-level hooks   |

voyager-srv's `/stats` deserves special mention: each of its 12 sub-queries runs in a try/catch that yields `null` on failure, so a missing table degrades silently rather than breaking the whole stat endpoint. This is intentional defensive read-model behavior.

---

## 7. Background Work

### fs-crawler — FastAPI `BackgroundTasks`
The service's central differentiator is that it actually **does work**:
- `/scan/start` → `scanner.scan_path(path)` or `scanner.scan_all_libraries`
- `/scan/stop` → `scanner.stop_all_scans()`
- `/duplicates/detect` → `detector.process_all_duplicates(100, auto_mark)`
- `/duplicates/resolve` → `resolver.resolve_all_duplicates(batch_size, False)` (when `dry_run=False`)

Long-running operations run in the background, while the HTTP response returns immediately with `{message}`. This makes fs-crawler an **orchestration plane** — the caller polls `/scan/status` and `/duplicates/resolution-stats` to follow progress.

### voyager-srv — no background work
There is no background scheduler, queue, or task abstraction. Every handler returns synchronously after the SQL query completes. The scan epoch rows voyager-srv serves come from a writer elsewhere (likely an attached `warpper` / `crawleer` / scanner component writing to PostgreSQL); voyager-srv is purely a **read** service.

---

## 8. Versioning

| Service      | Prefix       | Versioning strategy                                    |
|--------------|--------------|---------------------------------------------------------|
| fs-crawler   | `/api/v1`    | Explicit `v1` in path; upgrade would add `/api/v2`     |
| voyager-srv  | `/api`       | No version segment in URL                               |
| OpenAPI      | `FastAPI(version="2.0.0")` — generates `/docs`, `/redoc` | None |

fs-crawler commits to API versioning in the URL and ships auto-generated interactive docs (Swagger UI at `/docs`, ReDoc at `/redoc`) via FastAPI's built-in OpenAPI generator. voyager-srv has no equivalent — clients must read the source to know what's available. voyager-srv's lack of versioning means future breaking changes must either be additive or rely on the natural read-only tolerance of GET endpoints.

---

## 9. Health & Observability

| Aspect            | fs-crawler                                                     | voyager-srv                                                |
|-------------------|----------------------------------------------------------------|------------------------------------------------------------|
| Liveness probe    | `/` returns `{service, version, status}`                     | `/health` or `/api/health` returns `{status, db, service}` |
| Deep health       | `/health` checks three DBs (Redis, MongoDB, MySQL)            | `/health` only runs `SELECT 1 as ok` against PostgreSQL    |
| System status     | `/system/status` — startup service introspection              | —                                                          |
| Service registry  | No explicit registration — relies on knowledge of port 8004   | `heartbeat-client` registers with service-registry (8085) every 30 s, `serviceId: 114` |
| Structured logs   | structlog JSONRenderer — logstash-friendly output              | `console.log`/`console.error` only                          |

This is a meaningful operational gap: voyager-srv self-registers with the central service-registry (port 8085) and survives process restart by re-emitting heartbeats. fs-crawler operates on its known port with a heavier three-DB readiness check but does not announce itself to the registry.

---

## 10. Code Quality Conventions

| Aspect            | fs-crawler                                                     | voyager-srv                                                |
|-------------------|----------------------------------------------------------------|------------------------------------------------------------|
| Route declarations | Class-less module-level `@router.get/@router.post`            | `router.get(...)` inside a factory `createRoutes(pool)`    |
| DI / state passing | Lazy imports inside handler bodies (`from database import …`) — defers circular-import cost | `pool` injected at factory time; no per-handler imports     |
| Typed handler args | FastAPI gives typed query params (`q: Optional[str]`, `limit: int = 50`) | TypeScript `req.query.X` are untyped strings, parsed via `toNumber` |
| Response bodies   | Mixed — some `List[dict]`, some `dict`, some `{results, total, ...}` | Always `JSON.stringify`-able object; rows transformed by `camelCaseRow/Ros` |
| Naming convention | snake_case (Python) in DB then returned un-converted           | snake_case DB columns converted to camelCase in HTTP response |
| Idempotency       | POST `/libraries` checks uniqueness → 400                     | N/A — no mutations                                          |
| Testability       | Hard with deep per-handler imports                             | Easier — `pool` is a function arg; factory returns `Router` |

The camelCase transformer in voyager-srv (`camelCaseRow`) is a small important nicety: PostgreSQL column names arrive as snake_case, but the API exposes camelCase JSON so the JS/TS frontend doesn't have to translate. fs-crawler returns whatever the underlying column names are.

---

## 11. Similarities

Despite different ecosystems and responsibilities, the two services share:

1. **Single-process, single-port HTTP service** with `0.0.0.0`/`localhost` listening.
2. **CORS open** (`allow_origins=["*"]` / `cors()` default).
3. **No authentication or authorization** — open API, presumed-trusted network.
4. **Health endpoint at `/health`** returning a JSON status object.
5. **Single root resource prefix** for everything business-related.
6. **Semantic `stats` endpoint** that pre-aggregates counts across tables/categories.
7. **Concept of "scan"** as a primary unit of work — fs-crawler's scan/start/stop vs voyager-srv's `scan-epoch` rows that record when scans happened.
8. **JSON-blob columns** for flexible evidence/state metadata — MongoDB documents in fs-crawler, `JSONB` columns in voyager-srv.
9. **Plain async/await handlers** without an extra abstraction layer.

---

## 12. Key Differences — Summary

| Difference                                              | fs-crawler                                  | voyager-srv                                         |
|---------------------------------------------------------|---------------------------------------------|-----------------------------------------------------|
| Writes (POST/PUT/DELETE)                                | 13 mutating endpoints                       | 0 — read-only                                        |
| Background task execution                               | Yes (FastAPI BackgroundTasks)               | No                                                  |
| Number of backing data stores                           | 3 (MySQL + MongoDB + Redis)                 | 1 (PostgreSQL)                                       |
| Auto-generated API docs                                 | Yes (Swagger + ReDoc)                       | No                                                  |
| API versioning in URL                                   | `/api/v1`                                   | `/api` only                                          |
| Service-registry heartbeat                              | No                                          | Yes (`heartbeat-client`, 30s interval, serviceId 114) |
| Response envelope consistency                            | Heterogeneous                                | Uniform `{items, total, page, pageSize}`            |
| Pagination convention                                   | `limit`/`offset`                            | `page`/`pageSize` (capped at 100)                   |
| Stable-UUID lookup variants                             | No (`_id` only)                             | Yes (`/by-id/:observationId`, `/entities/by-id/:entityId`) |
| Column-naming convention                                | Pass-through snake_case                     | snake_case → camelCase transformer                  |
| Defensive per-query recovery in `/stats`                | No                                          | Yes (each of 12 sub-queries wrapped in try/catch)   |
| Auth                                                    | None                                        | None                                                |
| Filter-by-confidence primitives                         | N/A                                         | Built into `/topology/edge-hints`, `/identity/candidates`, `/requirements`, `/spans`, `/entities` |

---

## 13. Architectural Trajectories

The two services exist at different points in the Nexus observation pipeline:

```
                          ┌─────────────────────────────┐
   filesystem ──scan──>   │   fs-crawler (port 8004)     │
                          │   - writes to MySQL/Mongo    │
                          │   - duplicate detection      │
                          │   - rules engine             │
                          │   - media-specific           │
                          └──────────────┬───────────────┘
                                         │
                                         │ (separate writer, or same
                                         │  scanner publishing both)
                                         ▼
                          ┌─────────────────────────────┐
                          │   voyager-srv (port 3114)   │
                          │   - reads PostgreSQL        │
                          │   - scan_epochs             │
                          │   - observations (files/dirs)│
                          │   - topology signals        │
                          │   - entities + drift        │
                          │   - metadata spans          │
                          │   - requirement candidates   │
                          │   - general-purpose          │
                          └─────────────────────────────┘
```

**fs-crawler** is a working control plane for **media file hygiene**: it scans, indexes, searches, detects duplicates, and applies rules — then takes action via background tasks. It treats the filesystem as the thing to be **cleaned**, and its DB trio persists the catalog and the cleaning decision log.

**voyager-srv** is a **read model over a structural observation schema**. It does not clean — it **exposes**. Its callers (likely the Semantics UI or analysis tooling) filter and page over what was previously observed and written by another component (a scanner/writer not in the routes file). The schema is more abstract than fs-crawler's media catalog: `scan_epoch`, `file_observation`, `topology_signal`, `entity_drift`, `metadata_span`, `requirement_candidate`. These read like the ontology that fs-crawler's media-specific tables would feed into (or sit alongside).

### Possible future convergence

If Nexus eventually wants a unified filesystem observability layer, the natural migration direction is:

1. **Reads → voyager-srv style.** Uniform pagination envelope, page/pageSize cap, dynamic WHERE builder, camelCase HTTP output, by-id stable lookup variants.
2. **Writes → fs-crawler style.** Background task execution, validation, rules engine. fs-crawler's actual scan and resolve pipelines are not transferable to a stateless read service.
3. **API docs → FastAPI-style.** Auto-generated OpenAPI is a real win. voyager-srv could expose this by adding `swagger-jsdoc` or `tsoa` (or by upgrading to a framework like Fastify with `@fastify/swagger`).
4. **Service discovery → heartbeat-client style.** voyager-srv's registration is a model fs-crawler should adopt.
5. **Single store → PostgreSQL.** fs-crawler's three-store architecture (MySQL + Mongo + Redis) is operational complexity cost; voyager-srv's single-Postgres design with JSONB and proper indexes is far simpler to reason about. Consolidating fs-crawler onto Postgres (replace Mongo with JSONB, Redis with advisory locks or a PostgreSQL-backed task queue) would remove an entire class of operational concerns.

---

## 14. Quick Reference — Query-string Filters

### fs-crawler

| Endpoint                       | Filters                                              |
|--------------------------------|------------------------------------------------------|
| `/api/v1/search`               | `q` (full-text), `file_type`, `limit`, `offset`     |
| `/api/v1/files/{file_id}`      | — (path param)                                       |
| `/api/v1/rules`                | `enabled_only` (bool, default `true`)               |
| `/api/v1/rules/templates`       | —                                                    |
| `/api/v1/rules/templates` (POST)| `template_name` (query), `parameters` (body)        |
| `/api/v1/duplicates/candidates`| `limit` (default 100)                                |
| `/api/v1/duplicates/groups`    | `method` (`fingerprint` or `hash`, default `fingerprint`), `limit` |
| `/api/v1/duplicates/resolve`   | `dry_run` (bool, default `true`), `batch_size` (default 50) |
| `/api/v1/duplicates/preview`   | `limit` (default 10)                                 |
| `/api/v1/scan/start`           | `path` (optional — single path vs all libraries)    |

### voyager-srv

| Endpoint                              | Filters                                                  | Pagination                       |
|---------------------------------------|----------------------------------------------------------|----------------------------------|
| `/api/scan-epochs`                   | —                                                        | `page`, `pageSize` (default 20)  |
| `/api/observations/files`             | `scanEpochId`, `path`, `deviceId`, `inode`               | `page`, `pageSize` (default 50)  |
| `/api/observations/files/by-id/:id`    | — (path param)                                            | —                                |
| `/api/observations/files/:id`         | — (path param)                                            | —                                |
| `/api/observations/directories`       | `scanEpochId`, `path`                                     | `page`, `pageSize` (default 50)  |
| `/api/topology/signals`              | `scanEpochId`, `structureType`                           | `page`, `pageSize` (default 50)  |
| `/api/topology/signals/:id`           | — (path param)                                            | —                                |
| `/api/topology/edge-hints`            | `evidenceType`, `minConfidence`                          | `page`, `pageSize` (default 50)  |
| `/api/identity/candidates`            | `minConfidence`                                           | `page`, `pageSize` (default 50)  |
| `/api/entities`                      | `minStability`, `canonicalPath`                          | `page`, `pageSize` (default 50)  |
| `/api/entities/by-id/:entityId`       | — (path param)                                            | —                                |
| `/api/entities/:id`                   | — (path param)                                            | —                                |
| `/api/spans`                         | `spanType`, `markdownRole`, `minConfidence`, `observationId` | `page`, `pageSize` (default 50)  |
| `/api/spans/:id`                      | — (path param)                                            | —                                |
| `/api/requirements`                  | `minConfidence`                                           | `page`, `pageSize` (default 50)  |
| `/api/stats`                         | —                                                        | —                                |

---

## 15. Conclusion

**fs-crawler** is an **operational control plane** for media file scanning and cleanup, running on three data stores and executing work in-process via FastAPI background tasks. Its API exposes a rich CRUD surface for libraries, scanning, search, duplicates, rules, and config — plus three flavors of system health.

**voyager-srv** is an **observability read model** over a generic filesystem-observation schema living entirely in PostgreSQL. Its API is uniformly `GET`-only, consistently paginated, defensively resilient (per-query try/catch in `/stats`), and self-registers with the service registry. It exposes scan epochs, observations, topology, identity candidates, entities, drifts, metadata spans, and requirement candidates — none of which exist as concepts in fs-crawler's media-specific catalog.

They are **complementary more than competing**: fs-crawler is the writing/cleaning brain for media files, voyager-srv is the read/explain brain for structural observations of the filesystem. They share the "scan" abstraction (scan action→status vs scan_epoch table row), but the integration of observations, entities, and metadata spans lives only in voyager-srv, while duplicate detection and the rules engine live only in fs-crawler.

If a Nexus-wide API standard is desired, voyager-srv's response-envelope uniformity and pagination discipline should be the template, fs-crawler's auto-generated OpenAPI docs and explicit `/api/v1` versioning should be adopted upstream, and fs-crawler should mirror voyager-srv's heartbeat-based service-registry registration.
