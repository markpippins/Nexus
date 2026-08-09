# Command

/vision vision_create_branch

## Usage

Create a new branch off a work request.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `branchId` | string | Yes | Unique branch ID |
| `forkPoint` | string | No | Artifact ID where branch diverged |
| `label` | string | No | Human-readable branch label |
| `parentBranchId` | string | No | Parent branch for forking |
| `status` | string | No | Branch status (default 'active') |
| `wrId` | string | Yes | Parent work request ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `vision-mcp`
- **Tool**: `vision_create_branch`
