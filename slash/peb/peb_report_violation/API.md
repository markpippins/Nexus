# Command

/peb peb_report_violation

## Usage

Route a detected violation. Bypasses admission invariant check.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `capability_attempted` | string | null | No |  |
| `context` | string | No | Full request context |
| `entity_id` | string | Yes |  |
| `severity` | enum(hard,soft) | Yes |  |
| `violation_type` | enum(authority_leakage,state_dependency,semantic_normalization,rcl_violation,transform_invalid) | Yes |  |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_report_violation`
