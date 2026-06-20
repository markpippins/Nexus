---
prompt: "0090"
response: "0002"
title: Audit folder role mapping and plan relocation
session: 2026-06-19
---

## Summary

Moved two plans from `graph/IMPLEMENTATION_PLANS/pending/` to
`nexus/audit/IMPLEMENTATION_PLANS/pending/` and removed the now-empty
`graph/IMPLEMENTATION_PLANS/` directory tree. Created
`nexus/audit/AGENT_FOLDER_MAP.md` documenting the role→folder mapping
for all 10 agent roles across all harness types.

## What Changed

### Relocated
- `graph/IMPLEMENTATION_PLANS/pending/diagnose-and-fix-conduit.md`
  → `nexus/audit/IMPLEMENTATION_PLANS/pending/diagnose-and-fix-conduit.md`
- `graph/IMPLEMENTATION_PLANS/pending/conduit-pipeline-smoke-test-v0135.md`
  → `nexus/audit/IMPLEMENTATION_PLANS/pending/conduit-pipeline-smoke-test-v0135.md`
- Removed `graph/IMPLEMENTATION_PLANS/` (now empty)

### Created
- `nexus/audit/AGENT_FOLDER_MAP.md` — role→folder mapping for all 10 roles

### Preserved
- Prompt→response→plan chain: 0089 (prompt) → 0001 (response) → diagnose-and-fix-conduit.md (plan)

## Role→Folder Design

| Role | Primary Write Folders |
|------|----------------------|
| planner | PROMPTS/, PLANS/, IMPLEMENTATION_PLANS/proposed+planning/, SPECS/ |
| builder | IMPLEMENTATION_PLANS/pending+active/, CHANGES/committed/, RESPONSES/ |
| reviewer | IMPLEMENTATION_PLANS/completed/, CHANGES/reviewed+flagged/ |
| critic | INSPECTIONS/warnings+processed/ |
| analyst | INSPECTIONS/triage/, ANALYSIS/ |
| architect | ARCHITECTURE/, SPECS/ |
| inspector | INSPECTIONS/errors+todo/ |
| engineer | REQUIREMENTS/, ENGINEERING/, RESPONSES/ |
| nexus-validator | read-only, ANALYSIS/ |
| archivist | HISTORY/, CROSS_REFERENCES.md |
