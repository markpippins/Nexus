# User Access Service

Inherits from: `../../../ARCHITECTURE.md` (platform) → `../../ARCHITECTURE.md` (root)

## Service

| Setting | Value |
|---------|-------|
| Name | user-access-service |
| Framework | Helidon MP |
| Port | 9093 (explicit) |
| Java | 17 (override — Helidon MP compatibility) |

## Dependencies

| Service | URL | Source |
|---------|-----|--------|
| Service Registry | http://localhost:8085 | inherited |

## Overrides

| Setting | Value | Reason |
|---------|-------|--------|
| java.version | 17 | Helidon MP compatibility |
