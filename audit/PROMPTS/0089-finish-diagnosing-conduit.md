---
prompt: 0089
title: Finish diagnosing Conduit
session: 2026-06-19
project: conduit
mcp_ref: "0001"
---

## Summary

User asked to start python/conduit and typescript/conduit-mcp servers. Both
are now running (conduit-mcp on :3100, Temporal worker active). User also
requested that all prompts go to audit/PROMPTS and all responses to
audit/RESPONSES going forward. Next step is to finish diagnosing Conduit
issues.

## Conversation Context

- Added nebula-rms view mode, fixed conduit-ui port (4200→4201), duality port
  (3000→3002). Started duality-ui on :3002 and plurality-ui on :3001.
- conduit-mcp started successfully on :3100. Python Temporal worker running.
- Old pipeline state shows failed/expired tickets and circuit breaker trips.
