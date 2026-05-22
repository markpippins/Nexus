# JVM Platform Architecture

Inherits from: `../ARCHITECTURE.md`

## Platform Defaults

| Setting | Value |
|---------|-------|
| java.version | 21 |
| spring-boot.version | 3.5.0 |
| quarkus.version | 3.15.1 |
| helidon.version | 4.x |
| maven.version | 3.9.x |
| port.range | 8080-8099 |

## Exceptions

| Project | Setting | Value | Reason |
|---------|---------|-------|--------|
| helidon/user-access-service | java.version | 17 | Helidon MP compatibility |

## Services

See parent ARCHITECTURE.md for service topology. This file defines platform-level defaults only.
