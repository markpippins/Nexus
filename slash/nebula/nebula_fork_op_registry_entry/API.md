# Command

/nebula nebula_fork_op_registry_entry

## Usage

Create a new version of an existing intent mapping (fork). The source entry is superseded and the new version becomes active.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `label` | string | No | New label (defaults to source label with version suffix) |
| `new_version` | string | Yes | New version string (e.g. 'v2') |
| `notes` | string | No | Notes about what changed in this version |
| `opcode_template` | array | No | Updated opcode template (defaults to source) |
| `required_params` | array<string> | No | Updated required params (defaults to source) |
| `source_id` | string | Yes | Source entry ID to fork from |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_fork_op_registry_entry`
