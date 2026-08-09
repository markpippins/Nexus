# Command

/vision vision_create_artifact

## Usage

Create a new artifact (plan, patch, spec, etc.).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `artifactId` | string | No | Unique artifact ID |
| `confidence` | number | No | Confidence score |
| `content` | string | No | Artifact content (JSON) |
| `parentArtifactId` | string | No | Parent artifact for lineage |
| `provenance` | string | No | Source tracking info |
| `templateMetadata` | string | No | Templating metadata |
| `type` | string | Yes | Artifact type: PLAN, CRITIQUE, SPEC, EXECUTION, PATCH, SUMMARY |
| `wrId` | string | No | Associated work request ID |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `vision-mcp`
- **Tool**: `vision_create_artifact`
