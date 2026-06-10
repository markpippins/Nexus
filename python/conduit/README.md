# Conduit

Cron-driven orchestrator that consumes the `nexus/.conduit-data/pipeline.db` SQLite
database and dispatches WorkRequests to AI executors (opencode, ollama).

**Receipt-first architecture:** Plan state is determined exclusively by the
receipt chain, not filesystem location. Always use MCP tools or the conduit-ui
Angular dashboard to create plans — writing `.md` files directly to
`IMPLEMENTATION_PLANS/` will produce invisible, orphaned plans.

**Rate-limit resilience:** When the executor hits a rate limit, the pipeline
retries in place (5 retries, 5-minute delay each). The ticket stays claimed
and the circuit breaker is not tripped. Only actual execution time counts
toward session staleness — waiting time is excluded.

## Quick Start

```bash
# 1. Copy and edit the environment file
cp .env.example .env
# Edit .env if your paths differ from the defaults

# 2. Check status (no lock required, read-only)
python3 main.py --status

# 3. Run the full pipeline (acquires lock, processes all roles)
python3 main.py --all
```

## Plan Lifecycle

```
Propose → Promote → Plan → Build → Review

1. Capture an idea     create_proposed_plan  → PROPOSED receipt, file in proposed/
2. Promote to planning  promote_plan          → PLANNING receipt, file in planning/
3. Planner elucidates   (cron: planner role)   → PLAN_CREATE receipt, file in pending/
4. Builder implements   (cron: builder role)   → IMPLEMENTATION receipt, file in active/
5. Reviewer approves    (cron: reviewer role)  → REVIEW_PASS receipt, file in completed/
```

For the full architecture, receipt state machine, and anti-patterns, see
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Environment

All paths are read from `.env` (or environment variables). See `.env.example`
for the complete list.

| Variable                    | Default                                                    | Purpose                                |
|----------------------------|------------------------------------------------------------|----------------------------------------|
| `PIPELINE_DB_PATH`         | `/home/codex/dev/nexus/.conduit-data/pipeline.db`          | SQLite database                        |
| `PIPELINE_LOCK_PATH`       | `/tmp/pipeline-manager.lock`                               | Prevents concurrent runs               |
| `PIPELINE_DCO_DIR`         | `/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS`        | DCO output directory                   |
| `PIPELINE_ROOT`            | (derived from DB path)                                     | Project root for executor artifacts    |
| `OPENCODE_BIN`             | `/home/codex/.opencode/bin/opencode`                       | Path to the opencode binary            |
| `PIPELINE_EXECUTOR_TIMEOUT`| `1800`                                                     | Subprocess timeout in seconds          |
| `PIPELINE_WATCHDOG_STALE`  | `1800`                                                     | Max cumulative work seconds before stale kill |
| `API_LIMIT_RETRY_DELAY`    | `300` (5 min)                                              | Sleep between rate-limit retries       |
| `API_LIMIT_MAX_RETRIES`    | `5`                                                        | Max retry attempts per plan-role       |
| `MCP_BASE_URL`             | `http://localhost:3100`                                    | MCP server URL for plan sync           |

The `.env` loader lives in `env_config.py` — a shared module imported by both
`main.py` and `executor_cloud.py`. No `python-dotenv` dependency needed.

## CLI

```bash
python3 main.py --status                          # Pipeline observability report
python3 main.py --run planner                     # Run a single role
python3 main.py --all                             # Run all four roles sequentially
python3 main.py --plan 0075 [--force]             # Dispatch a single plan (bypasses cursor/pause)
python3 main.py --clean-test-artifacts            # Remove test BLOCK receipts
python3 main.py --supersede ticket-id [--supersede-replace] [--supersede-reason "reason"]
python3 main.py --cancel ticket-id [--cancel-reason "reason"]
```

## Crontab

```
*/3 * * * * cd /home/codex/dev/nexus/python/conduit && python3 main.py --all >> /tmp/pipeline-manager.log 2>&1
```
