# TypeScript Platform Architecture

Inherits from: `../ARCHITECTURE.md`

## Platform Defaults

| Setting | Value |
|---------|-------|
| node.version | 20 |
| typescript.version | 5.x |
| port.range.backend | 8080-8099 |
| port.range.proxy | 3333-3349 |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| mock-broker-service | node.version | 18 | Legacy dependency |

## Services

See parent ARCHITECTURE.md for service topology. This file defines platform-level defaults only.
