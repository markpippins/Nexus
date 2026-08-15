# nexus-control-edge

Consolidated **control-plane edge** for the nexus monolith cutover
(project: "re-home `typescript/*-srv` onto AdonisJS + Moleculer + Redis + MongoDB").

One AdonisJS process hosting the control-plane REST surfaces per binding
ruling `D-2026-08-14-002`:

- ui-tools
- tools-aggregator (Wave 2)
- knowledge-srv (Wave 2)
- semantics-srv (Wave 2)
- terrain-srv (Wave 2)
- voyager-srv (Wave 2)
- tackle-srv (Wave 3)
- tackle-prompt-sync-srv (Wave 1)
- role-memory-srv (Wave 1)

## Conventions

- **Contract-first**: every route group is frozen by a TypeSpec contract
  under `typespec/v1/`. The conformance validator (`reconcile-typescript.py`)
  diffs this app's route table against the emitted OpenAPI.
- **Canonical store stays PostgreSQL** — no schema migration to re-home.
- **Redis via `ioredis`** directly (per-request connections, same as the
  Express services being replaced); Adonis core ships no redis service.
- JSON API only — no session, no auth, no cookies on this edge.

## Run

```bash
cp .env.example .env   # adjust PG/REDIS/APP_KEY
npm install
npm run dev            # or: npm run build && npm start
```

## Health

`GET /health` reports `{ status, service, db, redis, timestamp }`.

## Route table (current)

| Method | Path | Controller | Contract |
|---|---|---|---|
| GET | /health | HealthController | adonisjs |
| GET/POST | /api/links | LinksController | ui-tools |
| PATCH | /api/links/reorder | LinksController | ui-tools |
| PATCH/DELETE | /api/links/:id | LinksController | ui-tools |
