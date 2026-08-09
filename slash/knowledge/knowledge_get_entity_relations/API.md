# Command

/knowledge knowledge_get_entity_relations

## Usage

Get all relationships (inbound and outbound) for a specific entity by section + entity_id.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entity_id` | string | Yes | Entity ID |
| `section` | string | Yes | Section (e.g. 'types', 'actors') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_get_entity_relations`
