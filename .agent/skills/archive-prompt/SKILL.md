---
name: archive-prompt
description: Captures the user's intent and saves it as a permanent record in PROMPT_RECORD.
---

# Archive Prompt Skill

## Purpose
Ensure that the original user intent is preserved for traceability and future reference.

## Rules
1. Check if `PROMPT_RECORD` directory exists at the project root.
2. If it exists, create a new file named `layer_<alpha>_<name>_prompt.md`.
3. **Prompt Identification**:
   - Assign a unique `prompt_id` to each record.
   - Capture the original prompt verbatim.
4. **No Interpretation**:
   - The skill MUST NOT interpret or summarize the intent. It is a verbatim capture only.
5. If the directory does not exist, this skill should be a no-op unless explicitly requested to initialize recording.
