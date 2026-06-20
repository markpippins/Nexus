---
project: pipeline
session: 2026-06-09
---

## Summary

Chat server returns 502 when user sends a message via the message box. The `/chat/send` endpoint in pipelines-mcp proxies to the agent chat server at `http://localhost:3101`. When that server is unreachable or returns non-JSON error pages, the proxy returns 502. Fix both the proxy's error handling and the agent chat server's error responses.
