# Command

/conduit query_prompts

## Usage

Search captured prompts with lineage. Scans the PROMPTS directory for markdown files with YAML frontmatter and returns them as PromptEntry objects with support for search and location filters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `location` | string | No | Optional location filter: "active" or "archived" |
| `project` | string | No | Optional project name filter |
| `search` | string | No | Optional search term to filter by title, summary, or prompt number |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `query_prompts`
