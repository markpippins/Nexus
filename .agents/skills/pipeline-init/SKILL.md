> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
> 
---
name: pipeline-init
description: Creates canonical .pipeline directory structure in a target directory.
---

# Pipeline Init Skill

## Purpose
Creates the physical `.pipeline` workspace. No intent inference, no policy decisions.

## Trigger
When the user says "set up a pipeline" or "initialize pipeline structure" — anything that asks for infrastructure only.

## Constraints
- NO intent inference
- NO user questioning
- NO policy decisions

## Execution
Run the bash script at:
`/home/codex/dev/nexus/.agents/scripts/pipeline-setup.sh <target_directory>`

The `<target_directory>` is the root folder where `.pipeline` (and its subfolders) will be created.

The script is idempotent — running it multiple times on the same target is safe.

## Expected Result
```
.pipeline/
  IMPLEMENTATION_PLAN_RECORD/
  PROMPT_RECORDS/
  RESPONSE_RECORDS/
  WORK_REQUESTS/
    active/
    artifacts/
    complete/
    failed/
    log/
    queued/
```

Nothing else. No `PIPELINE_INTENT.yaml`. No mode changes.
