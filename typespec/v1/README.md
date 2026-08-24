# typespec/v1 — TypeSpec source of truth (single source per service)

TypeSpec specs for the Nexus service surface. Each `*-broker` / `*-registry`
namespace is the single source of truth for its wire contract; generated
artifacts (OpenAPI, client SDKs) are projections and are **never** committed as
authoritative (see `schemas/projections/projection-manifest.jsonld` for the
checked emit-target map and `make contract-audit` for enforcement).

## Folder conventions (Wave 4 folder hygiene)

| Path | Policy |
|---|---|
| `core/` | **Shared model library, NOT a service.** Canonical DTOs other namespaces import. No routes, no `@service`. |
| `staging/` | **Generated output staging.** Never hand-edited; contents are disposable. Keep the `.gitkeep` so the dir exists; do not commit generated files here. |
| `tsp-output/` | Generated emitter output (per `tspconfig.yaml`) — gitignored. |
| `node_modules/` | **Disposable.** Installed via `npm ci` from `package.json`; never commit or depend on it surviving. |
| `main.tsp` | Root spec that references the namespace projects. |

## Emit targets

The authoritative map of source → emitted artifact lives in
`schemas/projections/projection-manifest.jsonld` (executable `verify`
directives; `regenerate` mode ready for when the emitters are wired).
`tspconfig.yaml` files define emitter output dirs; the manifest is the
checked contract that keeps them honest.

## Compile check

```bash
cd typespec/v1 && npx tsp compile core/main.tsp --no-emit
```
