# tackle-prompt-bridge — MCP server for live agent personas

> **Transport:** stdio (launched per agent session by opencode / `mcp-bridge`)
> **Source:** `src/index.ts`
> **Pair with:** `tackle-prompt-sync-srv` (port 3501, populates the `prompt:*` Redis cache this bridge reads from)

`tackle-prompt-bridge` exposes the per-role prompt templates stored in
`tackle.prompts` as **MCP prompt resources** (not tools). Live
`.opencode/agents/<role>.md` files are being rewritten to delegate persona
loading to this bridge: instead of inlining a static persona body into the
markdown file, the agent asks the bridge `prompts/get {role}/opencode-persona`
at launch time and substitutes the returned template into its system prompt.

This decouples persona authorship (a PG row in `tackle.prompts`) from the
agent-launch harness (the `.md` file becomes a thin pointer).

---

## What it exposes

The bridge implements two MCP methods:

### `prompts/list`
- Optional `role` argument scopes to a single role. If omitted, enumerates
  all cached roles by scanning `prompt:idx:*` in Redis.
- Returns one prompt per `(role, slug)` template, with `name = "{role}/{slug}"`
  so a single `prompts/get` can resolve it without out-of-band role state.

### `prompts/get`
- `name` MUST be `"{role}/{slug}"`.
- Returns the raw `body_md` from `tackle.prompts` as a `user`-turn text
  message, plus a `_tackle` metadata block containing `parameter_schema`,
  `version`, `tags`, and timestamp fields.
- **Parameter substitution is deliberately the caller's responsibility.**
  The same template is reused across many task scopes with different
  `{placeholder}` bindings; doing per-scope rendering inside the bridge
  would lock the template to one task. We surface `parameter_schema` so the
  caller knows which placeholders the body expects.

---

## Why prompts (not tools)?

Per the MCP spec, **prompts** are reusable content templates that a client
**renders and injects** into a conversation. **Tools** are imperative
functions the client **calls** and consumes the return value of. Persona
loading is a render-and-inject operation, not a query — the bridge therefore
uses the prompts capability, matching how opencode and other MCP clients
model "give me a system prompt to start with".

---

## Architecture

```
                 ┌──────────────────────────────────────┐
                 │         opencode agent runtime        │
                 │  .opencode/agents/<role>.md (pointer) │
                 └─────────────────┬────────────────────┘
                                   │ stdio (spawn)
                                   ▼
                 ┌──────────────────────────────────────┐
                 │       tackle-prompt-bridge           │
                 │       (this server, stdio)           │
                 └─────────────────┬────────────────────┘
                                   │ read prompt:*
                                   ▼
                            ┌─────────────────┐
                            │     Redis       │
                            │  prompt:* keys  │
                            └────────┬────────┘
                                     │ populated by
                                     ▼
                 ┌──────────────────────────────────────┐
                 │ tackle-prompt-sync-srv (:3501)        │
                 │ reads tackle.prompts + tackle.tasks   │
                 └──────────────────────────────────────┘
```

The bridge is **read-only against Redis** — it never writes. The sync server
is the single writer to the `prompt:*` and `task:*` namespaces.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_REDIS_URL` | `redis://localhost:6379` (falls back to `MEMORY_REDIS_URL`) | Redis connection string. Must match `tackle-prompt-sync-srv`. |

---

## Example invocation (opencode MCP config)

```jsonc
// .opencode/mcp.json (or wherever opencode reads MCP servers)
{
  "tackle-prompt-bridge": {
    "type": "stdio",
    "command": "tsx",
    "args": ["nexus/typescript/tackle-prompt-bridge/src/index.ts"]
  }
}
```

A live `engineer.md` agent can then load its persona at turn start:

```
prompts/get { name: "engineer/opencode-persona" }
```

---

## Graceful degradation

- If Redis is down at launch, `lazyConnect: true` keeps the bridge from
  hanging. `prompts/list` returns an empty list; `prompts/get` errors
  loudly with a message that points to `POST /refresh` on the sync server.
- The `.opencode/agents/<role>.md` pointer files should retain a **fallback
  note** instructing the agent to fall back to a minimal inline persona
  when the bridge is unreachable, so a Redis outage never hard-bricks
  agent launch.

---

## Source File Map

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP Server, `prompts/list` + `prompts/get` handlers, stdio transport |
| `src/redis.ts` | Redis connection + key helpers (mirrors sync server's schema) |
