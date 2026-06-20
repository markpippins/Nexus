---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T01-rover-mcp-build
---

## rover-mcp — Built & Tested

Created `nexus/python/rover/rover_mcp_server.py`: an MCP server (FastMCP, stdio transport) that replaces the Qwen/Ollama extraction step.

### Architecture

Queue-based agent-in-the-loop pattern:

1. `rover_submit_transcript(path)` → runs Docling + chunks → returns job_id
2. `rover_get_pending_chunk(job_id)` → returns next unprocessed chunk + system prompt
3. `rover_submit_extraction(job_id, chunk_index, agenda_json)` → validates against Pydantic schema, stores result
4. `rover_compile_agenda(job_id, output_path)` → assembles all extractions into final Markdown
5. `rover_job_status(job_id)` → reports progress

### Files changed/created

- **New:** `nexus/python/rover/rover_mcp_server.py` (MCP server, 5 tools)
- **New:** `nexus/python/rover/requirements-mcp.txt` (mcp dependency)
- **New:** `nexus/python/rover/test_rover_mcp.py` (9 smoke tests, all passing)
- **Changed:** `nexus/python/rover/harvest_pipeline.py` — made `docling` and `ollama` imports lazy so MCP server can load without those heavy packages

### Test results

All 9 tests pass: tool registration, unknown job_id rejection, bad JSON rejection, valid extraction flow, pending chunk retrieval, compile_agenda output, job_status, done-state reporting.

### Docling status

Still downloading (nvidia cublas wheel ~423MB). Once installed, the full pipeline can run end-to-end via MCP tools.
