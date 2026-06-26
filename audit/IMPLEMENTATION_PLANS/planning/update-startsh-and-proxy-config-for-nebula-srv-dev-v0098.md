# Update start.sh and proxy config for nebula-srv dev workflow

**Project:** nexus-ui/nexus-rms
**Plan Number:** 0098
**Status:** pending

## Goal

Update start.sh to concurrently run ng serve (Angular dev server) and the nebula-srv Express server. Configure proxy.conf.json so /api and /sse requests from the Angular dev server (:4200) proxy to nebula-srv (:3101). Update angular.json to use the proxy config for the serve target.

## Files Affected

- none

## Acceptance Criteria

- [ ] TBD

## Dependencies

- none
