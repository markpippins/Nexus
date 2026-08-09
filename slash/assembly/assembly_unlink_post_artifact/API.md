# Command

/assembly assembly_unlink_post_artifact

## Usage

Remove a post↔artifact link

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `artifact_id` | string | Yes | Artifact UUID |
| `artifact_type` | string | Yes | Type of domain artifact |
| `post_id` | string | Yes | Post UUID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_unlink_post_artifact`
