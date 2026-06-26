# Implement localStorage migration flow on first load

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0095
**Status:** pending

## Goal

On app init, check if localStorage has nebula_systems/nebula_requirements/nebula_sessions data. If yes, POST /api/import to migrate it to PostgreSQL, then clear localStorage keys. If no localStorage data, POST /api/seed to seed default example data. Remove the localStorage auto-save effect() and all localStorage.setItem/getItem calls from DataService.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
