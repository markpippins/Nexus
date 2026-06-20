---
project: nexus
date: 2026-06-19
in_response_to: 2026-06-19T04-architecture-project-coverage
---
## Architecture Project Coverage — Report Generated
Wrote `nexus/audit/ENGINEERING/reports/ARCHITECTURE_PROJECT_COVERAGE.md`. Findings:
- 23 active projects on disk are NOT in ARCHITECTURE.md.
- 5 documented projects live at non-existent paths (`nexus-ui/...`, `python/ingest/html-importer/`).
- 3 documented projects exist at the wrong path (e.g., `python/vision/losm/` is actually 5 components; React/Vite apps are under `angular/`, not `nexus-ui/`).
- Big omissions: `typescript/nebula-mcp`, `typescript/peb-mcp`, `typescript/terrain-mcp`, `python/conduit`, `python/rover`, `python/voyager`, plus all five LOSM components.
- Doc's stated scope is `jvm/**, typescript/**` but the active surface is wider (Python runtime, additional MCP servers).
