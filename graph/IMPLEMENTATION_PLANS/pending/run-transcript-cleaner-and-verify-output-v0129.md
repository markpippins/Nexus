# Run transcript cleaner and verify output

**Project:** conduit-ui
**Plan Number:** 0129
**Status:** pending

## Goal

Invoke nexus/python/util/cleaner.py to strip timestamps from transcript.txt and produce cleaned_transcript.txt as a canonical end-to-end pipeline test.

## Files Affected

- nexus/python/util/cleaner.py
- nexus/python/util/transcript.txt
- nexus/python/util/cleaned_transcript.txt

## Acceptance Criteria

### 1. cleaned_transcript.txt is produced in nexus/python/util/
### 2. cleaned_transcript.txt does not contain timestamp lines (e.g. 0:00, 1:30)
### 3. cleaned_transcript.txt preserves all non-timestamp transcript content in order

## Dependencies

- none
