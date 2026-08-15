# Python Services — Reverse-Engineering Inventory

Authoritative classification of `python/` for the TypeSpec reverse-engineering
effort. Each entry maps the source tree to its contract under
`typespec/v1/<service>/python/` and to the framework the reconciler uses.

## REST services (HTTP surface → full contract)

| Service | Source root | Framework | Surface |
|---|---|---|---|
| `conduit-kernel` | `python/conduit/app` | fastapi | WRP kernel REST API (sessions/breaker/receipts/admin/delta/replay/state), port 3103 |
| `fs-crawler` | `python/fs/fs-crawler` | fastapi | File-system crawler API (libraries, scan, files, rules, duplicates) |
| `fs-crawler-adapter` | `python/fs/fs-crawler-adapter` | fastapi | Broker execute adapter (`POST /api/broker/execute`) |
| `losm-host` | `python/vision/losm-host` | fastapi | LOSM host API (work-requests, branches, artifacts, receipts, kernel), port 8006 |
| `vision-srv` | `python/vision-srv` | fastapi | Vision REST API (work-requests, branches, artifacts, DAG), port 8003 |
| `timeclock` | `python/timeclock` | fastapi | Timeclock API (clock-in/out, heartbeat, active, log, stats), port 3600 |
| `substance` | `python/substance` | fastapi | Segment Sets + domain links API, port 3115 |
| `peb-kernel` | `python/peb-kernel` | fastapi | PEB admission API (`POST /api/v1/peb/transaction`), port 8080 |
| `address-tts` | `python/address/tts` | httpserver | TTS REST API (synthesize/speak/audio/health), port 8600 |
| `operator-svc` | `python/operator_svc` | httpserver | Operator host API (chat, chat/stream, sessions, proxy), port 3018 |

## MCP servers (tool catalog → full contract)

| Service | Source root | Framework | Tools |
|---|---|---|---|
| `tackle-mcp` | `python/tackle` | mcp | `planner-mcp` (FastMCP) — 10 candidate/evidence tools, port 3400 |
| `rover` | `python/rover` | mcp | `rover-mcp` (FastMCP) — 5 transcript/extraction tools |

## Shared model contracts (no HTTP surface)

| Service | Source root | Notes |
|---|---|---|
| `nats-envelope` | `python/nats_envelope` | `CanonicalEnvelope` + `Classification` — the shared event envelope for the NATS bus |

## NATS daemons / workers (no HTTP surface — contract = `nats-envelope`)

| Directory | Notes |
|---|---|
| `python/cascade` | Pure event bus loop: ingest → validate → sequence → persist → publish (NATS) |
| `python/voyager` | Filesystem acquisition layer (NATS publisher of observation/hint/span) |
| `python/voyager-adapter` | Voyager → Semantics adapter (NATS subscriber, `nexus.fs.v1.*`) |

## Libraries / batch jobs (no external contract)

| Directory | Notes |
|---|---|
| `python/ir` | Intermediate representation library (lease/state/event DAGs) |
| `python/nexus_core` | Core library (harness launcher, WRP compile/states/identity) |
| `python/meep` | Replay engine / spec compiler library |
| `python/nats_envelope` | Envelope library (contracted above) |
| `python/nebula-mcp-client` | MCP client library (client, not a server) |
| `python/heartbeat` | Service-registry heartbeat client (outbound only) |
| `python/auditor` | Claim-extractor batch job |
| `python/epistemologist` | Extractor batch job |
| `python/steward` | One-off graph migration script |
| `python/util` | Utility script (`strip_timestamps`) |
| `python/scripts` | Ad-hoc scripts |

## Contract status

- Full contracts (models + operations): the 10 REST services + 2 MCP servers
  above.
- Model-only contract: `nats-envelope`.
- Libraries/batch jobs: accounted for in this inventory; no HTTP/MCP surface to
  contract. Their data models are captured opportunistically in the shared
  `nats-envelope` contract (for the NATS daemons) and remain internal otherwise.
