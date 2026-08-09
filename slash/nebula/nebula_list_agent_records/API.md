# Command

/nebula nebula_list_agent_records

## Usage

List agent audit records, optionally filtered by type, role, system/subsystem/feature, plan, multi-tag (AND conjunction), text search, date range, level, or visibility scope.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `createdAfter` | string | No | Filter records created at or after this ISO 8601 timestamp |
| `createdBefore` | string | No | Filter records created at or before this ISO 8601 timestamp |
| `featureId` | string | No | Filter by associated feature UUID |
| `level` | number | No | Filter by abstraction level (1-4) |
| `limit` | number | No | Max results (default 100, max 500) |
| `offset` | number | No | Offset for pagination |
| `planRef` | string | No | Filter by conduit plan reference (e.g. '0136') |
| `role` | string | No | Filter by agent role (architect, planner, builder, reviewer, critic, analyst, inspector, engineer) |
| `search` | string | No | Free-text search across title and content (case-insensitive ILIKE) |
| `subsystemId` | string | No | Filter by associated subsystem UUID |
| `systemId` | string | No | Filter by associated system UUID |
| `tag` | string | No | Filter by tag(s). Single string or array for AND conjunction (e.g. ['to:engineer', 'type:response']) |
| `type` | string | No | Filter by record type (report, analysis, assessment, inspection, prompt, response, engineering_log, architecture_note, decision) |
| `visibilityScope` | string | No | Filter by visibility scope (builder, architect, planner, reviewer, all) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_agent_records`
