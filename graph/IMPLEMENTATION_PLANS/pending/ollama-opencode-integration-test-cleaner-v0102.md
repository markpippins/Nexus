# Ollama + Opencode Integration Test: cleaner.py

**Project:** conduit-mcp
**Plan Number:** 0102
**Status:** pending

## Goal

Test ollama integration with the **opencode harness** by running `cleaner.py` through the Conduit pipeline. Validates that ollama can be used as the model backend with opencode as the CLI harness.

## Invocation

```bash
cd /home/codex/dev/nexus/python/util && python cleaner.py
```

The script reads `transcript.txt` from the working directory, strips time markers ("minutes", "seconds", "min", "sec") from each line, and writes the cleaned output to `cleaned_transcript.txt`.

## Files Affected

- `python/util/cleaner.py`
- `python/util/transcript.txt` (input file)

## Acceptance Criteria

### 1. The script runs successfully via the Conduit pipeline using the opencode harness with ollama backend
### 2. Input file `transcript.txt` is read and processed
### 3. Output file `cleaned_transcript.txt` is produced with time markers stripped
### 4. The pipeline step completes with exit code 0
### 5. Cleaned output is captured in the conduit artifacts

## Dependencies

- none
