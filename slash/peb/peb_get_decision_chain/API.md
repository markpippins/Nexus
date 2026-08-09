# Command

/peb peb_get_decision_chain

## Usage

Walk the decision ancestry or rollback chain from a given decision.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `direction` | enum(ancestry,rollback) | No | Walk direction (default: ancestry) |
| `id` | string | Yes | Starting decision UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_get_decision_chain`
