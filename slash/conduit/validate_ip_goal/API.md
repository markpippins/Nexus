# Command

/conduit validate_ip_goal

## Usage

Validate an Implementation Plan goal string against the WRP grammar. Checks for forbidden execution verbs, procedural language, tool leakage, and collapsibility to WorkRequest opcodes.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `goal` | string | Yes | The goal string to validate |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `validate_ip_goal`
