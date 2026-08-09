# Command

/conduit validate_implementation_plan

## Usage

Validate a full set of Implementation Plan fields against the WRP grammar. Returns findings for all rules and a cleanliness score (0-100).

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `acceptanceCriteria` | array<string> | No | Acceptance criteria |
| `content` | string | No | Plan content / body |
| `decompositionNodes` | array<object> | No | Decomposition nodes |
| `goal` | string | No | Plan goal |
| `openQuestions` | array<string> | No | Open questions |
| `title` | string | No | Plan title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `validate_implementation_plan`
