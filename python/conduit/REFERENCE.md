# Conduit — Reference Guide

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_DB_PATH` | `~/.conduit-data/pipeline.db` | SQLite database path |
| `PIPELINE_LOCK_PATH` | `/tmp/pipeline-manager.lock` | Lock file path |
| `PIPELINE_DCO_DIR` | `~/.conduit-data/WORK_REQUESTS` | DCO output directory |
| `OPENCODE_BIN` | `~/.opencode/bin/opencode` | Path to opencode binary |
| `PIPELINE_EXECUTOR_TIMEOUT` | 1800 | Subprocess timeout (seconds) |
| `PIPELINE_WATCHDOG_STALE` | 1800 | Max cumulative work seconds before stale kill |
| `API_LIMIT_RETRY_DELAY` | 300 | Sleep between rate-limit retries (seconds) |
| `API_LIMIT_MAX_RETRIES` | 5 | Max retry attempts per plan-role |
| `MCP_BASE_URL` | http://localhost:3100 | MCP server URL |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_DB_PATH` | See above | Override SQLite path |
| `OPENCODE_BIN` | See above | Override opencode binary path |
| `MCP_BASE_URL` | http://localhost:3100 | MCP server URL |
| `API_LIMIT_RETRY_DELAY` | 300 | Retry delay in seconds |
| `API_LIMIT_MAX_RETRIES` | 5 | Max retries |

## Commands

| Command | Description |
|---------|-------------|
| `python3 main.py --status` | Show pipeline status |
| `python3 main.py --run planner` | Run a specific role |
| `python3 main.py --all` | Run all roles sequentially |
| `python3 main.py --plan 0075` | Dispatch a single plan |
| `python3 main.py --clean-test-artifacts` | Clean BLOCK artifacts |
| `python3 main.py --supersede ticket-0075-builder-123456` | Supersede a ticket |
| `python3 main.py --cancel ticket-0075-builder-123456` | Cancel a ticket |

## Troubleshooting

- **Pipeline not running**: Check crontab (`crontab -l`), verify the lock file is not stale (`rm -f /tmp/pipeline-manager.lock`)
- **Rate limit errors**: The retry loop handles this automatically — check logs for `API_LIMIT` receipts. After 5 retries the ticket fails and a retry ticket is created.
- **Session killed**: Use `--status` to check for stale sessions, then clean with `--clean-test-artifacts`
- **Plan not picked up**: Verify the plan has a valid receipt chain via `get_plan_receipts` — plans with NULL `derived_status` are invisible
- **Circuit breaker tripped**: Check `--status` for breaker state, wait for automatic reset or manually reset via DB
- **Database locked**: Only one pipeline instance runs at a time — check for zombie processes (`ps aux | grep main.py`)
