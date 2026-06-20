# Session Report: Phase 1 Post-Mortem / Rover Pipeline Bottleneck / Temporal Discovery

**Date:** 2026-06-20
**Role:** Architect
**Session Context:** Post-Phase 1 review sign-off, attempting to process Agenda Generator for DeepSeek chat transcript through the rover-mcp harvesting pipeline.

---

## 1. Systems State Discovered

### Temporal / Conduit Pipeline — LIVE (unexpected)

Prior sessions assumed Temporal was dead (Docker container gone, systemd services failing). Actually:

| Component | Status |
|---|---|
| **Temporal server** | Running natively — `temporal server start-dev --db-filename /tmp/temporal-dev.db` (PID 68048, port 7233) |
| **Temporal web UI** | Available at `http://localhost:8233` |
| **Conduit worker** | `python -m conduit.temporal.worker` (PID 1560904) — alive since Jun 19 |
| **Phase 1 plan execution** | All 6 plans (0136–0142) processed through worker; harness fallback chain logged: `qwen3.7-max → big-pickle` |
| **Worker log** | Shows `Exit code -9` (OOM kill) on qwen3.7-max for reviewer tasks, fallback to big-pickle succeeded |

**Implication:** The conduit pipeline works. Plans flow from creation → builder → reviewer through Temporal orchestration. The fallback chain saved Phase 1 from model failures.

### Rover MCP Server — LIVE

`rover_mcp_sse.py` running since Jun 19 on port 3102 (PID 1979868). Uses BeautifulSoup for HTML→markdown (avoids Docling's heavy dependency tree), then serves `rover_submit_transcript`, `rover_get_pending_chunk`, `rover_submit_extraction`, `rover_compile_agenda`, `rover_job_status` via SSE. Was not wired into the opencode MCP configuration.

### MEEP Phase 1 — COMPLETE

- 186 tests, all passing
- 6 plans (0136–0142) all REVIEW_PASS, closed
- Pipeline: text → AST → IRL classifier → IR resolver → spec compiler → lowering → scheduler → CER log → replay
- Zero regressions from AST preprocessing addition

---

## 2. Rover Pipeline — Bottleneck Analysis

### Attempt 1: qwen3:4b on strontium (remote)

```bash
# What we wanted to run:
python3 harvest_pipeline.py --input Agenda_Generator.html --output harvested.md \
    --model qwen3:4b --ollama-url http://strontium:11434
```

- **Cold start:** ~29s for minimal prompt
- **Full extraction (6667 tokens):** timed out at 10 minutes
- **Verdict:** strontium's CPU couldn't handle 4B-param model at the context window required (10k ctx). Process consumed all available resources.

### Attempt 2: nemotron-3-nano:4b (local)

- **Model pulled:** 2.8 GB, Q4_K_M quantization
- **Throughput:** ~4.3 tokens/second (CPU-bound)
- **At that rate:** 6667 input tokens → ~25 minutes per chunk
- **Structured `format:` schema:** nemotron failed to generate valid JSON — returned empty error after 15 minutes
- **Verdict:** Local CPU-bound inference at 4 tok/s is not viable for interactive extraction. The `format:` schema constraint (structured JSON generation) appears to add further overhead or is unsupported by this model.

### Root Cause

The harvest pipeline's `extract_chunk()` was hardcoded to:

1. Model: `qwen3.5:4b`
2. URL: local Ollama only (via `ollama` Python package)
3. No way to specify remote Ollama or different model

No CLI flags existed for model selection or remote endpoint.

---

## 3. Changes Made

### 3a. `harvest_pipeline.py` — Added `--model` and `--ollama-url` flags

**File:** `nexus/python/rover/harvest_pipeline.py`

- `extract_chunk()` now accepts `model` and `ollama_url` parameters
- Switched from `ollama` Python package to `httpx` for all Ollama calls (works for both local and remote)
- `run_pipeline()` propagates these to `extract_chunk()`
- CLI adds `--model` (default: `qwen3.5:4b`) and `--ollama-url` (default: `http://localhost:11434`)
- Output markdown includes model/URL info in header

**Usage now:**
```bash
# Local with different model
python3 harvest_pipeline.py --input X.html --output Y.md --model nemotron-3-nano:4b

# Remote on strontium
python3 harvest_pipeline.py --input X.html --output Y.md \
    --model qwen3:4b --ollama-url http://strontium:11434
```

### 3b. `opencode.json` — Rover MCP tools wired

**File:** `~/.config/opencode/opencode.json`

Added rover-mcp as a remote MCP server pointing to the already-running SSE server on port 3102:

```json
"rover-mcp": {
  "type": "remote",
  "url": "http://localhost:3102",
  "enabled": true
}
```

The rover tools (`rover_submit_transcript`, `rover_get_pending_chunk`, `rover_submit_extraction`, `rover_compile_agenda`, `rover_job_status`) already accept `ollama_url` and `model` per-call — no server changes needed.

---

## 4. Remaining Bottleneck

The fundamental issue is **model throughput on available hardware:**

| Model | Params | Size | Tok/s | Viable? |
|---|---|---|---|---|
| qwen3:4b (strontium) | 4B | 2.5 GB | ~5 | No — OOM / timeout |
| nemotron-3-nano:4b (local) | 4B | 2.8 GB | ~4.3 | No — CPU-bound, structured JSON fails |
| qwen2.5-coder:1.5b (local, not tried) | 1.5B | ~900 MB | ~? | Likely 2-3x faster, may handle structured output |

The transcript (`Agenda Generator for DeepSeek.html`, 26668 chars, ~6667 tokens after Docling) is a single-chunk extraction job at default chunk sizes. Even at 12k char chunks, each of the 3 chunks takes 10-15 minutes at current throughput.

**Next step for this transcript:** Read it directly or pull a ~1.5B model (e.g. `qwen2.5-coder:1.5b`) and test structured JSON extraction at smaller context sizes.

---

## 5. Key Decisions

1. **httpx over ollama Python package:** Switched `extract_chunk()` to use httpx directly for all Ollama calls. Gives explicit timeout control, works identically for local and remote, removes hard dependency on the `ollama` client library.

2. **Remote MCP wiring:** rover-mcp was already running as SSE on port 3102 but was not declared in opencode.json. Added it so future sessions can use its tools directly rather than writing ad-hoc Python scripts.

3. **No changes to MCP server code:** The rover MCP server already supports `ollama_url` and `model` parameters on `rover_get_pending_chunk`. No modifications were needed.
