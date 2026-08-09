# Command

/peb peb_validate_transform

## Usage

Validate a proposed Transform before execution (RGEM integration).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `context` | string | No | { rules, invariants, allowedTransforms, executionMode } |
| `entity_id` | string | Yes |  |
| `proposed_delta` | string | No | What the transform will change |
| `state_view` | string | No | What the transform needs to see |
| `work_request_id` | string | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_validate_transform`
