# Command

/nebula nebula_update_agent_record

## Usage

Update an existing agent record's fields.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | No | New markdown content |
| `featureId` | string | null | No | Associated feature UUID |
| `id` | string | Yes | Agent record UUID |
| `level` | number | No | New abstraction level (1-4) |
| `metadata` | string | No | New JSON metadata |
| `planRef` | string | null | No | Conduit plan reference |
| `subsystemId` | string | null | No | Associated subsystem UUID |
| `systemId` | string | null | No | Associated system UUID |
| `tags` | array<string> | No | New tags array |
| `title` | string | No | New title |
| `visibilityScope` | string | No | New visibility scope (builder, architect, planner, reviewer, all) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_agent_record`
