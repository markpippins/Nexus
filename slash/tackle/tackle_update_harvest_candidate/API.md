# Command

/tackle tackle_update_harvest_candidate

## Usage

Update a harvest candidate — primarily to link it to a system, subsystem, or feature in the Nebula project hierarchy. Also supports setting a planRef to create a cross-reference (rel_type=spawns_plan) to a conduit plan.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `featureId` | string | No | Link to feature UUID (or null to unlink) |
| `id` | string | Yes | Harvest candidate UUID |
| `intentDescription` | string | No | Revised intent description |
| `planRef` | string | No | Conduit plan reference (e.g. '0136') — creates a cross-reference linking this candidate to the plan |
| `status` | string | No | Status (e.g. promoted, reviewed, discarded) |
| `subsystemId` | string | No | Link to subsystem UUID (or null to unlink) |
| `systemId` | string | No | Link to system UUID (or null to unlink) |
| `tags` | array<string> | No | New tags array |
| `title` | string | No | New title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_update_harvest_candidate`
