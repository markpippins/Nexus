# Command

/nebula nebula_create_projection

## Usage

Create a new projection config for on-demand markdown folder generation.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `description` | string | No | Description of what this projection generates |
| `metadata` | string | No | Optional metadata |
| `model` | string | No | LLM model for inference type projections |
| `name` | string | Yes | Unique projection name |
| `schedule` | string | No | Optional cron expression for auto-regeneration |
| `sourceQuery` | string | No | SQL SELECT query that feeds the template (deterministic only) |
| `targetPath` | string | No | Relative output path under audit/ (e.g. 'ARCHITECTURE/reports/{{id}}.md') |
| `template` | string | No | Markdown template with {{placeholder}} syntax |
| `type` | enum(deterministic,inference) | Yes | deterministic (SQL+template) or inference (LLM) |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_create_projection`
