# Python PEB Kernel

This package is a Python-native implementation of the Persistent Engineering
Brain (PEB) governance kernel. The Java Spring kernel under
`nexus/jvm/spring/peb-kernel` is the behavioral reference; the contract boundary
is reverse-engineered into `nexus/typespec/v1/peb-kernel`.

## Layout

- `generated/` — output from the Python-only TypeSpec emitter. Regenerate with:
  `npm exec tsp compile peb-kernel/python/main.tsp -- --config peb-kernel/python/tspconfig.yaml`
  from `nexus/typespec/v1`.
- `src/peb_kernel/domain.py` — framework-free entities, enums, and value objects.
- `src/peb_kernel/engine.py` — structural validation, admission routing, and audit lifecycle.
- `src/peb_kernel/hashing.py` — deterministic SHA-256 and Merkle-root computation.
- `src/peb_kernel/store.py` — in-memory and PostgreSQL persistence ports.
- `src/peb_kernel/adapters.py` — Conduit and LOSM HTTP adapters.
- `src/peb_kernel/api.py` — FastAPI boundary matching the TypeSpec transaction contract.

The default test setup uses `InMemoryPebStore`; production startup uses
`PEB_DATABASE_URL` when `PEB_STORE=postgres`.

## Run

```bash
PYTHONPATH=src python -m peb_kernel.main
```

The API listens on port 8098 by default and exposes:

- `POST /api/v1/peb/transaction`
- `GET /actuator/health`

## Verify

```bash
PYTHONPATH=src python -m pytest
python -m compileall -q src tests
```
