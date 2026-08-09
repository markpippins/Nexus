# Command

/knowledge knowledge_get_entity

## Usage

Get a single knowledge graph entity by section and entity_id, including its full properties JSON.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entity_id` | string | Yes | Entity ID within the section |
| `section` | string | Yes | Section (e.g. 'types', 'actors', 'decisions') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_get_entity`
