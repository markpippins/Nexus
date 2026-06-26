# hello world — emit verification output from Nexus pipeline

**Project:** nexus
**Plan Number:** 0120
**Status:** pending
**Prompt:** 0087

## Goal

Emit a hello-world verification message confirming the Nexus WorkRequest pipeline processes tasks end-to-end. Output shall be written to a timestamped verification file in the workspace root and printed to stdout.
## Files Affected

- /home/codex/dev/nexus (workspace root — no source modifications)
- /home/codex/dev/nexus/output.json (candidate output target, already exists)
## Acceptance Criteria

### 1. A hello-world message is emitted to stdout confirming pipeline is operational
### 2. A verification output file is created/populated in the workspace root
### 3. The message references the working directory (/home/codex/dev/nexus)
### 4. No existing source files are modified — verification-only task
### 5. Pipeline state transitions correctly: plan 0120 moves pending → active → completed without errors
## Dependencies

- None — standalone verification task with no blocking deps