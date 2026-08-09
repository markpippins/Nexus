# Command

/address-tts tts_synthesize

## Usage

Synthesize text to speech using Piper TTS. Returns audio path, URL, engine info, and duration. Use 'play: true' to play audio immediately on the server.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `play` | boolean | No | Whether to play the audio immediately (default true) |
| `text` | string | Yes | Text to synthesize and speak |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `address-tts-mcp`
- **Tool**: `tts_synthesize`
