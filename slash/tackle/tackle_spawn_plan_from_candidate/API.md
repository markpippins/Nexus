# Command

/tackle tackle_spawn_plan_from_candidate

## Usage

Full spawn-plan flow in the Nebula RMS: link a harvest candidate to a system/subsystem, create a requirement derived from the candidate's title and intent, auto-upsert a harvest_context info tab, and optionally cross-reference a conduit plan — all in one atomic transaction. This is the primary tool for turning harvest specifications into actionable work.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No | Requirement description (defaults to candidate intent) |
| `featureId` | string | No | Optional feature UUID |
| `id` | string | Yes | Harvest candidate UUID |
| `planRef` | string | No | Optional conduit plan reference (e.g. '0136') — creates spawns_plan cross-reference |
| `priority` | string | No | Requirement priority: Low, Medium, High (default Medium) |
| `status` | string | No | Requirement status (default Backlog) |
| `subsystemId` | string | No | Optional subsystem UUID — requirement can live at system level |
| `systemId` | string | Yes | System UUID to link the candidate to |
| `title` | string | No | Requirement title (defaults to candidate title) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_spawn_plan_from_candidate`
