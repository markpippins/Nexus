# Command

/assembly assembly_link_post_artifact

## Usage

Link a post (thread) to a domain artifact (intent_record, requirement, agenda_item, spec, implementation_plan)

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `artifact_id` | string | Yes | Artifact UUID in nebula schema |
| `artifact_type` | enum(intent_record,requirement,agenda_item,spec,implementation_plan) | Yes | Type of domain artifact |
| `label` | string | No | Optional label (e.g. 'proposes', 'discusses', 'resolves') |
| `post_id` | string | Yes | Post UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_link_post_artifact`
