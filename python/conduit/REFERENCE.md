# Conduit — Reference Guide

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CONDUIT_PG_DSN` | *(required)* | PostgreSQL connection string |
| `CONDUIT_PG_SCHEMA` | `conduit` | PostgreSQL schema name |
| `CONDUIT_DATA_DIR` | `/home/codex/dev/nexus/.conduit-data` | Conduit data directory |
| `CONDUIT_LOG_PATH` | `$CONDUIT_DATA_DIR/conduit.log` | Structured log file path |
| `CONDUIT_LOG_LEVEL` | `INFO` | Log level (DEBUG, INFO, WARNING, ERROR) |
| `PIPELINE_LOCK_PATH` | `/tmp/pipeline-manager.lock` | Lock file path |
| `PIPELINE_DCO_DIR` | `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS` | DCO output directory |
| `OPENCODE_BIN` | `/home/codex/.opencode/bin/opencode` | Path to opencode binary |
| `PIPELINE_ROOT` | `/home/codex/dev` | Project root for executor artifacts |
| `PIPELINE_EXECUTOR_TIMEOUT` | `1800` | Subprocess timeout (seconds) |
| `PIPELINE_WATCHDOG_STALE` | `1500` | Max cumulative work seconds before stale kill |
| `PIPELINE_LOCK_STALE` | `3600` | Lock staleness threshold (seconds) |
| `API_LIMIT_RETRY_DELAY` | `300` | Sleep between rate-limit retries (seconds) |
| `API_LIMIT_MAX_RETRIES` | `5` | Max retry attempts per plan-role |
| `MCP_BASE_URL` | `http://localhost:3100` | MCP server URL |
| `PIPELINE_MODEL` | *(optional)* | Fallback model when tackle-mcp unavailable |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONDUIT_PG_DSN` | *(required)* | PostgreSQL connection string (e.g., `host=localhost port=5432 user=pguser password=pgpass dbname=nexus`) |
| `CONDUIT_PG_SCHEMA` | `conduit` | Override PostgreSQL schema name |
| `CONDUIT_DATA_DIR` | See above | Override conduit data directory |
| `CONDUIT_LOG_PATH` | See above | Override log file path |
| `CONDUIT_LOG_LEVEL` | `INFO` | Override log level |
| `PIPELINE_DCO_DIR` | See above | Override DCO output directory |
| `OPENCODE_BIN` | See above | Override opencode binary path |
| `MCP_BASE_URL` | `http://localhost:3100` | MCP server URL |
| `API_LIMIT_RETRY_DELAY` | `300` | Retry delay in seconds |
| `API_LIMIT_MAX_RETRIES` | `5` | Max retries |
| `PIPELINE_MODEL` | *(optional)* | Fallback model (e.g., `opencode/big-pickle`) |

## Commands

| Command | Description |
|---------|-------------|
| `python3 main.py --status` | Show pipeline status |
| `python3 main.py --run planner` | Run a specific role (builder, reviewer, planner, critic) |
| `python3 main.py --all` | Run all roles sequentially |
| `python3 main.py --plan 0075` | Dispatch a single plan |
| `python3 main.py --plan 0075 --force` | Dispatch a single plan (override circuit breaker) |
| `python3 main.py --clean-test-artifacts` | Clean BLOCK artifacts |
| `python3 main.py --supersede ticket-id` | Supersede a ticket |
| `python3 main.py --supersede ticket-id --supersede-replace --supersede-reason "reason"` | Supersede with replacement |
| `python3 main.py --cancel ticket-id` | Cancel a ticket |
| `python3 main.py --cancel ticket-id --cancel-reason "reason"` | Cancel with reason |
| `python3 main.py --kernel-sync` | One-shot sync receipts to WRP Kernel Runtime |
| `python3 main.py --kernel-sync-daemon` | Run kernel sync in continuous poll loop |
| `python3 agent_scheduler_runner.py` | Launch due agents from `tackle.agent_scheduler` |

## Troubleshooting

- **Pipeline not running**: Check crontab (`crontab -l`), verify the lock file is not stale (`rm -f /tmp/pipeline-manager.lock`)
- **Rate limit errors**: The retry loop handles this automatically — check logs for `API_LIMIT` receipts. After 5 retries the ticket fails and a retry ticket is created via `create_next_tickets()`.
- **Session killed**: Use `--status` to check for stale sessions, then clean with `--clean-test-artifacts`
- **Plan not picked up**: Verify the plan has a valid receipt chain via `get_plan_receipts` — plans with NULL `derived_status` are invisible
- **Circuit breaker tripped**: Check `--status` for breaker state, wait for automatic reset or manually reset via DB
- **Lock contention**: Only one pipeline instance runs at a time — check for zombie processes (`ps aux | grep main.py`)
- **Database unreachable**: Verify PostgreSQL is running and `CONDUIT_PG_DSN` is correct. The `readyz` endpoint on the Kernel Runtime API (port 3103) can diagnose DB connectivity.
- **All models exhausted**: If all models in the chain fail, a `BLOCK` receipt is issued and a retry ticket is created. Check the receipt metadata for the `chain_attempted` field to see which models were tried.
- **Budget exceeded**: Plans are blocked with exit code 4 when agent or ticket budget ceilings are reached. Check `tackle.agent_budget_usage` and ticket `cost_budget_usd` values.
- **No model config**: If a role has no model configured in tackle-mcp and `PIPELINE_MODEL` is not set, a `BLOCK` receipt with `error: no_model_config` is issued. Configure a model in AI Settings (tackle-mcp port 3400) or set `PIPELINE_MODEL`.
