# TypeScript → TypeSpec Conventions

Conventions for reverse-engineering `typescript/` services into TypeSpec
contracts (step 1 of the monolith cutover). These are the rules the
`scripts/reconcile-typescript.py` reconciler enforces.

## Goal

For every TypeScript service under `typescript/`, produce a TypeSpec contract
that covers its full HTTP route surface (REST services) or MCP tool catalog
(MCP servers). The reconciler mechanically diffs the two and exits 0 only when
coverage is complete.

## Directory layout

```
typespec/v1/<service>/typescript/
  operations.tsp    # route/tool operations (scanned by the reconciler)
  models.tsp        # request/response models (must contain no route/verb decorators)
```

`<service>` is the directory name under `typescript/`, e.g. `ui-event-bus`,
`nebula-srv`, `tackle-mcp`.

## REST services

- **One op per route.** Every declared route gets a single operation.
- **Flat full-path `@route` decorators.** Put the complete path in one
  `@route("<path>")`; do NOT nest an interface-level route plus a relative
  operation route. The reconciler does not concatenate nested routes — it
  tracks only the most recent `@route` literal.
- **Verb decorator** (`@get` / `@post` / `@put` / `@patch` / `@delete` /
  `@head` / `@options`) on the line immediately after (or same line as) the
  `@route`.
- **Path params:** Express `:id` maps to TypeSpec `{id}`, and the operation
  parameter carries `@path id: string`.
- **Query params:** `@query sender?: string` for optional `?sender=`.
- **Body:** `@body` on the request parameter.

Example:

```typespec
@route("/api/events/clients/{id}")
@delete
op disconnectClient(@path id: string): DisconnectResult | ErrorResponse;
```

## MCP servers

Each MCP tool becomes an operation:

```typespec
@route("/tools/<tool-name>")
@post
op <tool-name>(...): ...;
```

`<tool-name>` is the literal name passed to `server.tool("<tool-name>", ...)`
(or `registerTool("<tool-name>", ...)`) in the source.

## The manifest is authoritative

`scripts/reconcile-typescript.py` contains the `MANIFEST` list of services
(`rest` or `mcp`). A service in the manifest with no
`typespec/v1/<service>/typescript/` directory is reported as `UNMODELED` (not
an error) until its contract exists.

## Framework-specific extraction

Most services are plain Express and the reconciler's default (`framework:
"express"`) extraction applies. The consolidated-stack entries use explicit
framework routing:

- **`framework: "adonisjs"`** — routes are read from `router.<verb>('<path>')`
  declarations. The AdonisJS catch-all `router.any('/*')` is modeled as a
  single op with `@route("/{path}")` plus any concrete verb; the reconciler
  treats the source `ALL /{path}` as covered by any verb on that path
  (TypeSpec has no verb-neutral op).
- **`framework: "moleculer"`** — routes are read from moleculer-web `routes`
  blocks: the `path` prefix is concatenated with each `aliases` key's
  `"METHOD /sub-path"` to form the full route.
- Manifest entries may set `src_root` to point at source that lives outside
  `typescript/<name>/src` (e.g. `adonisjs/broker-gateway-proxy`, `moleculer/search`).

## Verification

```bash
# single service (nonzero exit on gaps — gates CI)
python3 typespec/v1/scripts/reconcile-typescript.py --service ui-event-bus

# full report
python3 typespec/v1/scripts/reconcile-typescript.py
```

Exit 0 with `COVERAGE COMPLETE` means every declared route/tool has a matching
contract operation.

## Naming

Each contract uses namespace `org.nexus.<service>` (dashes removed), e.g.
`org.nexus.uieventbus`. Models carry `@doc` summaries; `@format("uuid")`,
`utcDateTime`, and `unknown` are used where the source types warrant.
