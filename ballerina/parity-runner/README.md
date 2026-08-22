# Parity Runner — dual-target conformance suite

One generated-client test suite, executed against **two live stacks**:

| Target | Where | Purpose |
|---|---|---|
| `legacy`  | vanadium (rehomed TS tier, `192.168.1.82`) | reference behavior |
| `candidate` | local adonisjs/moleculer (replacement stack) | cutover candidate |

The runner issues the **same read-only requests** to both, then diffs:
status codes, envelope shape (keys), and payload invariants. Any divergence
is a parity failure blocking the cutover gate (see agent record ab19f4c7).

## Client generation

Clients are **generated**, never hand-written:

```bash
# from a committed service spec:
bal openapi -i ../typescript/<svc>/openapi.yaml --mode client \
    -o modules/<svc>_client
```

Regenerate after spec changes only; toolchain versions pinned.

## Configuration

`Config.toml` (gitignored) carries the two base URLs + auth tokens:

```toml
[parity]
legacyBase   = "http://192.168.1.82:3107"   # assembly-srv on vanadium
candidateBase = "http://localhost:3107"
```

## Status

- [x] scaffold
- [x] chain proof: TypeSpec-emitted OpenAPI → bal openapi → compiled client (role-memory-srv)
- [ ] read-only GET comparisons for first service batch
- [ ] envelope-diff reporting
- [ ] Jenkins job wiring (nightly + pre-cutover)
