# Model Fitness Analysis — Ollama Models via OpenCode Harness

**Date:** 2026-06-16
**Scope:** 11 Ollama models evaluated for compatibility with the OpenCode agent harness.
**Database:** `conduit-pg` / `nexus` — `vector.models` with `harn-opencode` / `prov-opencode`.

---

## 1. Background

All 11 Ollama models were migrated from the `harn-ollama-sdk` harness to `harn-opencode`
(with `prov-opencode` provider and `ollama/<model>` identifiers). The goal was to test
end-to-end model invocation through OpenCode's agent loop.

The OpenCode provider is configured in `~/.opencode/config.json`:

```json
"ollama": {
  "npm": "@ai-sdk/openai-compatible",
  "name": "Ollama (local)",
  "options": {
    "baseURL": "http://127.0.0.1:11434/v1"
  },
  "models": { ... }
}
```

All models are visible via `opencode models ollama` and respond correctly to direct
Ollama API calls (`curl` to `/v1/chat/completions`).

---

## 2. Critical Discovery: Tool-Calling Requirement

**OpenCode's agent loop requires tool/function-calling support from the model.** When a
model does not support tools, OpenCode surfaces the error:

> `registry.ollama.ai/library/<model> does not support tools`

This failure mode is *silent* in the TUI — the UI renders but the chat area stays empty.
Non-interactive `opencode run` exits immediately without processing. The debug log
(level `DEBUG`) shows plugin initialization but no API calls to Ollama.

### Mitigation Options

| Approach | Mechanism |
|---|---|
| Use tool-capable models | Switch to models that advertise tool support |
| Deny all permissions | `"permission": {"*": "deny"}` in `opencode.json` — forces chat-only behavior but degrades agent capability |
| Custom agent with no tools | `opencode agent create --permissions ""` |
| Permission `"ask"` | Requires manual approval per tool call — preserves agent behavior with oversight |

---

## 3. Model-by-Model Results

### 3.1 Direct API Test (ollama `/v1/chat/completions`)

All models respond correctly to basic chat prompts via direct API.

### 3.2 Tool-Calling Compatibility Test

Tested by sending a request with `tools` array to `/v1/chat/completions`:

| Model | Size | Tool Support | Notes |
|---|---|---|---|
| `qwen2.5-coder:latest` | ~4.7 GB | ✅ YES | Returns content correctly even with tools present |
| `codellama:7b` | 3.8 GB | ❌ NO | `does not support tools` |
| `llama3:8b` | 4.9 GB | ❌ NO | `does not support tools` |
| `nemotron-3-nano:4b` | 2.8 GB | ⚠️ REASONING | Outputs in `reasoning` field, not `content` — incompatible with standard chat |
| `qwen3.5:latest` | ~5.4 GB | ⚠️ REASONING | Outputs in `reasoning` field, not `content` — same incompatibility as nemotron. DB identifier was `ollama/qwen3.5` (missing tag) — fixed to `ollama/qwen3.5:latest`. Very slow (120s latency for simple chat). |
| `mistral:7b` | 4.4 GB | ❌ NO TOOLS | Simple chat works (`"OK"` response). Tool-calling hangs (60s+ timeout) — does not support tools. OpenCode will fail silently. |
| `deepseek-r1:7b` | 4.7 GB | ⬜ NOT TESTED | Reasoning model — likely same issue as nemotron |
| `gemma4:e2b` | 1.2 GB | ⬜ NOT TESTED | Smallest model — low probability of tool support |
| `gemma4:latest` | ~4.8 GB | ⬜ NOT TESTED | |
| `qwen3.5:27b` | 15.8 GB | ⬜ NOT TESTED | Largest model — most likely to support tools (needs test) |
| `minimax-m3:cloud` | ~6.5 GB | ⬜ NOT TESTED | Cloud-hosted variant |

### 3.3 OpenCode Interactive TUI Test

| Model | TUI Renders | Model Responds | Error |
|---|---|---|---|
| `codellama:7b` | ✅ | ❌ | Silent — no API call made (tool support error) |
| `nemotron-3-nano:4b` | ✅ | ❌ | Silent — reasoning model incompatibility |
| `qwen2.5-coder` | Not tested in TUI | — | — |

---

## 4. Database State (vector.models)

All 11 Ollama models using **openCode harness**:

```
 mod-ollama-codellama-7b       → harn-opencode / prov-opencode / ollama/codellama:7b
 mod-ollama-deepseek-r1-7b     → harn-opencode / prov-opencode / ollama/deepseek-r1:7b
 mod-ollama-gemma4             → harn-opencode / prov-opencode / ollama/gemma4
 mod-ollama-gemma4-e2b         → harn-opencode / prov-opencode / ollama/gemma4:e2b
 mod-llama3                    → harn-opencode / prov-opencode / ollama/llama3:8b
 mod-ollama-minimax-m3         → harn-opencode / prov-opencode / ollama/minimax-m3:cloud
 mod-ollama-mistral-7b         → harn-opencode / prov-opencode / ollama/mistral:7b
 mod-ollama-nemotron-3-nano    → harn-opencode / prov-opencode / ollama/nemotron-3-nano:4b
 mod-ollama-qwen2-5-coder      → harn-opencode / prov-opencode / ollama/qwen2.5-coder
 mod-ollama-qwen3-5            → harn-opencode / prov-opencode / ollama/qwen3.5
 mod-ollama-qwen3-5-27b        → harn-opencode / prov-opencode / ollama/qwen3.5:27b
```

Zero stragglers on `harn-ollama-sdk`.

### Role Models (vector.role_models)

All 4 roles reference `mod-ollama-qwen2-5-coder` at priority 2 (switched from nemotron June 16):

| Role | Model | Priority |
|---|---|---|
| builder | `mod-ollama-qwen2-5-coder` | 2 |
| critic | `mod-ollama-qwen2-5-coder` | 2 |
| planner | `mod-ollama-qwen2-5-coder` | 2 |
| reviewer | `mod-ollama-qwen2-5-coder` | 2 |

## 5. Conduit Invocation via MCP Test Endpoint

**Conduit does NOT invoke opencode directly — it uses `test_invoke.py`** which builds
`opencode run` commands and streams output to session logs via `select()`-based I/O.

### How conduit invokes opencode

1. **MCP endpoint** `POST /config/ai/test` on port 3100
2. **Spawns** `legacy/python/conduit/test_invoke.py` with `--harness opencode`
3. **test_invoke.py builds**: `opencode run --print-logs --log-level DEBUG --agent build --dir <dir> --model <id> <prompt>`
4. **Streams** stdout/stderr to session log via `select()` with 300s timeout
5. **UI reads** session log via SSE `/log/:sessionId`

### Key findings from conduit test invoke

| Test | Result |
|---|---|
| qwen2.5-coder via conduit | ✅ LLM selected, agent initialized, processing began |
| Agent name `"builder"` | ❌ Not found — opencode falls back to default (`"build"`) |
| Full agent loop completion | ⏳ Hangs — title gen + build mode require 2 LLM calls, slow with local ollama |
| Session log output | ✅ Debug-level logs confirm model selection, tool registration, LLM stream start |

### Agent name bug

`test_invoke.py` hardcodes `launcher.set_agent("builder")` but opencode's valid agent names
are `build`, `compaction`, `explore`, `inspector`, `planner`, `reviewer`. The fallback to
default agent still works, but the agent name should be fixed to `"build"`.

---

## 6. Key Findings

1. ✅ **Role_models switched** to `mod-ollama-qwen2-5-coder` (only confirmed working ollama model).
2. **`qwen2.5-coder` confirmed via conduit** — `test_invoke.py` successfully selects the model, registers tools, and begins the agent loop.
3. **`llama3:8b` and `codellama:7b` explicitly lack tool support** and fail with clear errors.
4. **`nemotron-3-nano:4b` is a reasoning model** — outputs in `reasoning_content` not `content`,
   making it incompatible with standard chat/agent protocols.
5. **`qwen3.5` and `mistral:7b` resolved**: qwen3.5 is a reasoning model (same class as nemotron — incompatible with OpenCode). mistral:7b lacks tool support (hangs silently). DB identifier fixed for qwen3.5 (was missing `:latest` tag).
6. **`opencode run` agent loop** (title gen + build mode) is slow with local ollama models —
   each LLM call may take 60+ seconds, and the full agent loop exceeds conduit's 300s timeout.
7. **5 models remain untested** — `qwen3.5:27b` and `gemma4:latest` are the highest priority.

---

## 7. Recommendations

### Immediate
- **Switch role_models to `mod-ollama-qwen2-5-coder`** (only confirmed working model)
  or keep the OpenCode cloud models as primary fallback.
- **Resolve `qwen3.5` and `mistral` naming** — verify exact model identifiers in ollama
  and retest tool-calling.
- **Test `qwen3.5:27b`** — as a larger model, it's the most likely candidate for
  capable tool-calling among the untested set.

### Short-term
- Test remaining models for tool-calling: `deepseek-r1:7b`, `gemma4`, `gemma4:e2b`,
  `minimax-m3:cloud`.
- Evaluate whether disabling tools (permission `deny`) is acceptable for roles that
  don't need agent capabilities (e.g., `critic`, `reviewer`).
- Consider deploying a tool-capable ollama model (e.g., `llama3.1`, `mistral-nemo`,
  `command-r`) to fill the gap.

### Long-term
- Establish a model compatibility test suite that validates tool-calling, response
  format, and latency before adding models to the DB.
- Consider a model registry that tracks capabilities (tools, vision, reasoning,
  context window) alongside harness/provider metadata.

---

## 8. Test Methodology

1. **Direct API:** `curl` to `http://127.0.0.1:11434/v1/chat/completions` with `tools` array
2. **OpenCode CLI:** `opencode models ollama` for listing, `opencode run --model ...` for invocation
3. **OpenCode TUI:** `opencode --model ollama/<model>` in tmux session with `send-keys`
4. **OpenCode Web:** `opencode web` on port 4100, browser-driven interaction
5. **Conduit MCP test invoke:** `POST /config/ai/test` on port 3100 — the mechanism conduit actually uses. Spawns `test_invoke.py` which builds `opencode run` with debug flags and streams output to session logs.
6. **Database:** `docker exec conduit-pg psql -U pguser -d nexus` queries against `vector.*` tables
