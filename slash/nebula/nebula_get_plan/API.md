# Command

/nebula nebula_get_plan

## Usage

Fetch one implementation plan by id (filename basename without .md). Collisions across status dirs resolve to the first match in order: pending → planning → proposed → completed.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Plan id (without .md extension), e.g. 'add-plans-display-endpoint-v0134' |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_get_plan`
