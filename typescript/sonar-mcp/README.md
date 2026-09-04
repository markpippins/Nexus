# sonar-mcp

MCP server (stdio) wrapping the SonarQube web API for the nexus project —
the agent-facing surface for the night-shift flow: Planner grouping input,
Builder closure loop, Reviewer merge check.

Thin proxy over the same endpoints ballerina `sonar-sync` already proved:
`/api/issues/search`, `/api/hotspots/*`, `/api/issues/*`, and
`/api/qualitygates/project_status`. No direct SQL, no second mirror — the
PG `sonar` schema mirror (sonar-sync) remains canonical for forum
projections; this server goes straight to SonarQube for live, structured
queries and writeback.

## Tools (the six core)

| Tool | Purpose | Night-shift role |
|---|---|---|
| `sonar_search_issues` | Filter by severity/rule/component/new-code/resolution + facets | Planner grouping |
| `sonar_get_hotspot` | Hotspot detail incl. security category | Planner triage |
| `sonar_mark_fp` | Issue → FALSE-POSITIVE transition; hotspot → REVIEWED/SAFE | FP closure |
| `sonar_add_comment` | Comment on an issue | Builder closure notes |
| `sonar_set_tags` | Replace issue tags | Planner triage vocabulary |
| `sonar_quality_gate` | Project gate status | Reviewer merge check |

## Config (env)

```
SONAR_BASE_URL   # default http://vanadium:9000
SONAR_TOKEN      # SonarQube user token; sent as Basic "<token>:" (same
                 # scheme as sonar-sync / ci-gateway). NEVER commit it.
```

The server **loads `.env` from its own checkout at startup** (minimal
loader, never overrides real env). This is the credential surface for
the bridge deployment: `mcp-bridge` spawns this server as a child with
no caller to export secrets, so put `SONAR_TOKEN=...` in
`typescript/sonar-mcp/.env` (gitignored, per-checkout).

## Fleet wiring (mcp-bridge + aggregator)

- Bridge target `MCP_BRIDGE_SONAR_*` on **port 3137** (spawns
  `node_modules/.bin/tsx src/index.ts`, like tackle-prompt-bridge — no
  compile step needed at runtime).
- Aggregator `DEFAULT_SERVICES` entry `sonar-mcp` → `http://localhost:3137`
  (protocol `sse`, same as the other bridge-wrapped MCPs).
- After deploy: restart mcp-bridge + tools-aggregator, run the
  mcp-registry-seeder (upserts `mcp.command_registry`), then the
  slash/ projector.

## Build & run

```bash
npm install
npm run build     # tsc → dist/
node dist/index.js   # stdio MCP server
```

Register in the mcp-registry (terrain) and the mcp-transport-matrix doc
when wiring it into the fleet — stdio transport, like terrain-mcp.

## Note on hotspot keys

Issue and hotspot keys share a format; `sonar_mark_fp` disambiguates by
probing `api/hotspots/show` when `kind` is omitted. Pass `kind`
explicitly when known to skip the probe.
