# TypeSpec Integrations — third-party API contracts

Contracts for **external** systems that the Ballerina moat fronts. These are
deliberately **not** part of `typespec/v1`: v1 is the authority for nexus-owned
services; this project models the outside world so the boundary stays typed.

| Subproject | Models | Consumer |
|---|---|---|
| `jenkins/`    | Jenkins REST API (jobs, builds, queue) + webhook payloads    | ballerina/ci-gateway, parity-runner |
| `sonarqube/`  | SonarQube Web API (quality gates, issues, measures) + webhooks | ballerina/ci-gateway, parity-runner |

## Flow

```
typespec/integrations/*.tsp
  └─ tsp compile . (openapi3 emitter)
       └─ openapi.yaml ── bal openapi --mode client ──▶ generated Ballerina clients
```

Emitters and toolchain versions are pinned. Regenerated output is committed so
drift is reviewable.
