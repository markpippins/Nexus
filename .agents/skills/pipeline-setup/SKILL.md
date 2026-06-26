> **Historical reference (archived).** This document describes the former Nexus WRP
> architecture, which has been superseded by the Conduit pipeline system. The active
> systems are **conduit-mcp** (plan lifecycle, pipeline state) and **nebula-mcp**
> (agent records, requirements, database-first persistence). The PostgreSQL database
> is the canonical store for all agent artifacts. The filesystem (`nexus/audit/`) is
> an on-demand markdown projection. See `/home/codex/dev/AGENTS.md` for the current
> architecture.
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
- `.agents/pipeline-mode.json` with mode + intent_source
