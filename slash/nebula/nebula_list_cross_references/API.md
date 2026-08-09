# Command

/nebula nebula_list_cross_references

## Usage

List cross-references between entities, optionally filtered by source/target type/id or relation type.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `relType` | string | No | Filter by relation type. Valid types: wrp:depends_on, wrp:implements, wrp:tracked_by, wrp:impacts_system, wrp:supersedes, ag:references_plan, ag:same_thread_as, ag:prompted_by, ag:spawns_plan, kv:sourced_from, kv:informs, kv:cross_schema, kv:name_overlap, kv:description_overlap |
| `sourceId` | string | No | Filter by source entity UUID |
| `sourceType` | string | No | Filter by source entity type (e.g. 'plan', 'agent_record') |
| `targetId` | string | No | Filter by target entity UUID |
| `targetType` | string | No | Filter by target entity type |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_list_cross_references`
