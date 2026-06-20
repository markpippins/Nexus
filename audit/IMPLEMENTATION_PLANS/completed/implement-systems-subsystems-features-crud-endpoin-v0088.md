# Implement systems, subsystems, features CRUD endpoints in nebula-srv

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0088
**Status:** pending

## Goal

Implement full CRUD endpoints for the hierarchy tables: GET/POST /api/systems (nested with subsystems+features+folders), POST/PATCH/DELETE /api/subsystems, POST/PATCH/DELETE /api/features. Each GET returns the nested hierarchy shape matching the Angular System[] interface. Color assignment for new subsystems selects first unused color from the palette via a server-side query.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
