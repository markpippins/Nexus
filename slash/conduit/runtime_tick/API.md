# Command

/conduit runtime_tick

## Usage

Run ONE tick of the causal decision loop. Scans for the next runnable WorkRequest (VALIDATED→QUEUED, QUEUED→CLAIMED, CLAIMED→ACKED), applies the transition, and returns the result. Call this on a loop or after event submission to advance the system.

## Parameters

*No parameters required.*

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `conduit-mcp`
- **Tool**: `runtime_tick`
