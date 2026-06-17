# Run transcript cleaner and verify output

**Project:** pipeline
**Plan Number:** 0108
**Status:** pending

## Goal

In ~/dev/nexus/python/util: 1) remove cleaned_transcript.txt if it exists, 2) run cleaner.py, 3) verify success by checking for cleaned_transcript.txt

## Files Affected

- python/util/cleaner.py
- python/util/cleaned_transcript.txt

## Acceptance Criteria

### 1. cleaned_transcript.txt exists after running cleaner.py
### 2. cleaner.py exits with code 0
### 3. cleaned_transcript.txt is not empty

## Dependencies

- none
