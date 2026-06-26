# Remove localStorage persistence helpers and unused imports

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0099
**Status:** pending

## Goal

Remove all localStorage.getItem/setItem/removeItem calls from DataService. Delete the localStorage auto-save effect(). Remove loadFromStorage(), importDatabase(), exportDatabase(), and seedData() methods. Clean up any remaining localStorage-related imports and helper functions. The app persists via the PostgreSQL API only.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
