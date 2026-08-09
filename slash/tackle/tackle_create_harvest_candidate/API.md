# Command

/tackle tackle_create_harvest_candidate

## Usage

Create a standalone harvest candidate in the Nebula RMS (e.g. manually linked to a harvest and/or project hierarchy).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `codeSnippets` | array | No | Extracted code snippets |
| `featureId` | string | No | Pre-linked feature UUID |
| `harvestId` | string | Yes | Parent harvest UUID |
| `implementationNotes` | array | No | Implementation notes array |
| `intentDescription` | string | No | What this candidate proposes |
| `openQuestions` | array | No | Open questions raised |
| `planRef` | string | No | Conduit plan reference — creates spawns_plan cross-reference |
| `status` | string | No | Status string |
| `subsystemId` | string | No | Pre-linked subsystem UUID |
| `systemId` | string | No | Pre-linked system UUID |
| `tags` | array<string> | No | Tags for filtering |
| `title` | string | Yes | Candidate title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `tackle-mcp`
- **Tool**: `tackle_create_harvest_candidate`
