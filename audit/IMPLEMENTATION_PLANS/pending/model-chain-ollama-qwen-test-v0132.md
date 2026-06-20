# Model chain fallback test: qwen2.5-coder via ollama

**Project:** nexus
**Plan Number:** 0132
**Status:** pending
**Prompt:** 0085

## Goal

Test the 3-model fallback chain end-to-end: qwen3.7-max (opencode) → qwen2.5-coder:latest (ollama) → big-pickle (opencode). Write a file `/tmp/pipeline-test-0132.txt` containing "Hello from qwen2.5-coder via ollama harness" or whichever model actually executes the work.

## Files Affected

- `/tmp/pipeline-test-0132.txt`

## Acceptance Criteria

### 1. `/tmp/pipeline-test-0132.txt` exists with non-empty content
### 2. Pipeline completes without error
### 3. The file clearly identifies which model wrote it

## Dependencies

- none
