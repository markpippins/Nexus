# Rewrite DataService CRUD methods to use HTTP with optimistic updates

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0092
**Status:** pending

## Goal

Rewrite all DataService mutation methods (addSystem, updateSystem, deleteSystem, addSubsystem, updateSubsystem, deleteSubsystem, addFeature, updateFeature, deleteFeature, addRequirement, updateRequirement, deleteRequirement, updateRequirementsBatch, addWorkSession, updateWorkSession, addSystemFolder, removeSystemFolder) to call HTTP endpoints with optimistic signal updates (mutate immediately, rollback on error). Add loading/error signals for UI feedback. Replace loadFromStorage() with fetchSystems() HTTP call on init.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
