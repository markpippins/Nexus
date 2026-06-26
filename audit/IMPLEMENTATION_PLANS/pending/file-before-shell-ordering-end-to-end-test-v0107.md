# File-before-Shell Ordering End-to-End Test

**Project:** conduit
**Plan Number:** 0107
**Status:** pending

## Goal

Validate that execute_step() writes files via ---START_FILE:/---END_FILE--- blocks before executing $ shell commands, so files exist when shell commands reference them.

## Files Affected

- nexus/python/conduit/executor_cloud.py
- nexus/python/conduit/tests/test_executor_ollama_prompt.py

## Acceptance Criteria

### 1. New test in test_executor_ollama_prompt.py simulates ollama outputting both a START_FILE block AND a $ command that references the file
### 2. Test confirms file is written before shell command runs (files_written populated, file exists on disk)
### 3. Test confirms shell command succeeds because file exists
### 4. All 23+ tests pass: pytest tests/test_executor_ollama_prompt.py -v returns 0

## Dependencies

- 0106
