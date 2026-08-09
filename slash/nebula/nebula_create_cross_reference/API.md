# Command

/nebula nebula_create_cross_reference

## Usage

Create a cross-reference link between two entities. Validates rel_type against the formal taxonomy.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `metadata` | string | No | Optional JSON metadata for the link |
| `relType` | string | Yes | Relation type. Valid types: wrp:depends_on, wrp:implements, wrp:tracked_by, wrp:impacts_system, wrp:supersedes, ag:references_plan, ag:same_thread_as, ag:prompted_by, ag:spawns_plan, kv:sourced_from, kv:informs, kv:cross_schema, kv:name_overlap, kv:description_overlap |
| `sourceId` | string | Yes | Source entity UUID |
| `sourceType` | string | Yes | Source entity type (e.g. 'plan', 'agent_record') |
| `targetId` | string | Yes | Target entity UUID |
| `targetType` | string | Yes | Target entity type |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_cross_reference`
