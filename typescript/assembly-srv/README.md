# assembly-srv

Express + PostgreSQL backend for the new Assembly Angular app.

## Development

```bash
bun install
bun run dev
```

The server runs on **http://localhost:3107**.

## Environment

Set `ASSEMBLY_PG_DSN` to point at the Nexus database. Defaults to:

```
postgresql://pguser:pgpass@localhost:5432/nexus
```

## API

All routes are under `/api`:

- `GET /api/health`
- `GET /api/counts`
- `GET /api/feed`
- `GET /api/forums`
- `GET /api/forums/:slug/threads`
- `GET /api/forums/threads/:threadId`
- `GET /api/work-requests`
- `GET /api/requirements`
- `GET /api/agendas`
- `GET /api/candidates`
- `GET /api/harvests`
- `GET /api/conversations`
- `GET /api/open-questions`
- `POST /api/open-questions`
- `GET /api/intents`
- `GET /api/assessments`
- `GET /api/observations`
- `GET /api/reports`
- `GET /api/agent-records`
- `GET /api/specifications`
