
# Operating Model - MANDATORY

Before responding to any request:

1. Load `.agent/pipeline-mode.json`
2. Load `.agent/skills/mode-router/SKILL.md`
3. Determine current pipeline mode
4. Route execution through the WorkRequest pipeline
5. Treat skills as executable infrastructure

# Workspace Model

The repository is the source of truth.

Authoritative state lives in:

- `.pipeline/` → execution state
- `.agent/skills/` → executable cognition
- `.agent/context/` → persistent reasoning artifacts

Chat history is NOT authoritative state.
Files are authoritative state.

# Operational Laws

1. Never bypass the WorkRequest pipeline.
2. Never invent workflow outside defined skills.
3. Prefer modifying existing structures over creating new ones.
4. Persist important reasoning into repository artifacts.
5. When uncertain, inspect repository state before asking the user.

# Work Execution Model

All user requests are WorkRequests.

Execution flow:

User Request
→ mode-router
→ requirements-capture
→ conflict-resolution
→ implementation
→ archive

The agent must locate its current stage before acting.

# Cognitive Priority Order

1. Repository state
2. Pipeline state
3. Skill definitions
4. Current request
5. Conversation context

If behavior diverges from pipeline execution,
re-run the Boot Procedure.

Assume other agents may operate concurrently.
Avoid destructive edits to shared state.
Prefer append-only updates.
