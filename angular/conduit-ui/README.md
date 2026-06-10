# Conduit UI — Angular Dashboard

Angular application that renders the conduit pipeline state from the MCP server.
Serves as the visual interface for the work request pipeline.

## Overview

The UI provides a Kanban board showing plans grouped by status columns
(proposed, planning, pending, active, completed, blocked), receipt chains
per plan, and SSE-based live updates. It connects to the Conduit MCP server
at `http://localhost:3100`.

### Features

- **Kanban Board** — Drag-free plan cards grouped by derived status
- **Planner** — Plan creation, editing, promotion, revision, and soft-deletion
- **Sessions Panel** — Real-time active session monitoring with PID, role, and work time
- **Dependency Graph** — Visualize plan dependency relationships
- **Inspection Dashboard** — Browse inspection/blocker reports
- **Analytics Dashboard** — Pipeline metrics (throughput, token usage, cycle times)
- **Prompt Catalog** — Browse captured prompts with lineage tracking
- **Changes View** — Review change reports
- **Archive Browser** — Browse archived plans
- **AI Config** — Manage providers, harnesses, models, and role assignments
- **Agent Status Bar** — Live agent heartbeat monitoring
- **Error Banner** — Global error display with dismissal

## Development Server

```bash
ng serve
```

Navigate to `http://localhost:4400/`. The application automatically reloads
when source files change.

The dev server proxies `/state`, `/tools`, `/events`, `/health`, `/sessions`,
and `/plans/sync` to `http://localhost:3100` (configured in `proxy.conf.json`).

## Building

```bash
ng build
```

Build artifacts go to `dist/`.

## Project Structure

```
src/
├── main.ts
├── app/
│   ├── app.component.ts
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── services/
│   │   ├── conduit.service.ts     # API client for MCP server
│   │   ├── api-config.ts          # API URL configuration
│   │   ├── types.ts               # Shared types
│   │   ├── ai-config.service.ts   # AI config registry management
│   │   ├── keyboard.service.ts    # Keyboard shortcuts
│   │   ├── toast.service.ts       # Toast notifications
│   │   ├── message-box.service.ts # Modal dialogs
│   │   ├── theme.service.ts       # Dark/light theme
│   │   └── global-error.service.ts # Error handling
│   ├── components/
│   │   ├── kanban-board/           # Main plan board
│   │   ├── plan-card/              # Individual plan card
│   │   ├── planner/                # Plan creation/editing
│   │   ├── sessions/               # Session monitoring
│   │   ├── dependency-graph/       # Plan dependency visualization
│   │   ├── inspection-dashboard/   # Inspection reports
│   │   ├── analytics-dashboard/    # Pipeline analytics
│   │   ├── prompt-catalog/         # Prompt audit trail
│   │   ├── changes-view/           # Change reports
│   │   ├── archive-browser/        # Archived plans
│   │   ├── builder-status/         # Builder execution status
│   │   ├── agent-status-bar/       # Agent heartbeat display
│   │   ├── ai-config-dialog/       # AI config management
│   │   ├── overview-dashboard/     # Pipeline overview
│   │   ├── keyboard-help/          # Keyboard shortcut reference
│   │   ├── error-banner/           # Global error display
│   │   ├── empty-state/            # Empty state placeholder
│   │   ├── loading-spinner/        # Loading indicator
│   │   ├── toast-container/        # Toast notification container
│   │   ├── message-box/            # Modal dialog component
│   │   └── message-box-container/  # Dialog overlay
│   └── interceptors/
│       └── error.interceptor.ts    # HTTP error interceptor
└── environments/
    ├── environment.ts
    └── environment.production.ts
```

## Related Projects

- **nexus/python/conduit/** — Cron-driven orchestrator (dispatches work to executors)
- **nexus/typescript/conduit-mcp/** — MCP server (API + SSE event bus, port 3100)

For the full architecture, see [Conduit ARCHITECTURE.md](../nexus/python/conduit/ARCHITECTURE.md).
