# Command

/nebula nebula_get_plan_candidates

## Usage

Reverse lookup: find all harvest candidates linked to a given conduit plan via cross_references (rel_type='spawns_plan'). Returns candidates with their hierarchy links, harvest source, and the timestamp they were linked to the plan.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `planRef` | string | Yes | Conduit plan reference (e.g. '0136') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_get_plan_candidates`
