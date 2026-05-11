# peb-context-binding

## Purpose
Prepares the environment for the LLM by computing the `PEB_STATE_HASH` (for long-term memory) and `THOUGHT_CONTEXT_HASH` (for short-term memory), reading all files from `.agent/peb/` and `.agent/thought_context/`, and bundling them with the `UNIVERSAL_READ.md` contract and the appropriate Role Contract.

## Input
- `role_authority` (PLANNER, EXECUTOR, CRITIC)
- `cognitive_mode` (e.g., DEBUG, RESEARCH, REFACTOR)
- `work_request` or `intent`

## Output
- Structurally validated prompt payload with the `PEB READ CONTRACT`, hashes, dynamic role mode, and the temporally continuous `thought_context` appended.
