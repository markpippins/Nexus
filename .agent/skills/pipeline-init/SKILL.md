>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
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
`/home/codex/dev/nexus/.agent/scripts/pipeline-setup.sh <target_directory>`

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
