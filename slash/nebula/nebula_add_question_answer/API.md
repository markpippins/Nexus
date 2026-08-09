# Command

/nebula nebula_add_question_answer

## Usage

Add a new answer to an open question (multi-role deliberation). Multiple roles can answer the same question.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `answer` | string | Yes | The answer text |
| `confidence` | string | No | Confidence level: HIGH, MEDIUM, LOW (default: MEDIUM) |
| `questionId` | string | Yes | Question UUID to answer |
| `reasoning` | string | No | Step-by-step reasoning behind the answer |
| `role` | string | Yes | Who answered (role name, e.g. 'analyst', 'architect') |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_add_question_answer`
