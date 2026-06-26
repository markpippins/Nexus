---
prompt: "0091"
response: "0003"
title: Fixed conduit-mcp MCP server config gap
session: 2026-06-19
---

## Finding

The critical gap was in `~/.config/opencode/opencode.json` — no `mcp` section
pointing to conduit-mcp. The OpenCode MCP client therefore never connected to
conduit-mcp's SSE stream, so none of the 18 pipeline MCP tools were available
to any agent.

## Fix Applied

Added to `~/.config/opencode/opencode.json`:

```json
"mcp": {
  "conduit-mcp": {
    "type": "remote",
    "url": "http://localhost:3100",
    "enabled": true
  }
}
```

This registers conduit-mcp as a remote MCP server. OpenCode will connect on
next session start and expose all pipeline tools (`create_proposed_plan`,
`promote_plan`, `issue_receipt`, `query_conduit_state`, `delete_plan`, etc.)
to every agent.

## Remaining Configuration Issues (optional)

| Issue | Detail |
|---|---|
| 3 duplicate Temporal workers | PIDs 108175, 380675, 1560904 all claim `--role all`, causing races. Recommend keeping one. |
| Builder's top-priority models lack API keys | `mod-qwen3.7-max` (p0), `mod-qwen-coder-via-opencode` (p1) both need keys. Working model is `mod-qwen-coder` via `harn-ollama-sdk` (p2). |
| Planner/Reviewer use `prov-opencode-go` | Same empty-key problem for `mod-qwen3.7-max`. Their only fallback is `mod-big-pickle` (free, via `prov-opencode`). |
