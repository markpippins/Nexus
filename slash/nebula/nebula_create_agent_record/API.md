# Command

/nebula nebula_create_agent_record

## Usage

Create a new agent record in the database (canonical write path for all agent audit artifacts). Use this instead of writing to the filesystem.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | No | Markdown content body |
| `featureId` | string | No | Associated feature UUID |
| `level` | number | No | Abstraction level 1-4 (default 1) |
| `metadata` | string | No | Flexible JSON metadata |
| `planRef` | string | No | Conduit plan reference (e.g. '0136') |
| `recordType` | enum(report,analysis,assessment,inspection,prompt,response,engineering_log,architecture_note,decision) | Yes | Type of record |
| `role` | string | No | Agent role (architect, planner, builder, reviewer, critic, analyst, inspector, engineer) |
| `sourcePath` | string | No | Original filesystem path if migrating from audit/ |
| `subsystemId` | string | No | Associated subsystem UUID |
| `systemId` | string | No | Associated system UUID |
| `tags` | array<string> | No | Tags for filtering |
| `title` | string | No | Record title |
| `visibilityScope` | string | No | Visibility scope: builder, architect, planner, reviewer, all (default 'all') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_agent_record`
