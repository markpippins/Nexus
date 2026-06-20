# Default e2e Test

**Project:** conduit-ui
**Plan Number:** 0109
**Status:** pending

## Goal

In ~/dev/nexus/python/util: 1) rename cleaned_transcript.txt if it exists, prepending the file date and time, 2) run cleaner.py, 3) verify success by checking for cleaned_transcript.txt

## Files Affected

- python/util/cleaner.py
- python/util/cleaned_transcript.txt

## Acceptance Criteria

### 1. cleaned_transcript.txt exists after running cleaner.py
### 2. cleaner.py exits with code 0
### 3. cleaned_transcript.txt is not empty

## Dependencies

- none
