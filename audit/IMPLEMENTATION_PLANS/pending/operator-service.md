# Plan: Operator Role and Service

## Goal
Create a new "Operator" role in the tackle system and build a Python service that
serves as the host personality for the Nexus UI set. Operator handles chat via
the messagebox in nexus-console, proxies Nexus API calls, and serves as the
experiment bed for context window management, compaction, and model continuity.

## Why
The current messagebox connects to agent_chat.py which spawns opencode subprocesses.
Operator will use direct provider API calls (via tackle's inference module) instead,
giving us full control over context, prompting, and API access. It's the unified
"face" of Nexus across all UIs.

## Architecture

```
nexus-console (MessageBox)
    │
    ▼
python/operator/           ← new service (port 3018)
    ├── server.py           HTTP + SSE server
    ├── operator.py         Core logic: context management, inference, API proxy
    ├── chat_store.py       Prompts/responses table access
    └── api_proxy.py        conduit/nebula/terrain API proxy
    │
    ├── uses ──→ python/tackle/inference.py   (call_llm)
    ├── uses ──→ python/tackle/db.py          (role config)
    └── writes to ──→ PostgreSQL (operator.prompts_responses)
```

## Steps

### 1. Database: Create Operator role config
- Insert `operator` config_bundle entry in `tackle.config_bundle`
- Model: `mod-1783906424536` (Nemotron 3 Super, `nvidia/nemotron-3-ultra-550b-a55b`)
- Provider: `prov-1783906359513` (Nvidia API)
- Priority 0 with fallback to `mod-big-pickle`

### 2. Database: Create prompts/responses table
- Create `operator.prompts_responses` table:
  - `id` UUID PK
  - `session_id` TEXT
  - `role` TEXT (which model answered)
  - `user_message` TEXT
  - `model_response` TEXT
  - `model_identifier` TEXT (which model was used)
  - `tokens_in` INT
  - `tokens_out` INT
  - `latency_ms` INT
  - `created_at` TIMESTAMPTZ
  - `metadata` JSONB (for future: compaction info, context window state)
- Index on `session_id` and `created_at`

### 3. New project: `python/operator/`
- `__init__.py` — package init
- `server.py` — HTTP server (ThreadingHTTPServer) on port 3018
  - `POST /chat` — accept message, run inference, return session_id
  - `GET /chat/stream/<session_id>` — SSE stream of response
  - `GET /chat/sessions` — list active sessions
  - `GET /chat/health` — liveness check
  - `POST /api/proxy/<service>` — proxy to conduit/nebula/terrain
- `operator.py` — core Operator logic
  - Builds system prompt (Operator personality)
  - Manages conversation context (messages array)
  - Calls `tackle.inference.call_llm()` with role="operator"
  - Logs to prompts/responses table
- `chat_store.py` — PostgreSQL access for prompts/responses
  - `log_prompt_response(session_id, role, user_message, model_response, ...)`
  - `get_session_history(session_id)` — for context window
  - `get_recent_sessions()` — for sessions list
- `api_proxy.py` — proxy to Nexus services
  - `proxy_to_conduit(path, method, body)` — port 3100
  - `proxy_to_nebula(path, method, body)` — port 3101
  - `proxy_to_terrain(path, method, body)` — terrain port

### 4. Update nexus-console: Rename Assistant → Operator
- In `message-box.service.ts`: change default instance title from "Assistant" to "Operator"
- In `message-box.component.ts`: update any hardcoded "Assistant" references

### 5. Wire up conduit-mcp proxy
- Update conduit-mcp's `AGENT_CHAT_URL` to point to operator service (port 3018)
- Or update agent_chat.py to delegate to operator for the "operator" role

## Files to create
- `python/operator/__init__.py`
- `python/operator/server.py`
- `python/operator/operator.py`
- `python/operator/chat_store.py`
- `python/operator/api_proxy.py`

## Files to modify
- `angular/nexus-console/src/services/message-box.service.ts` — rename Assistant → Operator

## Verification
1. Start operator service: `python3 python/operator/server.py`
2. Test chat: `curl -X POST http://localhost:3018/chat -d '{"message":"Hello"}'`
3. Test SSE: `curl http://localhost:3018/chat/stream/<session_id>`
4. Verify prompts/responses logged to database
5. Open nexus-console, verify messagebox says "Operator"
6. Send message in messagebox, verify response streams back
