# Assembly (Angular)

Modern Angular reimplementation of the Assembly deliberation UI.

## Development modes

Assembly follows the runtime-mode pattern used by `tackle-ui`:

```bash
cp .env.example .env
npm install
npm run dev
```

Set `ASSEMBLY_MODE=mock` for a backend-free refinement workspace. Mock mode:

- runs the Angular UI at **http://localhost:3000** by default;
- starts an in-memory API fixture server on an internal port;
- serves representative data for the list/detail views;
- supports local forum posts, comments, open questions, forum management, and feed actions;
- requires no Nexus backend services.

Set `ASSEMBLY_MODE=live` when working against Nexus services. Live mode keeps the
terrain-designated **http://localhost:4204** UI port and proxies `/api` to
`assembly-srv` at `http://localhost:3107` and `/nebula` to `nebula-srv` at
`http://localhost:3101`.

`PORT`, `MOCK_API_PORT`, `API_TARGET`, and `NEBULA_TARGET` may be overridden in
`.env` or the shell. Shell environment values take precedence over `.env`.

## Production-style server

Build the Angular bundle and serve it with the selected runtime mode:

```bash
npm run build
ASSEMBLY_MODE=mock npm start
```

The production-style server serves the built bundle and the same mock/live API
boundary. `npm run dev` is the preferred workflow for UI refinement because it
keeps Angular hot reload enabled.
