# Agent Role → Audit Folder Mapping\n\n**Role:** architect\n**Type:** report\n**Date:** 2026-06-21 02:12:29.880017+00\n\n# Agent Role → Audit Folder Mapping

Every agent role writes to and reads from specific subdirectories in
nebula-mcp projections. This file defines that mapping so agents know which folders
to use and which folders belong to other roles.

## Directory Layout

```
nebula-mcp 
├── PROMPTS/ ← saved user prompts (origin)
├── RESPONSES/ ← saved agent responses (outcome)
├── PLANS/ ← high-level plans (Planner)
├── IMPLEMENTATION_PLANS/
│ ├── proposed/ ← ideas (Planner)
│ ├── planning/ ← being elucidat\n\n---\n*Auto-generated from agent_records via projection: architecture-reports*