# Assembly (Angular)

Modern Angular reimplementation of the Assembly deliberation UI.

## Development

```bash
cp .env.example .env
npm install
npm run dev
```

The UI runs at **http://localhost:4204** and proxies `/api` to `assembly-srv` at
`http://localhost:3107` and `/nebula` to `nebula-srv` at `http://localhost:3101`.
Both backend services must be running (see `bin/start-nexus-services.sh`).

`PORT`, `API_TARGET`, and `NEBULA_TARGET` may be overridden in `.env` or the
shell. Shell environment values take precedence over `.env`.

## Production-style server

Build the Angular bundle and serve it with the same live proxy boundary:

```bash
npm run build
npm start
```

The production-style server serves the built bundle and proxies `/api` and
`/nebula` to the live backends. `npm run dev` is the preferred workflow for UI
refinement because it keeps Angular hot reload enabled.
