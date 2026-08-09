# Command

/nebula nebula_answer_question

## Usage

Record an answer to an open question without resolving it. Status stays OPEN.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `answer` | string | Yes | The answer text |
| `answeredBy` | string | Yes | Who answered (role name, e.g. 'analyst') |
| `questionId` | string | Yes | Question UUID to answer |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `nebula-mcp`
- **Tool**: `nebula_answer_question`
