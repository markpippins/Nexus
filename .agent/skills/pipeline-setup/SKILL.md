>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: pipeline-setup
description: Orchestrates full pipeline setup — runs pipeline-init then pipeline-intent in sequence.
---

# Pipeline Setup Skill

## Purpose
Orchestrates the complete pipeline setup workflow: creates the physical workspace (`pipeline-init`) then establishes the Pipeline Intent Contract (`pipeline-intent`).

This is a sequencing skill. It does no infrastructure work and no intent inference itself.

## Trigger
When the user says "set up a pipeline for \<target\>", "initialize a pipeline", or "prepare a pipeline workspace".

## Execution

### Step 1: Run pipeline-init
Invoke `pipeline-init` on the target directory to create the canonical `.pipeline` directory structure.

### Step 2: Run pipeline-intent
Invoke `pipeline-intent` on the same target to analyze context and write `PIPELINE_INTENT.yaml` plus `pipeline-mode.json`.

## Expected Result
- `.pipeline/` directory structure
- `.pipeline/PIPELINE_INTENT.yaml` with valid, normalized intent
- `.agent/pipeline-mode.json` with mode + intent_source
