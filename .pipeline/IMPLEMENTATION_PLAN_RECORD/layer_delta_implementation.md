# Implementation Plan: Daemon CLI and Start Skill (Layer Delta)

## Goal
Modify the `daemon_runtime.py` to support targeted project polling via CLI arguments and create a `start-daemon` skill (acting as an MCP) so the agent can be commanded to launch the daemon dynamically.

## Proposed Implementation

### 1. Update Daemon Runtime
**Target File**: `.agent/scripts/daemon_runtime.py`
- Add `argparse` to accept `--watch-project <path>`.
- Dynamically resolve the `WORK_REQUESTS` paths relative to the provided project path instead of hardcoding `NEXUS_ROOT`.

### 2. Create the Start-Daemon Skill
**Target File**: `.agent/skills/start-daemon/SKILL.md`
Create a skill definition that instructs the agent on how to handle the trigger "start a daemon in project x".
- **Trigger**: "Start daemon in [path/project]"
- **Action**: Use the `run_command` tool to execute `nohup python3 .agent/scripts/daemon_runtime.py --watch-project <path> > daemon.log 2>&1 &` in the background.

## Verification
- We will update the Python script.
- We will log the plan in `WORK_TO_DATE.md`.
