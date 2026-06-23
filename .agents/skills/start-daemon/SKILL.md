> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: start-daemon
description: MCP-like skill to launch the background daemon runtime for a specific project.
---

# Start Daemon Skill

## Purpose
Provides a natural language interface (MCP equivalent) to launch the WRP operational daemon targeted at a specific project's pipeline.

## Trigger
When the user says:
- "start a daemon in project X"
- "watch project X"
- "start the builder for X"

## Execution
Use your `run_command` tool to execute the daemon in the background. Ensure you resolve the absolute path to the project first.

**Command structure:**
```bash
nohup python3 /home/codex/dev/nexus/.agents/scripts/daemon_runtime.py --watch-project <ABSOLUTE_PROJECT_PATH> > /tmp/nexus_daemon.log 2>&1 &
```

*(You must use `WaitMsBeforeAsync: 500` and send it to the background so it doesn't block your context).*

## Expected Result
- The daemon begins polling the specified project's `.pipeline/WORK_REQUESTS/queued/` directory.
- Return the command ID to the user so they know it is running in the background.
