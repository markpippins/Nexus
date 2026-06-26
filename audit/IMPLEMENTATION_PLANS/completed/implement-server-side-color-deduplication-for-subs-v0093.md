# Implement server-side color deduplication for subsystem creation

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0093
**Status:** pending

## Goal

Move subsystem color assignment from client-side getUniqueColor() to the server. The POST /api/subsystems endpoint queries existing colors for the system and selects the first unused color from the palette. This prevents race-condition duplicates that would occur with concurrent client-side creation against a shared database.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
