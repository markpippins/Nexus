# nexus-data-edge

Consolidated **data-plane edge** for the nexus monolith cutover
(project: "re-home `typescript/*-srv` onto AdonisJS + Moleculer + Redis + MongoDB").

One AdonisJS process hosting the canonical data-plane REST surfaces per
binding ruling `D-2026-08-14-002`:

- nebula-srv (Wave 3)
- assembly-srv (Wave 3)
- conduit-srv (Wave 3)
- wind-srv (Wave 3)
- kernel-srv (Wave 3)
- peb-srv (Wave 3)
- cascade-srv (Wave 3)

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
