# Model Verification Plan

## Goal

Before a model is assigned to a role (via `vector.role_config` or `vector.role_models`), it must pass a **deterministic** invocation test that proves the harness can reach the model, the model returns valid responses, and the response format is compatible with the agent loop.

## 1. Schema Change

Add a `verified` column to `vector.models`:

```sql
ALTER TABLE vector.models
  ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vector.models
  ADD CONSTRAINT models_verified_check
    CHECK (verified IN (0, 1));
```

`verified = 1` means the model has passed all three stages below. The `role_config` and `role_models` assignment queries MUST filter on `verified = 1`.

## 2. Three-Stage Verification

Each stage is a script that exits 0 on pass, non-zero on failure with a diagnostic message.

### Stage 1 — Direct API (Harness-Agnostic)

Test that the provider endpoint responds and the model identifier is accepted.

```
# For ollama provider
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -d '{"model":"<model_identifier>","messages":[{"role":"user","content":"respond with exactly OK"}],"max_tokens":8}' \
  | jq -e '.choices[0].message.content == "OK" or .choices[0].message.content == "OK"'

# For opencode provider (proxied via MCP server)
curl -s http://localhost:3100/v1/chat/completions \
  -H "Authorization: Bearer <key>" \
  -d '{"model":"<model_identifier>","messages":[{"role":"user","content":"respond with exactly OK"}],"max_tokens":8}' \
  | jq -e '.choices[0].message.content != null'
```

**Pass criteria:** non-empty `choices[0].message.content` returned within 30s.

### Stage 2 — Tool-Calling Compatibility

Test that the model accepts a `tools` array and returns a tool call when instructed.

```
curl -s http://.../v1/chat/completions \
  -d '{
    "model":"<model_identifier>",
    "messages":[{"role":"user","content":"call the test_tool"}],
    "tools":[{"type":"function","function":{"name":"test_tool","parameters":{"type":"object","properties":{}}}}],
    "max_tokens":128
  }' | jq -e '.choices[0].message.tool_calls | length > 0'
```

**Pass criteria:** `tool_calls` array is non-empty. Models that fail are marked as `verified = 0` with a note — they may still be usable for roles that don't need tools if `extra_params` sets `deny_all_tools = true`.

Additional check: response body must use `choices[0].message.content` (not `reasoning_content`/`reasoning`). Reasoning-model output is incompatible with the agent loop.

### Stage 3 — Harness Invocation (Deterministic)

Test that the harness (e.g. `harn-opencode`) can actually invoke the model through the full toolchain.

| Harness | Test Command |
|---|---|
| `harn-opencode` | `opencode run --model <provider>/<model_identifier> --agent build --print-logs --log-level DEBUG "respond with exactly OK"` within 120s timeout |
| `harn-ollama-sdk` | `ollama run <model_identifier> "respond with exactly OK"` within 60s timeout |
| `harn-codex-cli` | `codex exec --cd <tmpdir> "respond with exactly OK"` (requires `--model <id>` if supported) |

**Pass criteria:** exit code 0 and stdout contains the expected response. Timed out or non-zero exit is a fail.

For `harn-opencode`, the `invocation_semantics` field in `vector.harnesses` defines how the CLI arguments are built (model flag, working directory flag, etc.). The test script reads this JSON to construct the command — this is what makes the test **deterministic**: it exercises the same code path that `test_invoke.py` and conduit use.

## 3. Verification Script

`scripts/verify_model.py` reads from `vector.providers`, `vector.harnesses`, and `vector.models` and runs all three stages:

```
usage: verify_model.py <model_id>
  --stages 1 2 3    # default: all three
  --timeout 120     # per-stage timeout
```

On success it sets `vector.models.verified = 1` for that model. On failure it prints diagnostics and exits non-zero. A `--force` flag allows setting `verified = 1` manually for models that pass visual/manual review but fail automated checks.

## 4. Role Assignment Gate

`vector.role_config` already has `model_id` foreign key to `vector.models`. Add a trigger or application-level check:

```sql
CREATE OR REPLACE FUNCTION check_model_verified()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vector.models WHERE id = NEW.model_id AND verified = 1) THEN
    RAISE EXCEPTION 'model % is not verified (verified != 1)', NEW.model_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_role_config_verified
  BEFORE INSERT OR UPDATE ON vector.role_config
  FOR EACH ROW EXECUTE FUNCTION check_model_verified();

CREATE TRIGGER trg_role_models_verified
  BEFORE INSERT OR UPDATE ON vector.role_models
  FOR EACH ROW EXECUTE FUNCTION check_model_verified();
```

This ensures no unverified model is ever assigned to a pipeline role.

## 5. Implementation Order

1. Add `verified` column via migration
2. Write `verify_model.py`
3. Run verification on all current `vector.models` rows
4. Apply triggers
5. Remove any rows where `verified = 0` from `vector.role_config` and `vector.role_models`
6. Document in `ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md`
