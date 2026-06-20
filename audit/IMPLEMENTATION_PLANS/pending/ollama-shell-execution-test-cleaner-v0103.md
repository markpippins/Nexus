# Ollama Shell Execution Test: cleaner.py

**Project:** conduit-mcp
**Plan Number:** 0103
**Status:** pending

## Goal

Test the new shell command execution feature — the ollama harness now generates `$ ` prefixed shell commands, and the executor actually runs them via `subprocess.run()`. Validate end-to-end: model → command generation → shell execution → output file produced.

## Invocation

```bash
cd /home/codex/dev/nexus/python/util && python cleaner.py
```

The script reads `transcript.txt` from the working directory, strips time markers ("minutes", "seconds", "min", "sec") from each line, and writes the cleaned output to `cleaned_transcript.txt`.

## Files Affected

- `python/util/cleaner.py`
- `python/util/transcript.txt` (input)
- `python/util/cleaned_transcript.txt` (output, should be produced on success)

## Acceptance Criteria

### 1. Ollama harness generates a `$ ` prefixed shell command in its output
### 2. The executor parses the `$ ` command and runs it via subprocess
### 3. `cleaner.py` executes and produces `cleaned_transcript.txt`
### 4. `cleaned_transcript.txt` exists in `python/util/` with non-zero size
### 5. Pipeline step completes with exit code 0
### 6. Session log contains `[exec]` entries showing the command was actually run

## Dependencies

- none
