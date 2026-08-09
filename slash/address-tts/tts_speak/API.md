# Command

/address-tts tts_speak

## Usage

Speak the latest state of a work request. Queries conduit.work_request_events and conduit.work_request_state to build a spoken summary of the current state and recent event history.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `play` | boolean | No | Whether to play the audio immediately (default true) |
| `work_request_id` | string | Yes | UUID of the work request to narrate |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `address-tts-mcp`
- **Tool**: `tts_speak`
