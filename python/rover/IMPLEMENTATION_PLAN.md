# Rover Implementation Plan

## Overview

Rover ingests HTML chat transcripts, parses them into clean Markdown via
Docling, chunks them, and feeds each chunk to Qwen3.5:4b (via Ollama) with
a strict Pydantic schema. The result is a structured Markdown document
containing specification candidates and harvested code blocks.

## Target Directory Layout

```
rover/
  outline.md                         # original chat transcript (reference)
  SPEC.md                            # extracted specification (reference)
  TASK_DAEMON_SPEC.md                # v2 runtime spec (reference, defer)
  IMPLEMENTATION_PLAN.md             # this file

  # Implementation
  schemas.py                         # Pydantic models
  harvest_pipeline.py                # main entry point

  # Operations
  watch_transcripts.sh               # directory watcher daemon
  setup.sh                           # one-shot setup for target machine
  requirements.txt                   # pip dependencies

  # Config
  ollama-service-override.conf        # systemd drop-in for Ollama
```

## Phase 1: schemas.py

Implement three Pydantic models exactly as specified in SPEC.md §3:

- `HarvestedCode` — language, purpose, raw_code
- `SpecificationCandidate` — title, status, intent_description, requirements,
  implementation_notes, code_snippets, open_questions
- `SpecificationAgenda` — agenda_items: List[SpecificationCandidate]

All fields are lists of strings or plain strings. No nested complexity.

## Phase 2: harvest_pipeline.py

### 2.1 CLI Interface

```
usage: harvest_pipeline.py --input <file.html> --output <file.md>
```

Use `argparse`. The script:
1. Reads the HTML file
2. Converts to clean Markdown via Docling's `DocumentConverter`
3. Chunks the Markdown using `RecursiveCharacterTextSplitter`
   - chunk_size=40000, chunk_overlap=4000
4. For each chunk, calls `ollama.chat()` with:
   - model='qwen3.5:4b'
   - system prompt = CODE_HARVESTER_PROMPT (from SPEC.md §4)
   - format = SpecificationAgenda.model_json_schema()
   - options: num_ctx, temperature=0.1, low_vram=True, num_thread=3
5. Parses each response into a `SpecificationAgenda`
6. Compiles all agendas into the final Markdown output document
7. Writes the output file

### 2.2 Context Scaling

```python
estimated_tokens = len(text) // 4
target_ctx = max(8192, min(65536, estimated_tokens + 4096))
```

Pass `target_ctx` as `num_ctx` in options.

### 2.3 Markdown Generation

Generate the output document following SPEC.md §5.3 format:

```
# Harvested Specification & Code Repository

## N. [Title]
**Status:** `[status]`

### Architectural Intent
...

### Requirements & Acceptance Criteria
- [ ] ...

### Harvested Code Artifacts
#### Purpose: [description]
```[language]
[raw code]
```

### Unresolved Follow-Ups
- ...
```

Separate chunks with a `---` divider.

### 2.4 Error Handling

- Log each chunk's progress to stderr
- If a chunk fails, log the error and continue (don't abort the entire run)
- Exit code 0 on partial success, 1 on total failure
- Validate JSON from Ollama before parsing; skip malformed chunks

## Phase 3: watch_transcripts.sh

Implement the watch script from SPEC.md §8 / outline.md lines 262-307.

```
INBOX_DIR="$HOME/transcripts/inbox"
OUTBOX_DIR="$HOME/transcripts/agendas"
ARCHIVE_DIR="$HOME/transcripts/archive"
PYTHON_SCRIPT="$HOME/rover/harvest_pipeline.py"
```

Poll every 30 seconds. On finding `.html` files:
1. Run `harvest_pipeline.py --input <file> --output <outbox/file.md>`
2. On success, move source to archive
3. On failure, move source to archive with `.failed` suffix

## Phase 4: setup.sh

A one-shot setup script for the target machine:

1. Update package list, install python3-venv python3-pip
2. Create directories: ~/transcripts/{inbox,agendas,archive}
3. Create Python venv in ~/rover/.venv
4. Activate venv, pip install -r requirements.txt
5. Check swap space, create 8G swap file if below 8G
6. Copy ollama-service-override.conf to /etc/systemd/system/ollama.service.d/
7. Run `systemctl daemon-reload && systemctl restart ollama`
8. Print next steps

## Phase 5: requirements.txt

```
docling
ollama
langchain-text-splitters
pydantic
```

Pin no versions — let pip resolve compatible ones.

## Phase 6: ollama-service-override.conf

Drop-in at `/etc/systemd/system/ollama.service.d/override.conf`:

```
[Service]
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="GGML_NUMA=1"
Environment="OLLAMA_KEEP_ALIVE=60m"
```

## Pre-Flight on Target Machine

Before first run:

```bash
# Pull the model
ollama pull qwen3.5:4b

# Test a small transcript
cd ~/rover
python3 harvest_pipeline.py --input test.html --output test_agenda.md
```

## V2 (Deferred)

The Strontium Task Daemon (`TASK_DAEMON_SPEC.md`) replaces the direct
Python pipeline with a bounded-loop execution runtime. This provides
checkpoint/resume, structured task envelopes, and supervisor integration.

Do not implement V2 until V1 is tested and stable.
