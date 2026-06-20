---
prompt: "0092"
response: "0004"
title: Applied config cleanup — workers deduped, model priorities reordered
session: 2026-06-19
---

## Changes Applied

### 1. Duplicate Temporal Workers
Killed PIDs 108175 and 380675 (both ~1 day old, running `--role all`).
Kept PID 1560904 (`python -m conduit.temporal.worker`, started this session).

### 2. Model Priority Reordering

Updated `vector.role_models` in PostgreSQL directly. New fallback chains:

| Role | p0 | p1 | p2 |
|------|----|----|----|
| **builder** | `mod-qwen-coder` (ollama-sdk ✅) | `mod-big-pickle` (free) | `mod-qwen-coder-via-opencode` (ollama/opencode) |
| **planner** | `mod-big-pickle` (free) | `mod-qwen-coder` (local) | `mod-qwen3.7-max` (needs key) |
| **reviewer** | `mod-big-pickle` (free) | `mod-qwen-coder` (local) | `mod-qwen3.7-max` (needs key) |
| **critic** | `mod-big-pickle` (free) | `mod-qwen-coder` (local) | `mod-qwen3.7-max` (needs key) |

Builder's full 32-model chain now prioritizes: proven-local → free → local-olama → freebies → key-dependent.

### 3. OpenCode MCP Config (from previous turn)
Added `mcp.conduit-mcp` to `~/.config/opencode/opencode.json` pointing to `:3100`.
Next session start will expose all 18 pipeline MCP tools to every agent.

## Remaining
- If API keys are ever added for `prov-opencode-go` / `prov-openai` / `prov-anthropic`, the priorities should be re-ordered again to prefer them over local models.
