# Command

/knowledge knowledge_list_entities

## Usage

List knowledge graph entities with optional filters by section, entity_type, or status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `entity_type` | string | No | Filter by entity type |
| `limit` | number | No | Max results (1-500) |
| `offset` | number | No | Pagination offset |
| `search` | string | No | Full-text search across name and description |
| `section` | string | No | Filter by section (e.g. 'types', 'actors', 'decisions', 'rules') |
| `status` | string | No | Filter by status |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_list_entities`
