# Command

/nebula nebula_create_harvest

## Usage

Record a new harvest pipeline output in the database. Version auto-increments per source_path+model.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `candidates` | array | No | Array of candidate objects |
| `level` | number | No | Abstraction level 1-4 (default 1) |
| `metadata` | string | No | Optional metadata object |
| `model` | string | No | Model used for harvest (e.g. 'DeepSeek V4') |
| `runMetadata` | string | No | Optional JSON metadata about this specific harvest run |
| `sourceFilename` | string | No | Display filename for the source |
| `sourceHash` | string | No | Override source content hash (MD5); auto-computed if omitted |
| `sourcePath` | string | Yes | Path to the source chat transcript |
| `sourceText` | string | No | Raw markdown text of the harvest file |
| `tags` | array<string> | No | Tags for filtering |
| `totalCandidates` | number | No | Total number of candidates extracted |
| `visibilityScope` | string | No | Visibility scope: builder, architect, planner, reviewer, all (default 'all') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_harvest`
