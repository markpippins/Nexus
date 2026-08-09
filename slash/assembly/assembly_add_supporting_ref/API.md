# Command

/assembly assembly_add_supporting_ref

## Usage

Add a supporting reference (spec, cross_reference, source_url, evidence, attachment) to a post or comment

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `comment_id` | string | No | Comment UUID (omit if attaching to post) |
| `metadata` | object | No | Optional JSON metadata |
| `post_id` | string | No | Post UUID (omit if attaching to comment) |
| `ref_type` | enum(spec,cross_reference,source_url,evidence,attachment) | Yes | Type of supporting reference |
| `ref_value` | string | Yes | URL, spec ID, or reference value |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `assembly-mcp`
- **Tool**: `assembly_add_supporting_ref`
