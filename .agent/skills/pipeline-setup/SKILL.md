---
name: pipeline-setup
description: Sets up the standard WorkRequest pipeline directory structure in a target directory.
---

# Pipeline Setup Skill

## Purpose
Initializes a new or existing project folder with the canonical `.pipeline` directory structure required by the WorkRequest compiler.

## Trigger
When the user says "set up a pipeline for <target>", or explicitly requests to initialize the pipeline structure.

## Execution
Run the bash script located at:
`/home/codex/dev/nexus/.agent/scripts/pipeline-setup.sh <target_directory>`

The `<target_directory>` is the root folder where `.pipeline` (and its subfolders) will be created.

## Expected Result
A `.pipeline` folder is created in the target directory containing:
- `IMPLEMENTATION_PLAN_RECORD/`
- `PROMPT_RECORDS/`
- `WORK_REQUESTS/` with its subdirectories (`active`, `artifacts`, `complete`, `failed`, `log`, `queued`).
