>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
---
name: archive-prompt
description: Captures the user's intent and saves it as a permanent record in .pipeline/PROMPT_RECORDS.
---

# Archive Prompt Skill

## Purpose
Ensure that the original user intent is preserved for traceability and future reference.

## Rules
1. Check if `.pipeline/PROMPT_RECORDS` directory exists at the project root.
2. If it exists, create a new file named `layer_<alpha>_<name>_prompt.md`.
3. **Prompt Identification**:
   - Assign a unique `prompt_id` to each record.
   - Capture the original prompt verbatim.
4. **No Interpretation**:
   - The skill MUST NOT interpret or summarize the intent. It is a verbatim capture only.
5. If the directory does not exist, this skill should be a no-op unless explicitly requested to initialize recording.
6. **Immutability (CRITICAL)**:
   - Prompts are a sequential record of work and MUST be treated as strictly immutable.
   - You MUST NEVER edit, overwrite, or delete an existing prompt record. New intents always create a new file.
