# Command

/nebula nebula_create_harvest_candidate

## Usage

Create a standalone harvest candidate (e.g. manually linked to a harvest or project).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `codeSnippets` | array | No | Extracted code snippets |
| `featureId` | string | null | No | Pre-linked feature UUID |
| `harvestId` | string | Yes | Parent harvest UUID |
| `implementationNotes` | array | No | Implementation notes array |
| `intentDescription` | string | No | What this candidate proposes to build or change |
| `openQuestions` | array | No | Open questions raised |
| `planRef` | string | No | Conduit plan reference (e.g. '0136') — creates a cross-reference with rel_type='spawns_plan' |
| `status` | string | No | Status string |
| `subsystemId` | string | null | No | Pre-linked subsystem UUID |
| `systemId` | string | null | No | Pre-linked system UUID |
| `tags` | array<string> | No | Tags for filtering |
| `title` | string | Yes | Candidate title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_harvest_candidate`
