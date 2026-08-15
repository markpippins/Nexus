# nexus-broker

Moleculer **worker-tier broker** for the consolidated nexus runtime
(project: "re-home `typescript/*-srv` onto AdonisJS + Moleculer + Redis + MongoDB").

Per binding ruling `D-2026-08-14-002` (two HTTP edges + Moleculer worker tier),
this broker hosts the process-spawning services re-homed from the Express fleet:

- `harness-srv` (Wave 4)
- `pty-srv` (Wave 4)
- `execution-srv` (Wave 4)

Plus any internal actions the two AdonisJS edges (`nexus-control-edge`,
`nexus-data-edge`) call via the bus.

## Topology

- `transporter: null` — all worker services run in-process (single broker).
  When the worker tier outgrows one process, switch to a NATS/Redis
  transporter without touching service code.
- API gateway (`moleculer-web`) on port 4080 exposes broker introspection:
  `GET /api/health`, `GET /api/workers`.

## Services

| Service | Purpose | Status |
|---|---|---|
| `api` | moleculer-web gateway — health + worker introspection | scaffolded |
| `worker` | worker-tier actions (`spawn`/`kill`/`status`/`list`) | scaffolded — handlers land in Wave 4 |

## Run

```bash
npm install
npm run dev        # moleculer-runner --hot --repl
# or
npm run build && npm start
```

## Contract

The broker's HTTP surface is frozen by the TypeSpec contract
`typespec/v1/nexus-broker/` and gated by `reconcile-typescript.py`
(framework `moleculer`).
