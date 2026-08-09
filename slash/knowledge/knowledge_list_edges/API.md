# Command

/knowledge knowledge_list_edges

## Usage

List knowledge graph edges with optional filters by source, target, or relation type.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max results (1-500) |
| `offset` | number | No | Pagination offset |
| `relation_type` | string | No | Filter by relation type (e.g. 'produces', 'consumes', 'governed_by', 'references', 'depends_on') |
| `source_id` | string | No | Filter by source entity ID |
| `source_section` | string | No | Filter by source section |
| `target_id` | string | No | Filter by target entity ID |
| `target_section` | string | No | Filter by target section |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_list_edges`
