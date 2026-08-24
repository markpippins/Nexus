# schemas/migrations/tackle — runtime-loaded migrations (folder hygiene)

The SQL files in this directory are **runtime-loaded migrations** for the
`tackle` schema, applied by `typescript/tackle-srv` at startup (v7–v9
bootstrap steps). They are **not** canonical schema authorities and are **not**
part of the authority matrix — they are declarative DDL/seeds that the service
replays against its own database.

- **Why they live here and not `nexus/sql/`:** `tackle-srv` resolves them at
  runtime via `path.resolve(__dirname, "../../../schemas/migrations/tackle/<file>.sql")`.
  Moving them would break that resolution; marking them as migrations here is
  the safe declaration.
- **Lifecycle:** additive only. These are forward migrations; do not edit
  already-applied files in place (the runtime tracks applied versions).
- **Authority:** the canonical `tackle.memory` / `tackle.role_memory` seed is
  `typescript/tackle-seeds/seed-manifest.json` (see `make seed-guard-test`);
  these SQL files seed personas/tasks/prompts at bootstrap.
