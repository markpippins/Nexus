# Command

/tackle tackle_create_scheduler_entry

## Usage

Create a new agent scheduler entry to schedule periodic agent runs.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `agent_config` | string | No | Optional JSON agent config (title, extra_args, etc.) |
| `enabled` | number | No | 1 to enable, 0 to disable (default 1) |
| `harness` | enum(opencode,conduit) | No | opencode or conduit (default opencode) |
| `model_id` | string | No | Model ID for opencode harness runs |
| `project_dir` | string | No | Working directory (default /home/codex/dev) |
| `role` | string | Yes | Agent role (builder, planner, reviewer, critic, etc.) |
| `schedule_type` | enum(interval,cron) | No | interval or cron (default interval) |
| `schedule_value` | number | No | Interval in seconds (default 3600), or cron expression |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_create_scheduler_entry`
