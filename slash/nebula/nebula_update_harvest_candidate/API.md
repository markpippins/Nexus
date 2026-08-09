# Command

/nebula nebula_update_harvest_candidate

## Usage

Update a harvest candidate — primarily used to link it to a system, subsystem, or feature in the Nebula project hierarchy. Also supports updating title, status, intent description, tags, work request linkage, and completion status.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `completed` | boolean | No | Mark candidate as completed (independent of work_request_id — useful for backfilling conduit-era work) |
| `featureId` | string | null | No | Link to feature UUID (or null to unlink) |
| `id` | string | Yes | Harvest candidate UUID |
| `intentDescription` | string | No | Revised intent description |
| `planRef` | string | No | Conduit plan reference (e.g. '0136') — creates a cross-reference linking this candidate to the plan with rel_type='spawns_plan' |
| `status` | string | No | Status (e.g. 'promoted', 'reviewed', 'discarded') |
| `subsystemId` | string | null | No | Link to subsystem UUID (or null to unlink) |
| `systemId` | string | null | No | Link to system UUID (or null to unlink) |
| `tags` | array<string> | No | New tags array |
| `title` | string | No | New title |
| `workRequestId` | string | No | Link to WRP runtime WorkRequest UUID — set when a WorkRequest is created for this candidate |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_update_harvest_candidate`
