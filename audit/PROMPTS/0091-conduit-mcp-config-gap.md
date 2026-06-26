---
project: nexus
session: 2026-06-19
---

# What config is needed to route work through Conduit pipeline

## Summary

Investigated what configuration (not code changes) is needed so the user can
tell agents to put work on the Conduit pipeline. Found the critical gap: the
OpenCode MCP client has no `mcp` server configuration pointing to conduit-mcp
on :3100, so none of the pipeline MCP tools (create_proposed_plan, issue_receipt,
etc.) are available to agents.
