# Command

/nebula nebula_create_op_registry_entry

## Usage

Create a new Op Mapping Registry entry. Maps an Implementation Plan intent pattern to a WorkRequest opcode sequence. Entries are versioned and immutable after creation.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Unique entry ID (e.g. 'INIT_SERVICE_SCAFFOLD:v1') |
| `idempotency_key` | string | No | Default idempotency key template |
| `intent_id` | string | Yes | Intent identifier (e.g. 'INIT_SERVICE_SCAFFOLD') |
| `label` | string | No | Human-readable label |
| `match_patterns` | array<string> | No | Goal patterns to match against |
| `notes` | string | No | Human-readable notes |
| `opcode_template` | array | No | JSON array of opcode sequence templates |
| `optional_params` | array<string> | No | Optional parameter names |
| `postconditions` | array<string> | No | Postcondition descriptions |
| `preconditions` | array<string> | No | Precondition descriptions |
| `required_params` | array<string> | No | Required parameter names |
| `status` | string | No | Status: active, deprecated, superseded (default: active) |
| `version` | string | No | Semantic version (default: 'v1') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_op_registry_entry`
