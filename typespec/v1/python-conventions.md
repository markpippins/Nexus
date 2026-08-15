# Python → TypeSpec Conventions

Conventions for reverse-engineering `python/` services into TypeSpec
contracts (parallel to `typescript-conventions.md`). These are the rules the
`scripts/reconcile-python.py` reconciler enforces.

## Goal

For every Python service under `python/`, produce a TypeSpec contract that
covers its full HTTP route surface (REST services) or MCP tool catalog
(MCP servers). The reconciler mechanically diffs the two and exits 0 only
when coverage is complete.

## Directory layout

```
typespec/v1/<service>/python/
  operations.tsp    # route/tool operations (scanned by the reconciler)
  models.tsp        # request/response models (must contain no route/verb decorators)
  main.tsp          # imports models + operations, declares the @service
```

`<service>` is a directory-derived name under `python/`, e.g. `conduit-kernel`
(`python/conduit/app`), `fs-crawler` (`python/fs/fs-crawler`), `losm-host`
(`python/vision/losm-host`), `tackle-mcp` (`python/tackle`), `rover`
(`python/rover`). Nested source trees collapse to a single hyphenated service
name; see `python-services.md` for the authoritative mapping.

## REST services

- **One op per route.** Every declared route gets a single operation.
- **Flat full-path `@route` decorators.** Put the complete path in one
  `@route("<path>")`; do NOT nest an interface-level route plus a relative
  operation route.
- **Verb decorator** (`@get` / `@post` / `@put` / `@patch` / `@delete` /
  `@head` / `@options`) on the line immediately after (or same line as) the
  `@route`.
- **Path params:** FastAPI `{id}` maps to TypeSpec `{id}` with `@path id: string`.
- **Query params:** `@query sender?: string` for optional `?sender=`.
- **Body:** `@body` on the request parameter.

Example:

```typespec
@route("/api/work-requests/{wr_id}")
@get
op getWorkRequest(@path wr_id: string): WorkRequestResponse | ErrorResponse;
```

### Framework-specific extraction

- **`framework: "fastapi"`** (default) — routes are read from
  `@app.<verb>("...")` and `@router.<verb>("...")` decorators. `APIRouter(prefix=...)`
  and `app.include_router(router, prefix=...)` are resolved so the full path is
  recovered (router prefix + include prefix + route path).
- **`framework: "httpserver"`** — routes are read from `http.server`
  (`BaseHTTPRequestHandler`) dispatch: `parsed.path == "/x"` and
  `parsed.path.startswith("/x/")` guards inside `do_GET` / `do_POST`. A
  `startswith("/x/")` guard maps to `/x/{param}`. The handler method
  (`do_GET` / `do_POST`) determines the verb.
- **`framework: "mcp"`** — MCP tools (`@mcp.tool()` + the decorated `def`)
  become operations under `/tools/<tool-name>`.

## MCP servers

Each MCP tool becomes an operation:

```typespec
@route("/tools/<tool-name>")
@post
op <tool-name>(...): ...;
```

`<tool-name>` is the decorated function name following `@mcp.tool()` in the
source (the FastMCP default — the tool name is the function name).

## The manifest is authoritative

`scripts/reconcile-python.py` contains the `MANIFEST` list of services
(`rest` or `mcp`). A service in the manifest with no
`typespec/v1/<service>/python/` directory is reported as `UNMODELED` (not an
error) until its contract exists.

## Shared models

`nats-envelope` is a shared model-only contract (`models.tsp` only, no
`operations.tsp`): the `CanonicalEnvelope` + `Classification` used by the
NATS-backed daemons (`cascade`, `voyager`, `voyager-adapter`). It has no HTTP
surface, so it is NOT in the reconciler manifest; it is imported by name from
other contracts as needed.

## Verification

```bash
# single service (nonzero exit on gaps — gates CI)
python3 typespec/v1/scripts/reconcile-python.py --service timeclock

# full report
python3 typespec/v1/scripts/reconcile-python.py
```

Exit 0 with `COVERAGE COMPLETE` means every declared route/tool has a matching
contract operation.

## Naming

Each contract uses namespace `org.nexus.<service>` (dashes removed), e.g.
`org.nexus.conduitkernel`. Models carry `@doc` summaries; `@format("uuid")`,
`utcDateTime`, and `unknown` are used where the source types warrant.
