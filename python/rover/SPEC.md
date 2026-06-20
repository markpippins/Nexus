# Rover: Chat Transcript Harvesting Specification

## 1. Purpose

Rover ingests HTML chat transcripts (Slack, Teams, browser exports), parses them into clean Markdown, and extracts structured **Specification Candidates** and **Harvested Code** blocks. It runs as a background pipeline on a headless Linux machine, designed for long-running "saga" transcripts.

The output is a Markdown document containing an engineering review agenda with executable code snippets attached to their design context.

## 2. Pipeline Overview

```
HTML transcript → Docling → Clean Markdown → Text Splitter → Chunks → Qwen3.5:4b via Ollama → Structured JSON → Markdown Agenda
```

**Stages:**

1. **Docling Conversion** — strip HTML bloat, preserve layout, export clean Markdown
2. **Chunking** — split by ~10K tokens with 10% overlap
3. **Extraction** — per chunk, call Qwen3.5:4b with a strict Pydantic schema to produce structured output
4. **Compilation** — assemble all chunk results into a single Markdown specification document

## 3. Pydantic Schema

### 3.1 SpecificationCandidate

```python
class SpecificationCandidate(BaseModel):
    title: str
    status: str          # "Proposed" | "Agreed" | "Superseded"
    intent_description: str
    requirements: List[str]
    implementation_notes: List[str]
    code_snippets: List[HarvestedCode]
    open_questions: List[str]
```

### 3.2 HarvestedCode

```python
class HarvestedCode(BaseModel):
    language: str        # python, typescript, bash, sql, etc.
    purpose: str         # short sentence explaining what the code implements
    raw_code: str        # exact executable code block, no truncation
```

### 3.3 SpecificationAgenda

```python
class SpecificationAgenda(BaseModel):
    agenda_items: List[SpecificationCandidate]
```

## 4. System Prompt

```
You are an advanced Software Archaeologist and Technical Analyst.
Your primary mission is to extract actionable engineering intent and
harvest implementable code blocks from unstructured developer chat
transcripts.

1. Exact Code Extraction — extract code word-for-word, never truncate.
2. Code Contextualization — link code to its Specification Candidate.
3. Code Version Tracking — capture the final corrected version, note changes.
4. Separate Discussion from Code — conversational text in intent fields,
   code objects contain only executable syntax.
```

## 5. Extraction Function

### 5.1 Dynamic Context Scaling

```
estimated_tokens = len(docling_text) // 4
target_ctx = max(8192, min(65536, estimated_tokens + 4096))
```

### 5.2 Ollama Call

```python
response = ollama.chat(
    model='qwen3.5:4b',
    messages=[{"role": "system", "content": CODE_HARVESTER_PROMPT},
              {"role": "user", "content": f"...{docling_text}"}],
    format=SpecificationAgenda.model_json_schema(),
    options={
        "num_ctx": target_ctx,
        "temperature": 0.1,
        "low_vram": True
    }
)
```

### 5.3 Markdown Output Format

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

## 6. Chunking Strategy

- **Splitter:** `RecursiveCharacterTextSplitter`
- **Chunk size:** 40,000 characters (~10K tokens)
- **Overlap:** 4,000 characters (10%)
- Process chunks sequentially, append results to final document.

## 7. Background Processing (Headless Linux)

### 7.1 Thread Pinning

```python
options = {
    "num_thread": 3,     # leave 1 thread free on dual-core i7
    "temperature": 0.1,
    "low_vram": True
}
```

### 7.2 Systemd Ollama Config

```ini
[Service]
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="GGML_NUMA=1"
Environment="OLLAMA_KEEP_ALIVE=60m"
```

### 7.3 Swap

Minimum 8GB swap file to absorb memory spikes during concurrent Docling + Qwen processing.

## 8. Watch Script

A polling watcher (`watch_transcripts.sh`) monitors an inbox directory for `.html` files, runs the extraction pipeline on each, writes the output Markdown to an outbox, and archives the source. Poll interval: 30 seconds.

## 9. File Transfer Patterns

### 9.1 Push transcripts to server

```bash
rsync -avz --remove-source-files ~/Desktop/staged_chats/ user@remote:~/transcripts/inbox/
```

### 9.2 Pull agendas from server

```bash
rsync -avz --remove-source-files user@remote:~/transcripts/agendas/ ~/Documents/MyAgendas/
```

## 10. V2 Reference: Strontium Task Daemon

The TASK_DAEMON_SPEC.md defines a deterministic execution runtime ("Strontium Task Daemon") with a bounded-loop execution model, structured task IR, checkpointing, scheduling, and tool sandboxing.

Rover V1 runs as a direct Python script. Rover V2 may adopt the Strontium runtime for:
- Resumable task state across sessions
- Structured task envelopes with constraints
- Checkpoint/restart per chunk
- Supervisor integration for task graph orchestration

See `TASK_DAEMON_SPEC.md` for the full v2 substrate specification.
