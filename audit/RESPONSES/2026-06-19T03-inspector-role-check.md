---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T03-inspector-role-check
---
## Inspector Role — Special Directions Found
The role spec lives at `/home/codex/dev/.opencode/agents/inspector.md`. Caveat: the file's own header labels the Nexus WRP architecture as *aspirational/inactive* and points to Conduit as the live system. Special directions: BUILD→START→SMOKE pipeline, one report per project, one error item per report, hard I/O boundaries (only `nexus/.conduit-data/INSPECTIONS/*`), bash allowlist (mvn/npm/pip/cargo/go/npx/bun/ls/cat/cd/python/which/source/.venv-python), `task: deny`, 1h lock staleness. Migration in plan #0083 (filesystem→MCP) is the more current operational reference.
