# Command

/tackle tackle_update_scheduler_entry

## Usage

Update an existing agent scheduler entry.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agent_config` | string | No | JSON agent config |
| `enabled` | number | No | 1 enabled, 0 disabled |
| `harness` | enum(opencode,conduit) | No | opencode or conduit |
| `id` | number | Yes | Scheduler entry ID |
| `last_run_at` | string | No | ISO timestamp of last run |
| `last_run_status` | string | No | Status of last run |
| `model_id` | string | No | Model ID |
| `project_dir` | string | No | Working directory |
| `role` | string | No | Agent role |
| `schedule_type` | enum(interval,cron) | No | interval or cron |
| `schedule_value` | number | No | Interval seconds or cron expression |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_update_scheduler_entry`
