# Command

/tackle tackle_get_plan_candidates

## Usage

Reverse lookup: find all harvest candidates linked to a conduit plan via cross_references (rel_type=spawns_plan) in the Nebula RMS.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `planRef` | string | Yes | Conduit plan reference (e.g. '0136') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_get_plan_candidates`
