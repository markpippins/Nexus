# pty-srv — WebSocket PTY Gateway

> **Port:** 3120
> **Endpoint:** `ws://localhost:3120`
> **Shell:** `$SHELL` (default `/bin/bash`)

`pty-srv` is a **WebSocket-only** service: it exposes an interactive PTY
terminal gateway using `ws` + `node-pty`. There are **no REST routes** — the
API is the WebSocket upgrade surface. It does serve a minimal HTTP health
endpoint alongside the WS server.

## WebSocket protocol

Each connection spawns a fresh shell (cwd = `$HOME`, `TERM=xterm-256color`).

**Client → server** (JSON messages):

```json
{ "type": "input", "data": "<keystrokes>" }
{ "type": "resize", "cols": 120, "rows": 40 }
```

Raw (non-JSON) text messages are written to the shell as-is.

**Server → client:**

- raw terminal output (VT/xterm escape sequences) for the spawned shell
- the socket closes when the shell exits

## Health

The bundled HTTP server answers `GET /health` on the same port (HTTP, not WS)
with a JSON status payload.

## Documentation note

Because pty-srv exposes no REST routes, no `openapi.yaml`/`API.md` are
generated for it (the `nexus/tools/api-docs` generator skips it).
