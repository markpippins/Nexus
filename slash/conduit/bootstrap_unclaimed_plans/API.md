# Command

/conduit bootstrap_unclaimed_plans

## Usage

Find pending plans without receipts and bootstrap their PLAN_CREATE receipt and builder ticket. Safe to call repeatedly; concurrent calls are single-flight.

## Parameters

*No parameters required.*

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `bootstrap_unclaimed_plans`
