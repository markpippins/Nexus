# Nexus Ballerina Layer

## Purpose

Ballerina is the **moat** between nexus and third-party integrations
("the Web Services Sprawl"): CI systems, quality platforms, external
automations. It is **not** a re-implementation of nexus, and it does not
host core domain services.

The moat has two halves that move together:

1. **Contract split at the TypeSpec level** (decision 2026-08-22):
   - `typespec/v1/*`        — nexus-owned service contracts (authority)
   - `typespec/integrations/*` — third-party API contracts (Jenkins, SonarQube)
   The split keeps third-party surface area out of the core contract set and
   lets each side evolve on its own cadence.

2. **Generated boundaries**: TypeSpec → OpenAPI → `bal openapi --mode client`
   produces typed Ballerina clients. Hand-written Ballerina code is limited
   to orchestration; anything touching HTTP payloads should be generated.

## Layout

| Path | Contents |
|---|---|
| `parity-runner/` | Dual-target conformance runner: one generated-client test suite executed against both the rehomed legacy tier (vanadium) and the replacement stack (adonisjs/moleculer). Feeds the cutover gate. |
| `ci-gateway/`    | (planned) REST surface + webhook listeners aggregating Jenkins/SonarQube for downstream UI integration. |

## Conventions

- Generated code lives in `generated/` inside each package and is regenerated
  from specs — never hand-edited.
- Secrets/config via `Config.toml` (gitignored) + environment; never committed.
- Emitter/toolchain versions are pinned; toolchain drift is treated like spec drift.

---
*Moved from `jvm/ballerina/` 2026-08-22 (admin decision) — same moat philosophy,
own top-level home decoupled from the JVM tier.*
