# Command

/peb peb_create_decision

## Usage

Create a new architecture decision record in peb.decisions. ADR number is auto-assigned if omitted.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `adr_number` | string | No | Explicit ADR number (auto-assigned if omitted) |
| `affected_keys` | array<string> | No | Policy keys this decision constrains |
| `author_id` | string | Yes | Author role or identifier |
| `entropy_class` | enum(structural,corrective,policy) | No | Change classification |
| `parent_decision_id` | string | No | UUID of parent decision (for supersession chain) |
| `status` | enum(proposed,accepted) | No | Initial status (default: proposed) |
| `summary` | string | No | Structured summary: { context, decision, consequences } |
| `title` | string | Yes | Decision title |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `peb-mcp`
- **Tool**: `peb_create_decision`
