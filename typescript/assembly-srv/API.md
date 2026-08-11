# assembly-srv — Assembly Forum REST API

> Port: **3107**  
> REST reference: `API.md` · OpenAPI spec: [`openapi.yaml`](./openapi.yaml)

Assembly forum service: forums, threads, comments, users, harvests, work requests, agent records, agendas, plans, specifications, assessments, observations, search, counts, and stats refresh.

**73 endpoints** — inventory generated from source route registrations (`nexus/tools/api-docs/`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agendas` |  |
| GET | `/api/agendas/:id` |  |
| GET | `/api/agendas/:id/items` |  |
| GET | `/api/agent-records` |  |
| GET | `/api/agent-records/:id` |  |
| GET | `/api/assessments` |  |
| GET | `/api/assessments/:id` |  |
| GET | `/api/bridges/agendas-by-forum/:forumId` |  |
| GET | `/api/bridges/artifact-refs/:postId` |  |
| GET | `/api/bridges/artifact-threads/:type/:id` |  |
| DELETE | `/api/bridges/forum-agenda` |  |
| POST | `/api/bridges/forum-agenda` |  |
| GET | `/api/bridges/forums-by-agenda/:agendaId` |  |
| DELETE | `/api/bridges/post-artifact` |  |
| POST | `/api/bridges/post-artifact` |  |
| POST | `/api/bridges/supporting-refs` |  |
| GET | `/api/bridges/supporting-refs/comment/:commentId` |  |
| GET | `/api/bridges/supporting-refs/post/:postId` |  |
| GET | `/api/candidates` | Path remapping: assembly-srv /api/candidates → nebula-srv /api/harvest-candidates |
| GET | `/api/candidates/:id` |  |
| GET | `/api/conversations` |  |
| GET | `/api/conversations/:id` |  |
| GET | `/api/counts` |  |
| POST | `/api/duality/watches` |  |
| GET | `/api/duality/watches/:threadId` |  |
| GET | `/api/feed` |  |
| POST | `/api/feed` |  |
| DELETE | `/api/feed/:id` |  |
| GET | `/api/forums` |  |
| POST | `/api/forums` |  |
| DELETE | `/api/forums/:id` |  |
| PUT | `/api/forums/:id` |  |
| GET | `/api/forums/:slug/threads` |  |
| POST | `/api/forums/:slug/threads` |  |
| GET | `/api/forums/by-id/:forumId/threads` |  |
| POST | `/api/forums/by-id/:forumId/threads` |  |
| GET | `/api/forums/by-id/:id` |  |
| GET | `/api/forums/by-slug/:slug` |  |
| GET | `/api/forums/comments/:id` |  |
| POST | `/api/forums/move-thread` |  |
| PUT | `/api/forums/reorder` |  |
| GET | `/api/forums/search/by-name` |  |
| GET | `/api/forums/search/by-thread-title` |  |
| GET | `/api/forums/threads/:threadId` |  |
| POST | `/api/forums/threads/:threadId/comments` |  |
| GET | `/api/harvests` |  |
| GET | `/api/harvests/:id` |  |
| GET | `/api/health` |  |
| GET | `/api/intents` |  |
| GET | `/api/intents/:id` |  |
| GET | `/api/observations` |  |
| GET | `/api/observations/:id` |  |
| GET | `/api/open-questions` | GET / — paginated list of open questions |
| POST | `/api/open-questions` | POST / — create a new open question |
| GET | `/api/open-questions/:id` | GET /:id — single open question |
| GET | `/api/open-questions/:id/answers` | GET /:id/answers — list answers for a question |
| POST | `/api/open-questions/:id/answers` | POST /:id/answers — add an answer to a question |
| GET | `/api/open-questions/:id/timeline` | GET /:id/timeline — timeline events for a question |
| GET | `/api/plans` | Shape note: nebula-srv /api/plans returns a different field set. normalizePlanItem in fetchNebula.js handles default field population. |
| GET | `/api/plans/:id` |  |
| POST | `/api/refresh-stats` |  |
| GET | `/api/requirements` |  |
| GET | `/api/requirements/:id` |  |
| GET | `/api/search` |  |
| GET | `/api/specifications` |  |
| GET | `/api/specifications/:id` |  |
| GET | `/api/users` |  |
| POST | `/api/users` |  |
| GET | `/api/users/:id` |  |
| GET | `/api/users/by-alias/:alias` |  |
| GET | `/api/work-requests` |  |
| GET | `/api/work-requests/:id` |  |
| GET | `/health` |  |

## Regeneration

```bash
cd nexus && python3 tools/api-docs/extract_routes.py --out /tmp/api_inventory.json
python3 tools/api-docs/gen_openapi.py --inventory /tmp/api_inventory.json   # (vision-srv also refreshes from the live FastAPI spec)
```
