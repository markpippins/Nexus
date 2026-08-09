# Command

/knowledge knowledge_list_cross_references

## Usage

List cross-reference mappings between knowledge graph entities.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results |
| `map_name` | string | No | Filter by map name |
| `offset` | number | No | Pagination offset |
| `source_section` | string | No | Filter by source section |
| `target_id` | string | No | Filter by target ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_list_cross_references`
