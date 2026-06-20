# Ollama START_FILE/END_FILE Format Test

**Project:** conduit
**Plan Number:** 0106
**Status:** pending

## Goal

Verify that the executor_cloud.py ollama prompt instructs the model to use ---START_FILE:/---END_FILE--- format instead of FILE: format. Run pytest on tests/test_executor_ollama_prompt.py and confirm all tests pass.

## Files Affected

- nexus/python/conduit/tests/test_executor_ollama_prompt.py

## Acceptance Criteria

### 1. New test file exists at tests/test_executor_ollama_prompt.py
### 2. All tests pass: pytest tests/test_executor_ollama_prompt.py -v returns 0 exit code
### 3. Tests verify ollama output with START_FILE/END_FILE format is correctly parsed and files are written

## Dependencies

- 0105
